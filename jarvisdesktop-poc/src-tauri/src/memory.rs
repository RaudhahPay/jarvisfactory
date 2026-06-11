// Persistent memory store. POC uses a single JSON file at ~/JarvisDesktop/memory.json.
// Upgrade to SQLite post-POC for better querying + multi-namespace.

use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryFact {
    pub key: String,
    pub value: String,
    pub source: String, // "user" | "inferred"
    #[serde(rename = "createdAt")]
    pub created_at: i64,
}

#[derive(Default, Serialize, Deserialize)]
struct MemoryFile {
    facts: BTreeMap<String, MemoryFact>,
}

pub struct Memory {
    file: MemoryFile,
    path: PathBuf,
}

fn store_path() -> Result<PathBuf> {
    let home = directories::UserDirs::new()
        .context("No user directories")?
        .home_dir()
        .to_path_buf();
    let dir = home.join("JarvisDesktop");
    fs::create_dir_all(&dir)?;
    Ok(dir.join("memory.json"))
}

impl Memory {
    pub fn load() -> Result<Self> {
        let path = store_path()?;
        let file = if path.exists() {
            let s = fs::read_to_string(&path)?;
            serde_json::from_str(&s).unwrap_or_default()
        } else {
            MemoryFile::default()
        };
        Ok(Self { file, path })
    }

    fn persist(&self) -> Result<()> {
        let s = serde_json::to_string_pretty(&self.file)?;
        fs::write(&self.path, s)?;
        Ok(())
    }

    pub fn remember(&mut self, key: &str, value: &str, source: &str) -> Result<()> {
        self.file.facts.insert(
            key.to_string(),
            MemoryFact {
                key: key.to_string(),
                value: value.to_string(),
                source: source.to_string(),
                created_at: Utc::now().timestamp_millis(),
            },
        );
        self.persist()
    }

    pub fn recall(&self, key: &str) -> Option<&MemoryFact> {
        self.file.facts.get(key)
    }

    pub fn list(&self) -> Vec<MemoryFact> {
        let mut v: Vec<MemoryFact> = self.file.facts.values().cloned().collect();
        v.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        v
    }

    pub fn forget(&mut self, key: &str) -> Result<()> {
        self.file.facts.remove(key);
        self.persist()
    }

    /// Format all known facts as a brief block to inject into the system prompt.
    /// Returns empty string if no facts.
    pub fn as_prompt_block(&self) -> String {
        if self.file.facts.is_empty() {
            return String::new();
        }
        let mut s = String::from("\n\nKNOWN USER PREFERENCES (apply unless overridden):\n");
        for f in self.file.facts.values() {
            s.push_str(&format!("- {} = {}\n", f.key, f.value));
        }
        s
    }
}
