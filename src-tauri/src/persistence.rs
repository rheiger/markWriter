//! Local, atomic JSON storage. No caller-supplied filesystem paths in production commands.
use serde_json::Value;
use std::io::Write;
use std::path::Path;

pub fn read_json(path: &Path) -> Result<Option<Value>, String> {
    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("Cannot read {}: {}", path.display(), error)),
    };
    let value: Value = serde_json::from_slice(&bytes).map_err(|error| {
        format!(
            "Invalid local storage at {} (original retained): {}",
            path.display(),
            error
        )
    })?;
    if !value.is_object() {
        return Err(format!(
            "Invalid local storage at {} (original retained)",
            path.display()
        ));
    }
    Ok(Some(value))
}

pub fn retain_rejected(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    let archive = path.with_extension(format!("retained-{}.json", uuid::Uuid::new_v4()));
    std::fs::copy(path, archive)
        .map(|_| ())
        .map_err(|e| format!("Cannot retain rejected storage: {}", e))
}

fn replacement_error(
    error: std::io::Error,
    path: &Path,
    stage: &str,
    attempts: usize,
) -> std::io::Error {
    std::io::Error::new(
        error.kind(),
        format!(
            "atomic {stage} replacement at {} failed after {attempts} attempt{}: {error}",
            path.display(),
            if attempts == 1 { "" } else { "s" },
        ),
    )
}

fn persist_atomic(
    temporary: tempfile::NamedTempFile,
    path: &Path,
    stage: &str,
) -> std::io::Result<()> {
    #[cfg(windows)]
    {
        persist_atomic_with_wait(temporary, path, stage, std::thread::sleep)
    }
    #[cfg(not(windows))]
    {
        temporary
            .persist(path)
            .map(|_| ())
            .map_err(|error| replacement_error(error.error, path, stage, 1))
    }
}

#[cfg(windows)]
fn persist_atomic_with_wait(
    mut temporary: tempfile::NamedTempFile,
    path: &Path,
    stage: &str,
    mut wait: impl FnMut(std::time::Duration),
) -> std::io::Result<()> {
    // Five attempts, with at most 300ms scheduled delay per atomic replacement.
    // Access denial is not necessarily transient: retain permanent errors after this cap.
    // Never delete or change permissions/attributes on the destination to make it writable.
    const DELAYS_MS: [u64; 4] = [20, 40, 80, 160];
    // tempfile 3.21.0 returns the same prepared file in PersistError on failure.
    // https://docs.rs/tempfile/3.21.0/tempfile/struct.NamedTempFile.html#method.persist
    // Windows codes: ERROR_ACCESS_DENIED / ERROR_SHARING_VIOLATION / ERROR_LOCK_VIOLATION.
    // https://learn.microsoft.com/en-us/windows/win32/debug/system-error-codes--0-499-
    for attempt in 1..=DELAYS_MS.len() + 1 {
        match temporary.persist(path) {
            Ok(_) => return Ok(()),
            Err(error) => {
                if matches!(error.error.raw_os_error(), Some(5 | 32 | 33)) {
                    if let Some(delay) = DELAYS_MS.get(attempt - 1) {
                        temporary = error.file;
                        wait(std::time::Duration::from_millis(*delay));
                        continue;
                    }
                }
                return Err(replacement_error(error.error, path, stage, attempt));
            }
        }
    }
    unreachable!("the final failed replacement returns its error")
}

