// Claude (Anthropic) Messages API client with tool_use agentic loop.
// Streams progress events back to the UI via the callback while running.

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::memory::Memory;
use crate::projects::Project;
use crate::tools;

const ANTHROPIC_API: &str = "https://api.anthropic.com/v1/messages";
const MODEL: &str = "claude-sonnet-4-6";
const MAX_ITERATIONS: usize = 20;
const MAX_TOKENS: u32 = 16_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ProgressEvent {
    Thinking { text: String },
    Writing { file: String },
    Reading { file: String },
    Running { command: String },
    Memorized { fact: String },
    Done { summary: String },
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct UsageStats {
    #[serde(rename = "inputTokens")]
    pub input_tokens: u64,
    #[serde(rename = "outputTokens")]
    pub output_tokens: u64,
    #[serde(rename = "costUsd")]
    pub cost_usd: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AgentRunSummary {
    #[serde(rename = "finalMessage")]
    pub final_message: String,
    pub usage: UsageStats,
    #[serde(rename = "projectPath")]
    pub project_path: Option<String>,
    #[serde(rename = "openedInBrowser")]
    pub opened_in_browser: bool,
}

pub struct ClaudeClient {
    api_key: String,
    http: reqwest::Client,
}

impl ClaudeClient {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(180))
                .build()
                .expect("build http client"),
        }
    }

    pub async fn run_agent<F>(
        &self,
        prompt: &str,
        project: &Project,
        memory: Arc<RwLock<Memory>>,
        mut emit: F,
    ) -> Result<AgentRunSummary>
    where
        F: FnMut(ProgressEvent) + Send + 'static,
    {
        let system_prompt = build_system_prompt(project, &memory).await;
        let tools_schema = build_tools_schema();

        // Conversation history
        let mut messages: Vec<Value> = vec![json!({
            "role": "user",
            "content": prompt,
        })];

        let mut total_input_tokens: u64 = 0;
        let mut total_output_tokens: u64 = 0;
        let mut final_text = String::new();
        let mut opened_in_browser = false;

        emit(ProgressEvent::Thinking { text: "Reading your request…".into() });

        for iter in 0..MAX_ITERATIONS {
            tracing::debug!("agent iteration {}", iter + 1);

            let body = json!({
                "model": MODEL,
                "max_tokens": MAX_TOKENS,
                "system": system_prompt,
                "tools": tools_schema,
                "messages": messages,
            });

            let response = self
                .http
                .post(ANTHROPIC_API)
                .header("x-api-key", &self.api_key)
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .json(&body)
                .send()
                .await
                .context("Anthropic request failed")?;

            if !response.status().is_success() {
                let status = response.status();
                let text = response.text().await.unwrap_or_default();
                return Err(anyhow!("Anthropic API error {}: {}", status, text));
            }

            let resp_json: Value = response.json().await.context("Could not parse Anthropic response")?;
            let usage = &resp_json["usage"];
            total_input_tokens += usage["input_tokens"].as_u64().unwrap_or(0);
            total_output_tokens += usage["output_tokens"].as_u64().unwrap_or(0);

            let content = resp_json["content"].as_array().cloned().unwrap_or_default();
            let stop_reason = resp_json["stop_reason"].as_str().unwrap_or("end_turn").to_string();

            // Track text + tool_use blocks
            let mut tool_uses: Vec<(String, String, Value)> = Vec::new(); // (id, name, input)
            for block in &content {
                match block["type"].as_str() {
                    Some("text") => {
                        if let Some(t) = block["text"].as_str() {
                            if !t.trim().is_empty() {
                                emit(ProgressEvent::Thinking { text: short_thinking(t) });
                                final_text = t.to_string();
                            }
                        }
                    }
                    Some("tool_use") => {
                        let id = block["id"].as_str().unwrap_or("").to_string();
                        let name = block["name"].as_str().unwrap_or("").to_string();
                        let input = block["input"].clone();
                        tool_uses.push((id, name, input));
                    }
                    _ => {}
                }
            }

            // Append assistant turn
            messages.push(json!({ "role": "assistant", "content": content }));

            if tool_uses.is_empty() {
                // No more tools to call — we're done
                break;
            }

            // Execute each tool, collect results
            let mut tool_results: Vec<Value> = Vec::new();
            for (id, name, input) in tool_uses {
                let result = execute_tool(&name, &input, project, memory.clone(), &mut emit).await;
                let (content_str, is_error) = match result {
                    Ok(s) => (s, false),
                    Err(e) => (format!("ERROR: {}", e), true),
                };

                // Detect "opened in browser" side-effect
                if name == "open_in_browser" && !is_error {
                    opened_in_browser = true;
                }

                tool_results.push(json!({
                    "type": "tool_result",
                    "tool_use_id": id,
                    "content": content_str,
                    "is_error": is_error,
                }));
            }
            messages.push(json!({ "role": "user", "content": tool_results }));

            if stop_reason == "end_turn" {
                break;
            }
        }

        let cost = estimate_cost(total_input_tokens, total_output_tokens);
        emit(ProgressEvent::Done {
            summary: if final_text.is_empty() {
                "Build complete.".into()
            } else {
                short_thinking(&final_text)
            },
        });

        Ok(AgentRunSummary {
            final_message: if final_text.is_empty() { "All done.".into() } else { final_text },
            usage: UsageStats {
                input_tokens: total_input_tokens,
                output_tokens: total_output_tokens,
                cost_usd: cost,
            },
            project_path: Some(project.path.clone()),
            opened_in_browser,
        })
    }
}

