// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Document {
    pub id: String,
    pub title: String,
    pub content: String,
    pub file_path: Option<String>,
    pub is_dirty: bool,
}

// Simple document creation command
#[tauri::command]
async fn create_document() -> Result<Document, String> {
    Ok(Document {
        id: uuid::Uuid::new_v4().to_string(),
        title: "Untitled".to_string(),
        content: "".to_string(),
        file_path: None,
        is_dirty: false,
    })
}

// Simple file operations (stubs for now)
#[tauri::command]
async fn open_document(path: String) -> Result<Document, String> {
    use std::fs;
    
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let title = std::path::Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Untitled")
        .to_string();
        
    Ok(Document {
        id: uuid::Uuid::new_v4().to_string(),
        title,
        content,
        file_path: Some(path),
        is_dirty: false,
    })
}

#[tauri::command]
async fn save_document(id: String, content: String, path: String) -> Result<(), String> {
    use std::fs;
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn save_document_as(id: String, content: String, path: String) -> Result<String, String> {
    use std::fs;
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(path)
}

#[tauri::command]
async fn export_document(content: String, path: String) -> Result<(), String> {
    use std::fs;
    // Simple HTML export
    let html = format!(
        r#"<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Exported Document</title>
    <style>
        body {{ font-family: -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }}
        pre {{ background: #f5f5f5; padding: 10px; border-radius: 5px; }}
    </style>
</head>
<body>
    <pre>{}</pre>
</body>
</html>"#,
        content
    );
    fs::write(&path, html).map_err(|e| e.to_string())?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            create_document,
            open_document,
            save_document,
            save_document_as,
            export_document
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
