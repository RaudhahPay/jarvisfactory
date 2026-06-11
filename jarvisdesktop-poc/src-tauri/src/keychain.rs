// macOS Keychain integration for the Anthropic API key.
// Key never leaves the user's Mac. Stored under com.raudhahtech.jarvisdesktop / anthropic-api-key.

use anyhow::{Context, Result};

const SERVICE: &str = "com.raudhahtech.jarvisdesktop";
const USERNAME: &str = "anthropic-api-key";

pub fn has_key() -> bool {
    keyring::Entry::new(SERVICE, USERNAME)
        .ok()
        .and_then(|e| e.get_password().ok())
        .map(|p| !p.is_empty())
        .unwrap_or(false)
}

pub fn get_key() -> Result<String> {
    let entry = keyring::Entry::new(SERVICE, USERNAME)
        .context("Could not open Keychain entry")?;
    entry.get_password().context("API key not found in Keychain")
}

pub fn set_key(key: &str) -> Result<()> {
    let entry = keyring::Entry::new(SERVICE, USERNAME)
        .context("Could not open Keychain entry")?;
    entry.set_password(key).context("Could not save API key to Keychain")?;
    Ok(())
}
