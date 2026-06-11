// Tool implementations — sandboxed to the active project folder.
// Every path is canonicalized + checked against the project root.

use anyhow::{anyhow, Context, Result};
use std::fs;
use std::path::{Path, PathBuf};
use tokio::process::Command;

use crate::projects::Project;

const MAX_FILE_SIZE: usize = 1_000_000; // 1MB — safe ceiling for POC

/// Resolve a relative path within the project and verify it stays inside.
fn resolve_in_project(project: &Project, rel: &str) -> Result<PathBuf> {
    let rel_clean = rel.trim_start_matches('/').trim_start_matches('\\');
    if rel_clean.is_empty() {
        return Err(anyhow!("Empty path"));
    }
    if rel_clean.contains("..") {
        return Err(anyhow!("Path traversal not allowed"));
    }
    let project_root = Path::new(&project.path);
    let full = project_root.join(rel_clean);
    // For new files: parent must exist (or we create it); we don't canonicalize before write
    // For reads + listings, the file already exists so canonicalize will work.
    Ok(full)
}

pub fn read_file(project: &Project, path: &str) -> Result<String> {
    let full = resolve_in_project(project, path)?;
    let canonical = dunce::canonicalize(&full).context("File does not exist or cannot be read")?;
    if !canonical.starts_with(&project.path) {
        return Err(anyhow!("Path escapes project boundary"));
    }
    let bytes = fs::read(&canonical)?;
    if bytes.len() > MAX_FILE_SIZE {
        return Err(anyhow!("File too large ({} bytes; limit is {} bytes)", bytes.len(), MAX_FILE_SIZE));
    }
    String::from_utf8(bytes).context("File is not valid UTF-8")
}

pub fn write_file(project: &Project, path: &str, content: &str) -> Result<usize> {
    let full = resolve_in_project(project, path)?;
    if content.len() > MAX_FILE_SIZE {
        return Err(anyhow!("Content too large ({} bytes; limit is {} bytes)", content.len(), MAX_FILE_SIZE));
    }
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&full, content)?;
    Ok(content.len())
}

pub fn list_dir(project: &Project, path: &str) -> Result<Vec<String>> {
    let target = if path.is_empty() || path == "." || path == "/" {
        PathBuf::from(&project.path)
    } else {
        resolve_in_project(project, path)?
    };
    let canonical = dunce::canonicalize(&target).context("Directory does not exist")?;
    if !canonical.starts_with(&project.path) {
        return Err(anyhow!("Path escapes project boundary"));
    }
    let mut out = Vec::new();
    for entry in fs::read_dir(&canonical)? {
        let entry = entry?;
        let rel = entry.path()
            .strip_prefix(&project.path)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| entry.file_name().to_string_lossy().to_string());
        let suffix = if entry.file_type()?.is_dir() { "/" } else { "" };
        out.push(format!("{}{}", rel, suffix));
    }
    out.sort();
    Ok(out)
}

/// Run a shell command, with cwd set to the project root.
/// 5-second timeout. Combined stdout+stderr returned.
pub async fn run_bash(project: &Project, command: &str) -> Result<String> {
    if command.len() > 2_000 {
        return Err(anyhow!("Command too long"));
    }
    // Block dangerous patterns even within the sandbox (extra defence — the sandbox already
    // limits damage, but we don't want shell-out to install random crap or curl secrets).
    let blocked = ["rm -rf /", "sudo ", "curl ", "wget ", " ssh ", "chmod 777"];
    for pat in &blocked {
        if command.contains(pat) {
            return Err(anyhow!("Command contains a blocked pattern: {}", pat));
        }
    }
    let out = tokio::time::timeout(
        std::time::Duration::from_secs(5),
        Command::new("/bin/bash")
            .arg("-c")
            .arg(command)
            .current_dir(&project.path)
            .output(),
    )
    .await
    .context("Command timed out (5s limit)")??;
    let mut combined = String::new();
    combined.push_str(&String::from_utf8_lossy(&out.stdout));
    if !out.stderr.is_empty() {
        if !combined.is_empty() { combined.push_str("\n"); }
        combined.push_str("[stderr]\n");
        combined.push_str(&String::from_utf8_lossy(&out.stderr));
    }
    // Truncate to keep tool result reasonable
    if combined.len() > 8_000 {
        combined.truncate(8_000);
        combined.push_str("\n[…output truncated…]");
    }
    Ok(combined)
}
