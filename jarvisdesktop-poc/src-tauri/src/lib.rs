// JarvisDesktop — Rust backend (Tauri commands + agent loop).
//
// Architecture:
//   - claude.rs   — Anthropic Messages API client with tool_use loop
//   - tools.rs    — sandboxed filesystem + bash tool implementations
//   - memory.rs   — persistent memory (JSON for POC, SQLite later)
//   - projects.rs — active project tracking
//   - keychain.rs — macOS Keychain integration for API key

mod claude;
mod keychain;
mod memory;
mod projects;
mod tools;

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::{Mutex, RwLock};

use crate::claude::{ClaudeClient, ProgressEvent};
use crate::memory::Memory;
use crate::projects::{Project, ProjectStore};

// ──────────────────────────────────────────────────────────────
// Global app state
// ──────────────────────────────────────────────────────────────
pub struct AppState {
    pub memory: Arc<RwLock<Memory>>,
    pub projects: Arc<RwLock<ProjectStore>>,
    pub active_runs: Arc<Mutex<Vec<String>>>, // run IDs of in-flight agent calls (for abort)
}

// ──────────────────────────────────────────────────────────────
// Tauri commands — invoked from the React frontend via invoke()
// ──────────────────────────────────────────────────────────────

#[tauri::command]
async fn is_api_key_set() -> bool {
    keychain::has_key()
}

