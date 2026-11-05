// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use tauri::Manager;
mod persistence;
use std::collections::HashMap;
use std::io::Write;
// Menu system temporarily disabled for Tauri 2 compatibility

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Document {
    pub id: String,
    pub title: String,
    pub content: String,
    pub path: Option<String>,
    pub last_modified: String,
}

// Native path resolver is scoped to the current app identity.
// https://docs.rs/tauri/2/tauri/path/struct.PathResolver.html
#[tauri::command]
fn load_preferences(app: tauri::AppHandle) -> Result<Option<serde_json::Value>, String> {
    persistence::read_json(&app.path().app_config_dir().map_err(|e| e.to_string())?.join("preferences.json"))
}
#[tauri::command]
fn save_preferences(app: tauri::AppHandle, value: serde_json::Value) -> Result<(), String> {
    persistence::write_json(&app.path().app_config_dir().map_err(|e| e.to_string())?.join("preferences.json"), &value)
}
#[tauri::command]
fn load_workspace(app: tauri::AppHandle) -> Result<Option<serde_json::Value>, String> {
    persistence::read_json(&app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("workspace.json"))
}
#[tauri::command]
fn save_workspace(app: tauri::AppHandle, value: serde_json::Value) -> Result<(), String> {
    persistence::write_json(&app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("workspace.json"), &value)
}

// Create a new document
#[tauri::command]
async fn create_document() -> Result<Document, String> {
    println!("[TAURI] Creating new document");
    let doc = Document {
        id: uuid::Uuid::new_v4().to_string(),
        title: "Untitled".to_string(),
        content: "".to_string(),
        path: None,
        last_modified: chrono::Utc::now().to_rfc3339(),
    };
    println!("[TAURI] Created document with ID: {}", doc.id);
    Ok(doc)
}

// Resolve existing aliases and normalize new destinations through their real parent.
#[tauri::command]
fn canonical_document_path(path: String) -> Result<String, String> {
    let path = std::path::Path::new(&path);
    let canonical = if path.exists() { std::fs::canonicalize(path) } else {
        let parent = path.parent().filter(|p| !p.as_os_str().is_empty()).unwrap_or(std::path::Path::new("."));
        std::fs::canonicalize(parent).map(|p| p.join(path.file_name().unwrap_or_default()))
    }.map_err(|e| format!("Cannot resolve document path: {}", e))?;
    Ok(canonical.to_string_lossy().into_owned())
}

// Open document from file path
#[tauri::command]
async fn open_document(path: Option<String>) -> Result<Document, String> {
    println!("[TAURI] Opening document, path: {:?}", path);

    if let Some(file_path) = path {
        let file_path = canonical_document_path(file_path)?;
        match std::fs::read_to_string(&file_path) {
            Ok(content) => {
                let title = std::path::Path::new(&file_path)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("Untitled")
                    .to_string();

                let doc = Document {
                    id: uuid::Uuid::new_v4().to_string(),
                    title,
                    content,
                    path: Some(file_path.clone()),
                    last_modified: chrono::Utc::now().to_rfc3339(),
                };
                println!("[TAURI] Successfully opened: {}", file_path);
                Ok(doc)
            }
            Err(e) => {
                let error_msg = format!("Failed to read file: {}", e);
                println!("[TAURI] Error: {}", error_msg);
                Err(error_msg)
            }
        }
    } else {
        let error_msg = "No file path provided".to_string();
        println!("[TAURI] Error: {}", error_msg);
        Err(error_msg)
    }
}

// Write in the destination directory and replace only after a complete, flushed write.
fn write_document(path: &str, content: &str) -> std::io::Result<()> {
    let destination = std::path::Path::new(path);
    let parent = destination.parent().filter(|p| !p.as_os_str().is_empty()).unwrap_or(std::path::Path::new("."));
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    if let Ok(metadata) = std::fs::metadata(destination) {
        temporary.as_file().set_permissions(metadata.permissions())?;
    }
    temporary.write_all(content.as_bytes())?;
    temporary.as_file().sync_all()?;
    temporary.persist(destination).map_err(|error| error.error)?;
    Ok(())
}

