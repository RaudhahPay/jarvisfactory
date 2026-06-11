// Per-user project store. Each project = one folder in ~/JarvisDesktop/Projects/<slug>/.
// Metadata persisted to ~/JarvisDesktop/projects.json.

use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    #[serde(rename = "lastPrompt")]
    pub last_prompt: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    #[serde(rename = "updatedAt")]
    pub updated_at: i64,
}

#[derive(Default, Serialize, Deserialize)]
struct StoreFile {
    projects: Vec<Project>,
    active_id: Option<String>,
}

pub struct ProjectStore {
    file: StoreFile,
    path: PathBuf,
}

fn root() -> Result<PathBuf> {
    let home = directories::UserDirs::new()
        .context("No user directories")?
        .home_dir()
        .to_path_buf();
    Ok(home.join("JarvisDesktop"))
}

fn store_path() -> Result<PathBuf> {
    Ok(root()?.join("projects.json"))
}

impl ProjectStore {
    pub fn load() -> Result<Self> {
        let path = store_path()?;
        fs::create_dir_all(root()?.join("Projects"))?;
        let file = if path.exists() {
            let s = fs::read_to_string(&path)?;
            serde_json::from_str(&s).unwrap_or_default()
        } else {
            StoreFile::default()
        };
        Ok(Self { file, path })
    }

    fn persist(&self) -> Result<()> {
        let s = serde_json::to_string_pretty(&self.file)?;
        fs::write(&self.path, s)?;
        Ok(())
    }

    pub fn list(&self) -> Vec<Project> {
        let mut v = self.file.projects.clone();
        v.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        v
    }

    pub fn get(&self, id: &str) -> Option<&Project> {
        self.file.projects.iter().find(|p| p.id == id)
    }

    pub fn active(&self) -> Option<&Project> {
        self.file.active_id.as_ref().and_then(|id| self.get(id))
    }

    pub fn set_active(&mut self, id: &str) -> Result<()> {
        if !self.file.projects.iter().any(|p| p.id == id) {
            anyhow::bail!("Project not found: {}", id);
        }
        self.file.active_id = Some(id.to_string());
        self.persist()
    }

    pub fn create(&mut self, name_hint: &str) -> Result<Project> {
        // Slugify, ensure uniqueness on disk
        let base_slug = slugify(name_hint);
        let mut slug = base_slug.clone();
        let projects_dir = root()?.join("Projects");
        let mut n = 1;
        while projects_dir.join(&slug).exists() || self.file.projects.iter().any(|p| p.name == slug) {
            n += 1;
            slug = format!("{}-{}", base_slug, n);
        }
        let path = projects_dir.join(&slug);
        fs::create_dir_all(&path)?;
        let now = Utc::now().timestamp_millis();
        let project = Project {
            id: uuid::Uuid::new_v4().to_string(),
            name: slug,
            path: dunce::canonicalize(&path)?.to_string_lossy().to_string(),
            last_prompt: None,
            created_at: now,
            updated_at: now,
        };
        self.file.projects.push(project.clone());
        self.file.active_id = Some(project.id.clone());
        self.persist()?;
        Ok(project)
    }

    pub fn touch(&mut self, id: &str, last_prompt: &str) -> Result<()> {
        if let Some(p) = self.file.projects.iter_mut().find(|p| p.id == id) {
            p.last_prompt = Some(last_prompt.to_string());
            p.updated_at = Utc::now().timestamp_millis();
            self.persist()?;
        }
        Ok(())
    }
}

fn slugify(s: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;
    for ch in s.chars() {
        let lower = ch.to_ascii_lowercase();
        if lower.is_ascii_alphanumeric() {
            out.push(lower);
            prev_dash = false;
        } else if !prev_dash && !out.is_empty() {
            out.push('-');
            prev_dash = true;
        }
    }
    let trimmed: String = out.trim_matches('-').to_string();
    if trimmed.is_empty() {
        format!("project-{}", Utc::now().format("%Y%m%d-%H%M%S"))
    } else {
        trimmed.chars().take(40).collect()
    }
}

#[allow(dead_code)]
pub fn project_root() -> Result<PathBuf> { root() }

#[allow(dead_code)]
pub fn within_project(project: &Project, path: &Path) -> bool {
    let project_root = Path::new(&project.path);
    dunce::canonicalize(path)
        .map(|p| p.starts_with(project_root))
        .unwrap_or(false)
}