#[tauri::command]
async fn save_api_key(key: String) -> Result<(), String> {
    keychain::set_key(&key).map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_projects(state: State<'_, AppState>) -> Result<Vec<Project>, String> {
    let store = state.projects.read().await;
    Ok(store.list())
}

#[tauri::command]
async fn get_active_project(state: State<'_, AppState>) -> Result<Option<Project>, String> {
    let store = state.projects.read().await;
    Ok(store.active().cloned())
}

#[tauri::command]
async fn set_active_project(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut store = state.projects.write().await;
    store.set_active(&id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn open_project_in_browser(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let store = state.projects.read().await;
    let project = store.get(&id).ok_or_else(|| "Project not found".to_string())?;
    // Open the project folder in Finder + try opening index.html in browser
    let _ = open::that(&project.path);
    let index = std::path::Path::new(&project.path).join("index.html");
    if index.exists() {
        let _ = open::that(&index);
    }
    Ok(())
}

#[tauri::command]
async fn list_memory_facts(state: State<'_, AppState>) -> Result<Vec<memory::MemoryFact>, String> {
    let mem = state.memory.read().await;
    Ok(mem.list())
}

#[tauri::command]
async fn forget_memory_fact(state: State<'_, AppState>, key: String) -> Result<(), String> {
    let mut mem = state.memory.write().await;
    mem.forget(&key).map_err(|e| e.to_string())
}

/// IMPORTANT: the frontend pre-generates `run_id` and subscribes to event
/// channels BEFORE invoking this command. We then sleep 80ms before the first
/// emit so any remaining listener-setup latency on the JS side is absorbed.
/// Combined, this eliminates the "first events go to /dev/null" race.
#[tauri::command]
async fn start_agent_run(
    app: AppHandle,
    state: State<'_, AppState>,
    run_id: String,
    prompt: String,
    project_id: Option<String>,
) -> Result<(), String> {
    tracing::info!(%run_id, project_id = ?project_id, "start_agent_run invoked");
    state.active_runs.lock().await.push(run_id.clone());

    let api_key = match keychain::get_key() {
        Ok(k) => k,
        Err(e) => {
            tracing::error!(error = %e, "API key not in Keychain");
            let _ = app.emit(&format!("agent:error:{}", run_id), format!("API key not configured: {}", e));
            return Ok(());
        }
    };
    if !api_key.starts_with("sk-ant-") {
        tracing::error!("API key does not look like an Anthropic key");
        let _ = app.emit(&format!("agent:error:{}", run_id), "Stored API key doesn't look right. Re-enter it from the menu.");
        return Ok(());
    }

    let memory = state.memory.clone();
    let projects = state.projects.clone();
    let active_runs = state.active_runs.clone();
    let run_id_clone = run_id.clone();
    let app_clone = app.clone();

    tokio::spawn(async move {
        // 80ms grace period to absorb any residual listener-attach latency
        tokio::time::sleep(std::time::Duration::from_millis(80)).await;

        let client = ClaudeClient::new(api_key);
        let emit_progress = {
            let app = app_clone.clone();
            let run_id = run_id_clone.clone();
            move |event: ProgressEvent| {
                tracing::debug!(?event, "emit progress");
                let _ = app.emit(&format!("agent:progress:{}", run_id), event);
            }
        };

        // Resolve / create the active project
        tracing::info!("resolving project");
        let project = {
            let mut store = projects.write().await;
            match project_id.as_deref() {
                Some(id) => store.get(id).cloned(),
                None => {
                    let name = derive_project_name(&prompt);
                    match store.create(&name) {
                        Ok(p) => {
                            tracing::info!(project_id = %p.id, path = %p.path, "created new project");
                            Some(p)
                        }
                        Err(e) => {
                            tracing::error!(error = %e, "failed to create project");
                            let _ = app_clone.emit(&format!("agent:error:{}", run_id_clone), format!("Could not create project folder: {}", e));
                            return;
                        }
                    }
                }
            }
        };
        let project = match project {
            Some(p) => p,
            None => {
                let _ = app_clone.emit(&format!("agent:error:{}", run_id_clone), "No project context");
                return;
            }
        };

        tracing::info!(project_path = %project.path, "starting Claude agent loop");
        match client
            .run_agent(&prompt, &project, memory.clone(), emit_progress)
            .await
        {
            Ok(summary) => {
                tracing::info!(input = summary.usage.input_tokens, output = summary.usage.output_tokens, "agent run done");
                let _ = app_clone.emit(&format!("agent:done:{}", run_id_clone), summary);
            }
            Err(e) => {
                tracing::error!(error = %e, "agent run failed");
                let _ = app_clone.emit(&format!("agent:error:{}", run_id_clone), e.to_string());
            }
        }

        let mut runs = active_runs.lock().await;
        runs.retain(|r| r != &run_id_clone);
    });

    Ok(())
}

#[tauri::command]
async fn abort_agent_run(state: State<'_, AppState>, run_id: String) -> Result<(), String> {
    // Soft cancel — just remove from active list. The agent loop checks active_runs
    // each iteration and exits gracefully if its run_id has been removed.
    let mut runs = state.active_runs.lock().await;
    runs.retain(|r| r != &run_id);
    Ok(())
}

fn derive_project_name(prompt: &str) -> String {
    // Take first 4-5 words, slugify
    let stop_words = ["a", "an", "the", "for", "me", "i", "want", "to", "build", "make", "create"];
    let words: Vec<String> = prompt
        .split_whitespace()
        .map(|w| w.trim_matches(|c: char| !c.is_alphanumeric()).to_lowercase())
        .filter(|w| !w.is_empty() && !stop_words.contains(&w.as_str()))
        .take(5)
        .collect();
    if words.is_empty() {
        return format!("project-{}", chrono::Utc::now().format("%Y%m%d-%H%M"));
    }
    words.join("-")
}

// ──────────────────────────────────────────────────────────────
// Entry
// ──────────────────────────────────────────────────────────────
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "jarvisdesktop=debug,info".into()),
        )
        .init();

    tracing::info!("Starting JarvisDesktop…");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let projects = ProjectStore::load().expect("load projects");
            let memory = Memory::load().expect("load memory");
            app.manage(AppState {
                memory: Arc::new(RwLock::new(memory)),
                projects: Arc::new(RwLock::new(projects)),
                active_runs: Arc::new(Mutex::new(Vec::new())),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            is_api_key_set,
            save_api_key,
            start_agent_run,
            abort_agent_run,
            list_projects,
            get_active_project,
            set_active_project,
            open_project_in_browser,
            list_memory_facts,
            forget_memory_fact,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