// Save document to existing path
#[tauri::command]
async fn save_document(_id: String, content: String, path: String) -> Result<HashMap<String, String>, String> {
    println!("[TAURI] Save document called with content length: {} to path: {}", content.len(), path);

    match write_document(&path, &content) {
        Ok(_) => {
            let mut response = HashMap::new();
            response.insert("status".to_string(), "saved".to_string());
            response.insert("path".to_string(), path.clone());
            println!("[TAURI] Document saved successfully to: {}", path);
            Ok(response)
        }
        Err(e) => {
            let error_msg = format!("Failed to save file: {}", e);
            println!("[TAURI] Error: {}", error_msg);
            Err(error_msg)
        }
    }
}

// Save document to new path
#[tauri::command]
async fn save_document_as(_id: String, content: String, path: String) -> Result<HashMap<String, String>, String> {
    println!("[TAURI] Save document as: {}", path);

    match write_document(&path, &content) {
        Ok(_) => {
            let title = std::path::Path::new(&path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("Untitled")
                .to_string();

            let mut response = HashMap::new();
            response.insert("path".to_string(), path.clone());
            response.insert("title".to_string(), title);
            response.insert("status".to_string(), "saved".to_string());

            println!("[TAURI] Successfully saved as: {}", path);
            Ok(response)
        }
        Err(e) => {
            let error_msg = format!("Failed to save file: {}", e);
            println!("[TAURI] Error: {}", error_msg);
            Err(error_msg)
        }
    }
}

// HTML is rendered by the same frontend parser as Preview, with inline diagram SVG.
#[tauri::command]
async fn export_document(path: String, format: String, html: String) -> Result<(), String> {
    if format != "html" {
        return Err(format!("Unsupported export format: {}", format));
    }
    write_document(&path, &html).map_err(|error| format!("Failed to export HTML: {}", error))
}

// Quit application
#[tauri::command]
async fn quit_app(app_handle: tauri::AppHandle) -> Result<(), String> {
    println!("[TAURI] Quit application requested");
    app_handle.exit(0);
    Ok(())
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
    println!("[TAURI] Starting MarkWriter application");

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            load_preferences, save_preferences, load_workspace, save_workspace,
            canonical_document_path,
            create_document,
            open_document,
            save_document,
            save_document_as,
            export_document,
            quit_app,
            show_about_dialog,
            get_document_stats
        ])
        .setup(|_app| {
            println!("[TAURI] Application setup completed");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn file_save_save_as_reopen_preserves_source() {
        let dir = tempfile::tempdir().unwrap();
        let original = dir.path().join("original.md").to_string_lossy().into_owned();
        let copy = dir.path().join("copy.md").to_string_lossy().into_owned();
        let source = "# Grüße\n\n```mermaid\nflowchart TD\n A --> B\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n";
        let doc = create_document().await.unwrap();
        save_document_as(doc.id.clone(), source.into(), original.clone()).await.unwrap();
        let reopened = open_document(Some(original.clone())).await.unwrap();
        assert_eq!(reopened.content, source);
        let edited = format!("{}\nEdited", source);
        save_document(doc.id.clone(), edited.clone(), original.clone()).await.unwrap();
        assert_eq!(open_document(Some(original)).await.unwrap().content, edited);
        save_document_as(doc.id, edited.clone(), copy.clone()).await.unwrap();
        assert_eq!(open_document(Some(copy)).await.unwrap().content, edited);
    }

    #[tokio::test]
    async fn export_writes_complete_html_and_reports_io_errors() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("export.html").to_string_lossy().into_owned();
        let html = "<!DOCTYPE html><html><body><table></table><svg></svg></body></html>";
        export_document(path.clone(), "html".into(), html.into()).await.unwrap();
        assert_eq!(std::fs::read_to_string(path).unwrap(), html);
        assert!(export_document(dir.path().to_string_lossy().into_owned(), "html".into(), html.into()).await.is_err());
        assert!(open_document(Some(dir.path().join("missing.md").to_string_lossy().into_owned())).await.is_err());
    }
}