// ──────────────────────────────────────────────────────────────
// System prompt
// ──────────────────────────────────────────────────────────────
async fn build_system_prompt(project: &Project, memory: &Arc<RwLock<Memory>>) -> String {
    let mem = memory.read().await;
    let memory_block = mem.as_prompt_block();

    format!(
        r#"You are JARVIS — a friendly, capable AI builder running inside JarvisDesktop on Coach Fadzil's Mac.

You build things for people who don't code. Web apps, scripts, Mac automations, anything. The user describes what they want; you actually build it using the tools below.

═══ STYLE ═══
- Talk like a thoughtful colleague, never like a chatbot. Short sentences. No "I'll be happy to help!" filler.
- When you write to a file, say "Writing index.html" not "Creating an HTML document".
- When you finish, say what was built and how to use it in one short paragraph. No bullet lists unless the user asks.

═══ TOOLS ═══
You have these tools. Use them liberally — that's how things get built.
- read_file(path)        → read a file in the active project
- write_file(path, content) → create or overwrite a file in the active project
- list_dir(path)         → list files/folders in the active project
- run_bash(command)      → run a shell command, cwd is the project folder (5s timeout)
- open_in_browser()      → open the project's index.html in the default browser (or just the folder if no index)
- remember(key, value)   → save a user preference / fact persistently (next session JARVIS still knows)

═══ PROJECT SANDBOX ═══
Active project folder: {project_path}
You can ONLY read/write inside that folder. Trying to escape it will fail.

═══ BUILD STYLE FOR HTML APPS ═══
When the user asks for a web app / tool, output single-file HTML (DOCTYPE + inline <style> + inline <script>) saved as index.html in the project root. Make it beautiful — use proper typography (system fonts), generous whitespace, modern rounded corners, smooth transitions. Mobile-responsive. No frameworks unless explicitly requested.

After writing the file(s), call open_in_browser so the user sees the result immediately.

═══ MEMORY ═══
If the user states a preference ("I want dark mode by default", "Always use Bahasa Malaysia", "My business is named Brainy Bunch"), call remember() to save it. Apply remembered preferences automatically in future builds without asking.

{memory_block}

═══ TASK ═══
The user is about to give you something to build. Do it.
"#,
        project_path = project.path,
        memory_block = memory_block,
    )
}

