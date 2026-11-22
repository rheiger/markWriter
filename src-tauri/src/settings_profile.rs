use crate::document_disk::{canonical_path, regular_file, write_copy};
use serde_json::Value;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use tokio::sync::{oneshot, Mutex, OwnedMutexGuard};

const MAX_BYTES: usize = 16 * 1024;
const FORMAT: &str = "markwriter-settings";
const BAD_PATH: &str = "Choose a local .json file.";
const TOO_LARGE: &str = "Settings profiles must be 16 KiB or smaller.";

#[derive(Default)]
pub struct SettingsProfilePicker(Arc<Mutex<()>>);

impl SettingsProfilePicker {
    fn permit(&self) -> Result<OwnedMutexGuard<()>, String> {
        self.0
            .clone()
            .try_lock_owned()
            .map_err(|_| "A settings file operation is already in progress.".into())
    }
}

fn validate_path(path: &Path) -> Result<(), String> {
    if path.is_absolute()
        && path
            .extension()
            .is_some_and(|suffix| suffix.eq_ignore_ascii_case("json"))
    {
        Ok(())
    } else {
        Err(BAD_PATH.into())
    }
}

fn validate_envelope(profile: &Value) -> Result<(), String> {
    if profile.get("format").and_then(Value::as_str) != Some(FORMAT) {
        return Err("Choose a MarkWriter settings profile.".into());
    }
    if profile.get("version").and_then(Value::as_u64) != Some(1) {
        return Err("Unsupported settings profile version.".into());
    }
    if !profile.get("config").is_some_and(Value::is_object) {
        return Err("Invalid settings profile config.".into());
    }
    if !profile.as_object().is_some_and(|fields| fields.len() == 3) {
        return Err("Unexpected settings profile fields.".into());
    }
    Ok(())
}

