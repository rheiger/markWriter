//! Local, atomic JSON storage. No caller-supplied filesystem paths in production commands.
use serde_json::Value;
use std::path::Path;
use std::io::Write;

pub fn read_json(path: &Path) -> Result<Option<Value>, String> {
    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Cannot read {}: {}", path.display(), error)),
    };
    let value: Value = serde_json::from_slice(&bytes).map_err(|error| format!("Invalid local storage at {} (original retained): {}", path.display(), error))?;
    if !value.is_object() { return Err(format!("Invalid local storage at {} (original retained)", path.display())); }
    Ok(Some(value))
}

pub fn write_json(path: &Path, value: &Value) -> Result<(), String> {
    if value.get("version").and_then(Value::as_u64) != Some(1) { return Err("Unsupported storage version".into()); }
    let run = || -> Result<(), Box<dyn std::error::Error>> {
        let parent = path.parent().ok_or("Missing storage directory")?;
        std::fs::create_dir_all(parent)?;
        // Preserve the prior original even when it is malformed or from a newer version.
        if path.exists() {
            let backup = path.with_extension("previous.json");
            let previous = std::fs::read(path)?;
            if serde_json::from_slice::<Value>(&previous).ok().and_then(|v| v.get("version").and_then(Value::as_u64)) != Some(1) {
                let archive = path.with_extension(format!("retained-{}.json", uuid::Uuid::new_v4()));
                std::fs::copy(path, archive)?;
            }
            let mut prior = tempfile::NamedTempFile::new_in(parent)?;
            prior.write_all(&previous)?;
            prior.as_file().sync_all()?;
            prior.persist(backup)?;
        }
        let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
        #[cfg(unix)] {
            use std::os::unix::fs::PermissionsExt;
            temporary.as_file().set_permissions(std::fs::Permissions::from_mode(0o600))?;
        }
        serde_json::to_writer(&mut temporary, value)?;
        temporary.as_file().sync_all()?;
        temporary.persist(path)?;
        Ok(())
    };
    run().map_err(|error| format!("Cannot persist {}: {}", path.display(), error))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn atomic_round_trip_and_missing_storage() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config/settings.json");
        assert_eq!(read_json(&path).unwrap(), None);
        let value = json!({"version":1,"config":{"theme":"dark"}});
        write_json(&path, &value).unwrap();
        assert_eq!(read_json(&path).unwrap(), Some(value));
        write_json(&path, &json!({"version":1})).unwrap();
        assert!(path.with_extension("previous.json").exists());
    }
    #[test]
    fn corrupt_original_retained_and_failure_is_visible() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        std::fs::write(&path, "{truncated").unwrap();
        assert!(read_json(&path).unwrap_err().contains("original retained"));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{truncated");
        write_json(&path, &json!({"version":1})).unwrap();
        assert!(std::fs::read_dir(dir.path()).unwrap().filter_map(Result::ok).any(|p| p.file_name().to_string_lossy().contains("retained-")));
        let blocked = dir.path().join("blocked");
        std::fs::write(&blocked, "file").unwrap();
        assert!(write_json(&blocked.join("settings.json"), &json!({"version":1})).is_err());
        assert!(write_json(&path, &json!({"version":99})).is_err());
    }
}