// ──────────────────────────────────────────────────────────────
// Tool schema (sent to Claude)
// ──────────────────────────────────────────────────────────────
fn build_tools_schema() -> Value {
    json!([
        {
            "name": "read_file",
            "description": "Read a file from the active project folder. Returns up to 1MB of UTF-8 text.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Relative path within the project, e.g. 'index.html' or 'src/main.js'" }
                },
                "required": ["path"]
            }
        },
        {
            "name": "write_file",
            "description": "Create a new file or overwrite an existing one in the active project folder. Path is relative to project root. Parent folders are created automatically.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "content": { "type": "string" }
                },
                "required": ["path", "content"]
            }
        },
        {
            "name": "list_dir",
            "description": "List files and folders inside the active project. Empty path = project root.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Relative path, or empty string for project root" }
                }
            }
        },
        {
            "name": "run_bash",
            "description": "Run a shell command with cwd set to the project folder. 5-second timeout. Returns combined stdout + stderr. Useful for npm, pip, mkdir, ls, cat, simple file operations. Will fail on rm -rf /, sudo, curl, wget, ssh.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "command": { "type": "string" }
                },
                "required": ["command"]
            }
        },
        {
            "name": "open_in_browser",
            "description": "Open the project's index.html in the user's default browser. Also opens the project folder in Finder. Call this when the build is ready for the user to see.",
            "input_schema": {
                "type": "object",
                "properties": {}
            }
        },
        {
            "name": "remember",
            "description": "Save a user preference or fact to persistent memory. Use when the user states something like 'always do X' or 'my company is Y'. Will be applied automatically in future builds.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "key":   { "type": "string", "description": "Short identifier, e.g. 'theme', 'language', 'business_name'" },
                    "value": { "type": "string", "description": "The fact or preference, e.g. 'dark mode by default'" }
                },
                "required": ["key", "value"]
            }
        }
    ])
}

// ──────────────────────────────────────────────────────────────
// Tool execution dispatcher
// ──────────────────────────────────────────────────────────────
async fn execute_tool<F>(
    name: &str,
    input: &Value,
    project: &Project,
    memory: Arc<RwLock<Memory>>,
    emit: &mut F,
) -> Result<String>
where
    F: FnMut(ProgressEvent),
{
    match name {
        "read_file" => {
            let path = input["path"].as_str().unwrap_or_default();
            emit(ProgressEvent::Reading { file: path.to_string() });
            tools::read_file(project, path)
        }
        "write_file" => {
            let path = input["path"].as_str().unwrap_or_default();
            let content = input["content"].as_str().unwrap_or_default();
            emit(ProgressEvent::Writing { file: path.to_string() });
            let n = tools::write_file(project, path, content)?;
            Ok(format!("Wrote {} bytes to {}", n, path))
        }
        "list_dir" => {
            let path = input["path"].as_str().unwrap_or_default();
            let entries = tools::list_dir(project, path)?;
            if entries.is_empty() { Ok("(empty)".into()) }
            else { Ok(entries.join("\n")) }
        }
        "run_bash" => {
            let cmd = input["command"].as_str().unwrap_or_default();
            emit(ProgressEvent::Running { command: cmd.to_string() });
            tools::run_bash(project, cmd).await
        }
        "open_in_browser" => {
            let folder = std::path::Path::new(&project.path);
            let index = folder.join("index.html");
            if index.exists() { let _ = open::that(&index); }
            let _ = open::that(folder);
            Ok("Opened in browser.".into())
        }
        "remember" => {
            let key = input["key"].as_str().unwrap_or_default();
            let value = input["value"].as_str().unwrap_or_default();
            if key.is_empty() || value.is_empty() {
                return Err(anyhow!("remember needs both key and value"));
            }
            emit(ProgressEvent::Memorized { fact: format!("{} = {}", key, value) });
            memory.write().await.remember(key, value, "user")?;
            Ok(format!("Saved: {} = {}", key, value))
        }
        _ => Err(anyhow!("Unknown tool: {}", name)),
    }
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────
fn short_thinking(s: &str) -> String {
    // Trim to first sentence + ellipsis; useful as a one-line live thought.
    let trimmed = s.trim();
    let end = trimmed
        .find(|c: char| matches!(c, '.' | '?' | '!' | '\n'))
        .map(|i| i + 1)
        .unwrap_or_else(|| trimmed.len().min(120));
    let mut out: String = trimmed.chars().take(end).collect();
    if out.len() < trimmed.len() { out.push('…'); }
    out
}

fn estimate_cost(input_tokens: u64, output_tokens: u64) -> f64 {
    // Sonnet 4.6 pricing as of May 2026: $3 / 1M input, $15 / 1M output
    let in_cost = (input_tokens as f64) / 1_000_000.0 * 3.0;
    let out_cost = (output_tokens as f64) / 1_000_000.0 * 15.0;
    (in_cost + out_cost * 100.0).round() / 100.0   // 2 dp
}
