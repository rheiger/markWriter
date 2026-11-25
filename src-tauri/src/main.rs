// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};
mod persistence;
mod document_disk;
mod dot_policy;
mod storage_profile;
mod window_service;
mod native_menu;
mod os_open;
mod update_policy;
#[cfg(test)]
mod update_trust;
mod sql_import;
mod settings_profile;
mod window_preferences;
#[cfg(target_os = "windows")]
mod windows_install;
#[cfg(target_os = "windows")]
mod windows_open;
use std::collections::HashMap;
use std::path::Path;
use document_disk::{DiskState, SaveError};
// Menu system temporarily disabled for Tauri 2 compatibility

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Document {
    pub id: String,
    pub title: String,
    pub content: String,
    pub path: Option<String>,
    pub last_modified: String,
}

fn storage_file(app: &tauri::AppHandle, kind: &str) -> Result<std::path::PathBuf, String> {
    let filename = match kind {
        "preferences" => "preferences.json",
        "workspace" => "workspace.json",
        _ => return Err("Unknown storage kind".into()),
    };
    if let Some(root) = std::env::var_os("MARKWRITER_PROFILE_DIR") {
        return storage_profile::profile_file(std::path::Path::new(&root), filename);
    }
    let root = if kind == "preferences" { app.path().app_config_dir() } else { app.path().app_local_data_dir() };
    Ok(root.map_err(|e| e.to_string())?.join(filename))
}

// Native path resolver is scoped to the current app identity.
// https://docs.rs/tauri/2/tauri/path/struct.PathResolver.html
#[tauri::command]
fn load_preferences(app: tauri::AppHandle, state: tauri::State<window_preferences::PreferenceState>) -> Result<Option<serde_json::Value>, String> {
    state.load(&storage_file(&app, "preferences")?)
}
#[tauri::command]
fn save_preferences(
    app: tauri::AppHandle,
    state: tauri::State<window_preferences::PreferenceState>,
    value: serde_json::Value,
    base: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    state.save(&storage_file(&app, "preferences")?, value, base.as_ref(), |update| {
        let _ = app.emit("preferences-committed", update);
    })
}
#[tauri::command]
fn retain_rejected_storage(window: tauri::WebviewWindow, kind: String) -> Result<(), String> {
    let app = window.app_handle();
    if kind == "workspace" {
        return window_service::retain_rejected_workspace(app, window.label());
    }
    let path = storage_file(app, &kind)?;
    persistence::retain_rejected(&path)
}

// Create a new document
#[tauri::command]
async fn create_document(window: tauri::WebviewWindow, service: tauri::State<'_, window_service::WindowService>) -> Result<Document, String> {
    let doc = new_document();
    window_service::register_document(window.label(), &service, &doc.id)?;
    Ok(doc)
}

fn new_document() -> Document {
    println!("[TAURI] Creating new document");
    let doc = Document {
        id: uuid::Uuid::new_v4().to_string(),
        title: "Untitled".to_string(),
        content: "".to_string(),
        path: None,
        last_modified: chrono::Utc::now().to_rfc3339(),
    };
    println!("[TAURI] Created document with ID: {}", doc.id);
    doc
}

// Resolve aliases normally, or normalize just the parent for an already-owned name.
#[tauri::command]
fn canonical_document_path(path: String, preserve_leaf: Option<bool>, owned_paths: Option<Vec<String>>) -> Result<String, String> {
    let path = Path::new(&path);
    let resolved = match owned_paths {
        Some(owners) => document_disk::save_as_path(path, &owners),
        None => document_disk::canonical_path(path, preserve_leaf.unwrap_or(false)),
    };
    resolved.map(|path| path.to_string_lossy().into_owned())
        .map_err(|error| format!("Cannot resolve document path: {error}"))
}

fn usable_dialog_directory(path: &Path) -> bool {
    path.is_absolute() && std::fs::read_dir(path).is_ok()
}