fn read_profile(path: &Path) -> Result<Value, String> {
    validate_path(path)?;
    let read_error =
        |_: io::Error| "Could not read the settings profile. Choose a readable regular .json file.";
    let file = regular_file(path).map_err(read_error)?;
    if file.metadata().map_err(read_error)?.len() > MAX_BYTES as u64 {
        return Err(TOO_LARGE.into());
    }
    let mut bytes = Vec::new();
    file.take((MAX_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(read_error)?;
    if bytes.len() > MAX_BYTES {
        return Err(TOO_LARGE.into());
    }
    let profile = serde_json::from_slice(bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(&bytes))
        .map_err(|_| "The settings profile must contain valid UTF-8 JSON.")?;
    validate_envelope(&profile)?;
    Ok(profile)
}

fn serialize_profile(profile: &Value) -> Result<String, String> {
    validate_envelope(profile)?;
    let mut text = serde_json::to_string_pretty(profile).map_err(|error| error.to_string())?;
    text.push('\n');
    if text.len() > MAX_BYTES {
        return Err(TOO_LARGE.into());
    }
    Ok(text)
}

fn save_profile(path: &Path, text: &str, internal_storage: &[PathBuf]) -> Result<(), String> {
    validate_path(path)?;
    let path = canonical_path(path, true)
        .map_err(|error| format!("Could not export settings: {error}"))?;
    // An empty app profile may have neither storage file yet. Do not populate those
    // private paths via Export, even when the chosen parent uses a filesystem alias.
    if internal_storage.iter().any(|storage| {
        path.file_name()
            .zip(storage.file_name())
            .is_some_and(|(name, owned)| name.eq_ignore_ascii_case(owned))
            && storage
                .parent()
                .and_then(|parent| parent.canonicalize().ok())
                .as_deref()
                == path.parent()
    }) {
        return Err(
            "Choose a location outside MarkWriter's managed settings and recovery files.".into(),
        );
    }
    write_copy(&path, text).map_err(|error| {
        if error.kind() == io::ErrorKind::AlreadyExists {
            "The settings profile already exists. Choose a new file name.".into()
        } else {
            format!("Could not export settings: {error}")
        }
    })
}

#[tauri::command]
pub async fn import_settings_profile(
    window: WebviewWindow,
    state: State<'_, SettingsProfilePicker>,
) -> Result<Option<Value>, String> {
    let permit = state.permit()?;
    let (send, receive) = oneshot::channel();
    window
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Import MarkWriter Settings")
        .add_filter("JSON", &["json"])
        .pick_file(move |file| {
            let result = file
                .map(|file| read_profile(&file.into_path().map_err(|_| BAD_PATH)?))
                .transpose();
            drop(permit);
            let _ = send.send(result);
        });
    receive
        .await
        .map_err(|_| "The settings import picker could not be opened.".to_owned())?
}

#[tauri::command]
pub async fn export_settings_profile(
    window: WebviewWindow,
    state: State<'_, SettingsProfilePicker>,
    profile: Value,
) -> Result<bool, String> {
    let text = serialize_profile(&profile)?;
    let internal_storage = [
        crate::storage_file(window.app_handle(), "preferences")?,
        crate::storage_file(window.app_handle(), "workspace")?,
    ];
    let permit = state.permit()?;
    let (send, receive) = oneshot::channel();
    window
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Export MarkWriter Settings to a New File")
        .set_file_name("MarkWriter-Settings.json")
        .add_filter("JSON", &["json"])
        .save_file(move |file| {
            let result = file
                .map(|file| {
                    let mut path = file.into_path().map_err(|_| BAD_PATH)?;
                    if path.extension().is_none() {
                        path.set_extension("json");
                    }
                    save_profile(&path, &text, &internal_storage)
                })
                .transpose()
                .map(|saved| saved.is_some());
            drop(permit);
            let _ = send.send(result);
        });
    receive
        .await
        .map_err(|_| "The settings export picker could not be opened.".to_owned())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;

    #[test]
    fn round_trips_unicode_and_never_replaces_an_existing_file() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("Préférences.JSON");
        let profile =
            json!({"format": FORMAT, "version": 1, "config": {"fontFamily": "ＭＳ ゴシック"}});
        let text = serialize_profile(&profile).unwrap();
        save_profile(&path, &text, &[]).unwrap();
        assert_eq!(read_profile(&path).unwrap(), profile);
        assert!(save_profile(&path, "{}", &[])
            .unwrap_err()
            .contains("new file name"));
        assert_eq!(fs::read_to_string(&path).unwrap(), text);
    }

    #[test]
    fn refuses_private_storage_paths_even_when_no_owned_file_exists() {
        let root = tempfile::tempdir().unwrap();
        let preferences = root.path().join("preferences.json");
        let workspace = root.path().join("workspace.json");
        let storage = [preferences.clone(), workspace.clone()];
        for path in [&preferences, &workspace] {
            assert!(save_profile(path, "{}", &storage)
                .unwrap_err()
                .contains("managed"));
            assert!(!path.exists());
        }
        let unrelated = tempfile::tempdir().unwrap();
        assert!(save_profile(&unrelated.path().join("preferences.json"), "{}", &storage).is_ok());
        #[cfg(unix)]
        {
            let alias = unrelated.path().join("alias");
            std::os::unix::fs::symlink(root.path(), &alias).unwrap();
            assert!(
                save_profile(&alias.join("preferences.json"), "{}", &storage)
                    .unwrap_err()
                    .contains("managed")
            );
        }
    }

    #[test]
    fn rejects_invalid_oversized_or_non_regular_input() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("settings.json");
        let mut bytes = vec![0xef, 0xbb, 0xbf];
        bytes
            .extend_from_slice(b"{\"format\":\"markwriter-settings\",\"version\":1,\"config\":{}}");
        bytes.resize(MAX_BYTES, b' ');
        fs::write(&path, &bytes).unwrap();
        assert!(read_profile(&path).is_ok());
        bytes.push(b' ');
        fs::write(&path, &bytes).unwrap();
        assert_eq!(read_profile(&path).unwrap_err(), TOO_LARGE);
        fs::write(&path, [0xff]).unwrap();
        assert!(read_profile(&path).unwrap_err().contains("UTF-8 JSON"));
        fs::write(&path, b"null").unwrap();
        assert!(read_profile(&path)
            .unwrap_err()
            .contains("MarkWriter settings profile"));
        fs::remove_file(&path).unwrap();
        fs::create_dir(&path).unwrap();
        assert!(read_profile(&path).unwrap_err().contains("regular"));
        assert!(save_profile(&root.path().join("document.md"), "{}", &[]).is_err());
        assert!(serialize_profile(&json!({"format": FORMAT, "version": 2, "config": {}})).is_err());
        assert_eq!(
            serialize_profile(&json!({"format": FORMAT, "version": 1, "config": {"fontFamily": "a".repeat(MAX_BYTES)}})).unwrap_err(),
            TOO_LARGE
        );
    }
}