pub fn write_json(path: &Path, value: &Value) -> Result<(), String> {
    if value.get("version").and_then(Value::as_u64) != Some(1) {
        return Err("Unsupported storage version".into());
    }
    let run = || -> Result<(), Box<dyn std::error::Error>> {
        let parent = path.parent().ok_or("Missing storage directory")?;
        std::fs::create_dir_all(parent)?;
        // Preserve the prior original even when it is malformed or from a newer version.
        if path.exists() {
            let backup = path.with_extension("previous.json");
            let previous = std::fs::read(path)?;
            if serde_json::from_slice::<Value>(&previous)
                .ok()
                .and_then(|v| v.get("version").and_then(Value::as_u64))
                != Some(1)
            {
                let archive =
                    path.with_extension(format!("retained-{}.json", uuid::Uuid::new_v4()));
                std::fs::copy(path, archive)?;
            }
            let mut prior = tempfile::NamedTempFile::new_in(parent)?;
            prior.write_all(&previous)?;
            prior.as_file().sync_all()?;
            persist_atomic(prior, &backup, "backup")?;
        }
        let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            temporary
                .as_file()
                .set_permissions(std::fs::Permissions::from_mode(0o600))?;
        }
        serde_json::to_writer(&mut temporary, value)?;
        temporary.as_file().sync_all()?;
        persist_atomic(temporary, path, "current")?;
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
    fn rejected_current_schema_remains_immutable_after_later_snapshots() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("workspace.json");
        let invalid = "{\"version\":1,\"documents\":[{\"content\":null}]}";
        std::fs::write(&path, invalid).unwrap();
        retain_rejected(&path).unwrap();
        write_json(&path, &json!({"version":1,"documents":[]})).unwrap();
        write_json(&path, &json!({"version":1,"documents":[]})).unwrap();
        let archive = std::fs::read_dir(dir.path())
            .unwrap()
            .filter_map(Result::ok)
            .find(|entry| entry.file_name().to_string_lossy().contains("retained-"))
            .unwrap();
        assert_eq!(std::fs::read_to_string(archive.path()).unwrap(), invalid);
    }

    #[test]
    fn corrupt_original_retained_and_failure_is_visible() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        std::fs::write(&path, "{truncated").unwrap();
        assert!(read_json(&path).unwrap_err().contains("original retained"));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{truncated");
        write_json(&path, &json!({"version":1})).unwrap();
        assert!(std::fs::read_dir(dir.path())
            .unwrap()
            .filter_map(Result::ok)
            .any(|p| p.file_name().to_string_lossy().contains("retained-")));
        let blocked = dir.path().join("blocked");
        std::fs::write(&blocked, "file").unwrap();
        assert!(write_json(&blocked.join("settings.json"), &json!({"version":1})).is_err());
        assert!(write_json(&path, &json!({"version":99})).is_err());
    }

    #[test]
    fn backup_replacement_failure_reports_stage_and_preserves_current() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let previous = path.with_extension("previous.json");
        let original = b"{\"version\":1,\"config\":{\"theme\":\"dark\"}}\n";
        std::fs::write(&path, original).unwrap();
        std::fs::create_dir(&previous).unwrap();

        let error = write_json(&path, &json!({"version":1})).unwrap_err();

        assert!(error.contains("backup replacement"), "{error}");
        assert!(error.contains(&previous.display().to_string()), "{error}");
        assert_eq!(std::fs::read(&path).unwrap(), original);
        assert!(previous.is_dir());
        #[cfg(not(windows))]
        assert!(error.contains("after 1 attempt:"), "{error}");
    }

    #[cfg(windows)]
    mod windows {
        use super::*;
        use std::os::windows::fs::OpenOptionsExt;
        use std::time::{Duration, Instant};

        fn prevent_replacement(path: &Path) -> std::fs::File {
            // FILE_SHARE_READ | FILE_SHARE_WRITE, deliberately omitting FILE_SHARE_DELETE.
            // https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew
            std::fs::OpenOptions::new()
                .read(true)
                .share_mode(1 | 2)
                .open(path)
                .unwrap()
        }

        fn prepared_file(parent: &Path, bytes: &[u8]) -> tempfile::NamedTempFile {
            let mut temporary = tempfile::NamedTempFile::new_in(parent).unwrap();
            temporary.write_all(bytes).unwrap();
            temporary.as_file().sync_all().unwrap();
            temporary
        }

        #[test]
        fn transient_lock_retries_the_same_file_and_preserves_previous_bytes() {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("settings.json");
            let previous = path.with_extension("previous.json");
            let old = b"{\"version\":1, \"config\":{\"theme\":\"dark\"}}\r\n";
            let new = b"{\"version\":1,\"config\":{\"theme\":\"light\"}}";
            std::fs::write(&path, old).unwrap();
            std::fs::write(&previous, old).unwrap();
            let mut held = Some(prevent_replacement(&path));
            let temporary = prepared_file(dir.path(), new);
            let temporary_path = temporary.path().to_owned();

            // Prove the old single-persist operation fails with this real OS lock.
            let denied = temporary.persist(&path).unwrap_err();
            assert!(matches!(denied.error.raw_os_error(), Some(5 | 32 | 33)));
            assert_eq!(std::fs::read(&path).unwrap(), old);

            let mut waits = Vec::new();
            persist_atomic_with_wait(denied.file, &path, "current", |delay| {
                // This callback runs only after a failed replacement, so lock release
                // is deterministic and cannot race ahead of the first attempt.
                assert_eq!(std::fs::read(&temporary_path).unwrap(), new);
                assert_eq!(std::fs::read(&path).unwrap(), old);
                waits.push(delay);
                drop(held.take());
            })
            .unwrap();

            assert_eq!(waits, [Duration::from_millis(20)]);
            assert!(!temporary_path.exists());
            assert_eq!(std::fs::read(&path).unwrap(), new);
            assert_eq!(std::fs::read(&previous).unwrap(), old);
        }

        #[test]
        fn persistent_current_lock_is_bounded_and_keeps_current_and_rejected_bytes() {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("settings.json");
            let previous = path.with_extension("previous.json");
            let old = b"{malformed original\r\n";
            std::fs::write(&path, old).unwrap();
            let held = prevent_replacement(&path);
            let started = Instant::now();

            let error = write_json(&path, &json!({"version":1})).unwrap_err();

            assert!(error.contains("current replacement"), "{error}");
            assert!(error.contains("after 5 attempts:"), "{error}");
            assert!(started.elapsed() >= Duration::from_millis(300));
            // Allow filesystem/CI scheduling overhead; the retry sleep budget is 300ms.
            assert!(started.elapsed() < Duration::from_secs(10));
            assert_eq!(std::fs::read(&path).unwrap(), old);
            assert_eq!(std::fs::read(&previous).unwrap(), old);
            let archives: Vec<_> = std::fs::read_dir(dir.path())
                .unwrap()
                .filter_map(Result::ok)
                .filter(|entry| entry.file_name().to_string_lossy().contains("retained-"))
                .collect();
            assert_eq!(archives.len(), 1);
            assert_eq!(std::fs::read(archives[0].path()).unwrap(), old);
            drop(held);
        }

        #[test]
        fn persistent_backup_lock_reports_backup_and_preserves_both_files() {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("settings.json");
            let previous = path.with_extension("previous.json");
            let old = b"{\"version\":1, \"config\":{\"theme\":\"dark\"}}\r\n";
            let older = b"{\"version\":1, \"config\":{\"theme\":\"auto\"}}\r\n";
            std::fs::write(&path, old).unwrap();
            std::fs::write(&previous, older).unwrap();
            let held = prevent_replacement(&previous);

            let error = write_json(&path, &json!({"version":1})).unwrap_err();

            assert!(error.contains("backup replacement"), "{error}");
            assert!(error.contains("after 5 attempts:"), "{error}");
            assert_eq!(std::fs::read(&path).unwrap(), old);
            assert_eq!(std::fs::read(&previous).unwrap(), older);
            drop(held);
        }

        #[test]
        fn persistent_lock_exhausts_exact_retry_budget_without_changing_destination() {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("settings.json");
            let old = b"{\"version\":1,\"config\":{\"theme\":\"dark\"}}";
            std::fs::write(&path, old).unwrap();
            let held = prevent_replacement(&path);
            let temporary = prepared_file(dir.path(), b"{\"version\":1}");
            let mut waits = Vec::new();

            let error = persist_atomic_with_wait(temporary, &path, "current", |delay| {
                waits.push(delay);
            })
            .unwrap_err();

            assert!(error.to_string().contains("after 5 attempts:"), "{error}");
            assert_eq!(waits, [20, 40, 80, 160].map(Duration::from_millis));
            assert_eq!(waits.iter().sum::<Duration>(), Duration::from_millis(300));
            assert_eq!(std::fs::read(&path).unwrap(), old);
            drop(held);
        }

        #[test]
        fn unrelated_os_error_is_not_retried() {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("missing/settings.json");
            let temporary = prepared_file(dir.path(), b"{\"version\":1}");

            let error = persist_atomic_with_wait(temporary, &path, "current", |_| {
                panic!("a missing parent must not be retried");
            })
            .unwrap_err();

            assert!(error.to_string().contains("after 1 attempt:"), "{error}");
            assert!(!path.exists());
        }
    }
}