#[tauri::command]
async fn is_dialog_directory_available(path: String) -> bool {
    tauri::async_runtime::spawn_blocking(move || usable_dialog_directory(Path::new(&path)))
        .await
        .unwrap_or(false)
}

#[tauri::command]
async fn monitor_document_disk(path: String, expected: Option<String>) -> DiskState {
    tauri::async_runtime::spawn_blocking(move || document_disk::monitor(Path::new(&path), expected.as_deref()))
        .await
        .unwrap_or(DiskState::Unreadable)
}

#[tauri::command]
async fn read_document_disk(path: String) -> Result<String, DiskState> {
    tauri::async_runtime::spawn_blocking(move || document_disk::read_current(Path::new(&path)))
        .await
        .map_err(|_| DiskState::Unreadable)?
}

// Open document from file path
#[tauri::command]
async fn open_document(path: Option<String>) -> Result<Document, String> {
    println!("[TAURI] Opening document, path: {:?}", path);

    let path = path.ok_or("No file path provided")?;
    read_document_from_path(canonical_document_path(path, None, None)?)
}

fn read_document_from_path(file_path: String) -> Result<Document, String> {
    use std::io::Read;
    let mut content = String::new();
    document_disk::regular_file(Path::new(&file_path))
        .and_then(|mut file| file.read_to_string(&mut content))
        .map_err(|error| format!("Failed to read file: {error}"))?;
    let title = Path::new(&file_path).file_name().and_then(|name| name.to_str()).unwrap_or("Untitled").to_owned();
    println!("[TAURI] Successfully opened: {file_path}");
    Ok(Document {
        id: uuid::Uuid::new_v4().to_string(),
        title,
        content,
        path: Some(file_path),
        last_modified: chrono::Utc::now().to_rfc3339(),
    })
}

// Save to an owned path only if the on-disk bytes still match its saved baseline.
#[tauri::command]
async fn save_document(window: tauri::WebviewWindow, service: tauri::State<'_, window_service::WindowService>, id: String, content: String, path: String, expected: String) -> Result<HashMap<String, String>, SaveError> {
    let path = window_service::save_document(&service, window.label(), &id, &content, &path, Some(&expected))?;
    Ok(HashMap::from([("path".into(), path)]))
}

#[tauri::command]
async fn save_document_as(window: tauri::WebviewWindow, service: tauri::State<'_, window_service::WindowService>, id: String, content: String, path: String) -> Result<HashMap<String, String>, SaveError> {
    let path = window_service::save_document(&service, window.label(), &id, &content, &path, None)?;
    Ok(HashMap::from([("path".into(), path)]))
}

#[tauri::command]
async fn save_document_copy(window: tauri::WebviewWindow, service: tauri::State<'_, window_service::WindowService>, content: String, path: String) -> Result<(), String> {
    window_service::write_unowned(&service, window.label(), &path, &content, true)
}

// HTML is rendered by the same frontend parser as Preview, with inline diagram SVG.
#[tauri::command]
async fn export_document(window: tauri::WebviewWindow, service: tauri::State<'_, window_service::WindowService>, path: String, format: String, html: String) -> Result<(), String> {
    if format != "html" {
        return Err(format!("Unsupported export format: {format}"));
    }
    window_service::write_unowned(&service, window.label(), &path, &html, false)
}

// Show about dialog
#[tauri::command]
async fn show_about_dialog() -> Result<(), String> {
    println!("[TAURI] Show about dialog");
    // TODO: Implement proper about dialog
    Ok(())
}

// Get document statistics
#[tauri::command]
async fn get_document_stats(content: String) -> Result<HashMap<String, usize>, String> {
    println!("[TAURI] Getting document statistics");

    let lines: Vec<&str> = content.lines().collect();
    let words: Vec<&str> = content.split_whitespace().collect();
    let chars: Vec<char> = content.chars().collect();

    let mut stats = HashMap::new();
    stats.insert("lines".to_string(), lines.len());
    stats.insert("words".to_string(), words.len());
    stats.insert("characters".to_string(), chars.len());

    Ok(stats)
}

// Menu system temporarily disabled for Tauri 2 compatibility

fn main() {
    #[cfg(target_os = "windows")]
    let mut windows_args: Vec<_> = std::env::args_os().collect();
    #[cfg(target_os = "windows")]
    {
        let args = windows_args.get(1..).unwrap_or_default();
        if args.len() == 1 && args[0] == "--installer-cleanup" {
            if let Err(error) = windows_install::run_installer_cleanup() {
                eprintln!("Installer could not run ordinary-user cleanup: {error}");
                std::process::exit(error.raw_os_error().unwrap_or(1));
            }
            return;
        }
        let legacy_cleanup = args.first().is_some_and(|arg| arg == "--retire-legacy-install");
        let quiet = args.len() == 2 && args[1] == "--quiet";
        if legacy_cleanup && (args.len() == 1 || quiet) {
            if let Err(error) = windows_install::retire_legacy_install() {
                let message = format!("MarkWriter was installed, but legacy cleanup could not finish. Close the old app and its previews before retrying.\n\n{error}");
                eprintln!("{message}");
                if !quiet { windows_open::show_error(&message); }
                std::process::exit(1);
            }
            return;
        }
        if args.first().is_some_and(|arg| arg == "--open-from-shell") {
            let result = match args {
                [_, file] if os_open::is_markdown_path(std::path::Path::new(file)) => {
                    windows_install::launch_shell_file_as_user(std::path::Path::new(file))
                        .map_err(|error| error.to_string())
                }
                _ => Err("Explorer must supply one absolute Markdown file path.".into()),
            };
            match result {
                Ok(true) => return,
                Ok(false) => {
                    windows_args.remove(1);
                }
                Err(error) => {
                    windows_open::show_error(&format!("MarkWriter could not open this Explorer file.\n\n{error}"));
                    return;
                }
            }
        }
    }
    println!("[TAURI] Starting MarkWriter application");

    #[cfg(target_os = "windows")]
    let inbox = match windows_open::connect_or_listen(&windows_args) {
        Ok(Some(inbox)) => inbox,
        Ok(None) => return,
        Err(error) => {
            windows_open::show_error(&format!("MarkWriter could not open this window or file.\n\n{error}"));
            return;
        }
    };

    #[cfg(target_os = "windows")]
    let cleanup_error = windows_install::retry_legacy_cleanup().err();
    tauri::Builder::default()
        .manage(native_menu::NativeState::default())
        .manage(window_service::WindowService::default())
        .manage(window_preferences::PreferenceState::default())
        .manage(sql_import::SqlPicker::default())
        .manage(settings_profile::SettingsProfilePicker::default())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            native_menu::sync_native_menu,
            update_policy::check_updates,
            update_policy::open_update_link,
            window_service::take_os_open,
            sql_import::pick_sql_source,
            settings_profile::import_settings_profile,
            settings_profile::export_settings_profile,
            retain_rejected_storage,
            load_preferences, save_preferences,
            window_service::load_workspace,
            window_service::mark_editor_window_ready,
            window_service::save_workspace,
            window_service::create_editor_window,
            window_service::list_editor_windows,
            window_service::focus_editor_window,
            window_service::finish_editor_window_close,
            window_service::open_owned_document,
            window_service::claim_document_path,
            window_service::release_document_claim,
            window_service::move_editor_document,
            window_service::take_editor_transfers,
            window_service::ack_editor_transfer,
            window_service::editor_document_owner,
            window_service::answer_app_quit,
            canonical_document_path,
            is_dialog_directory_available,
            create_document,
            open_document,
            save_document,
            save_document_as,
            save_document_copy,
            monitor_document_disk,
            read_document_disk,
            export_document,
            window_service::quit_app,
            show_about_dialog,
            get_document_stats
        ])
        .on_window_event(window_service::on_window_event)
        .setup(move |app| {
            #[cfg(target_os = "macos")]
            native_menu::install(app.handle())?;
            window_service::build_windows(app.handle())?;
            #[cfg(target_os = "windows")]
            window_service::enqueue_os_open(app.handle(), |queue| {
                let _ = queue.enqueue_argv(windows_args);
                if let Some(error) = cleanup_error {
                    let _ = queue.reject_batch(&format!("Legacy Windows installation cleanup could not finish: {error}"));
                }
            });
            #[cfg(target_os = "windows")]
            inbox.start(app.handle().clone())?;
            println!("[TAURI] Application setup completed");
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { ref urls } = event {
                window_service::enqueue_os_open(app, |queue| {
                    let paths: Result<Vec<_>, _> = urls.iter().map(|url| url.to_file_path()).collect();
                    match paths {
                        Ok(paths) => { let _ = queue.enqueue(paths); }
                        Err(_) => { let _ = queue.reject_batch("No files from this batch were opened: unsupported URL. Only local Markdown files can be opened."); }
                    }
                });
            }
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::ExitRequested { code: None, api, .. } = event {
                if window_service::intercept_exit(app) {
                    api.prevent_exit();
                    if let Err(error) = window_service::initiate_quit(app) {
                        eprintln!("Could not prepare to quit: {error}");
                    }
                }
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dialog_directory_must_be_an_existing_absolute_directory() {
        let root = tempfile::tempdir().unwrap();
        let directory = root.path().join("Références");
        let file = root.path().join("file.md");
        std::fs::create_dir(&directory).unwrap();
        std::fs::write(&file, "# File").unwrap();
        assert!(usable_dialog_directory(&directory));
        assert!(!usable_dialog_directory(&file));
        assert!(!usable_dialog_directory(Path::new(".")));
        std::fs::remove_dir(&directory).unwrap();
        assert!(!usable_dialog_directory(&directory));
    }

    #[tokio::test]
    async fn file_save_save_as_reopen_preserves_source() {
        let dir = tempfile::tempdir().unwrap();
        let original = dir.path().join("original.md").to_string_lossy().into_owned();
        let copy = dir.path().join("copy.md").to_string_lossy().into_owned();
        let source = "# Grüße\n\n```mermaid\nflowchart TD\n A --> B\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n";
        let service = window_service::WindowService::default();
        let doc = new_document();
        window_service::register_document("main", &service, &doc.id).unwrap();
        window_service::save_document(&service, "main", &doc.id, source, &original, None).unwrap();
        let reopened = open_document(Some(original.clone())).await.unwrap();
        assert_eq!(reopened.content, source);
        let edited = format!("{}\nEdited", source);
        window_service::save_document(&service, "main", &doc.id, &edited, &original, Some(source)).unwrap();
        assert_eq!(open_document(Some(original)).await.unwrap().content, edited);
        window_service::save_document(&service, "main", &doc.id, &edited, &copy, None).unwrap();
        assert_eq!(open_document(Some(copy)).await.unwrap().content, edited);
    }

    #[tokio::test]
    async fn export_writes_complete_html_and_reports_io_errors() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("export.html").to_string_lossy().into_owned();
        let html = "<!DOCTYPE html><html><body><table></table><svg></svg></body></html>";
        let service = window_service::WindowService::default();
        window_service::write_unowned(&service, "main", &path, html, false).unwrap();
        assert_eq!(std::fs::read_to_string(path).unwrap(), html);
        assert!(window_service::write_unowned(&service, "main", &dir.path().to_string_lossy(), html, false).is_err());
        assert!(open_document(Some(dir.path().join("missing.md").to_string_lossy().into_owned())).await.is_err());
    }
}
