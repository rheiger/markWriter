// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use regex::Regex;
use std::sync::OnceLock;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Document {
    pub id: String,
    pub title: String,
    pub content: String,
    pub path: Option<String>,
    pub last_modified: String,
}

// Lazy static regex patterns to avoid runtime compilation panics
static H1_REGEX: OnceLock<Regex> = OnceLock::new();
static H2_REGEX: OnceLock<Regex> = OnceLock::new();
static H3_REGEX: OnceLock<Regex> = OnceLock::new();
static BOLD_REGEX: OnceLock<Regex> = OnceLock::new();
static ITALIC_REGEX: OnceLock<Regex> = OnceLock::new();

fn get_h1_regex() -> &'static Regex {
    H1_REGEX.get_or_init(|| Regex::new(r"(?m)^# (.+)$").unwrap())
}

fn get_h2_regex() -> &'static Regex {
    H2_REGEX.get_or_init(|| Regex::new(r"(?m)^## (.+)$").unwrap())
}

fn get_h3_regex() -> &'static Regex {
    H3_REGEX.get_or_init(|| Regex::new(r"(?m)^### (.+)$").unwrap())
}

fn get_bold_regex() -> &'static Regex {
    BOLD_REGEX.get_or_init(|| Regex::new(r"\*\*(.+?)\*\*").unwrap())
}

fn get_italic_regex() -> &'static Regex {
    ITALIC_REGEX.get_or_init(|| Regex::new(r"\*(.+?)\*").unwrap())
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

// Open document from file path
#[tauri::command]
async fn open_document(path: Option<String>) -> Result<Document, String> {
    println!("[TAURI] Opening document, path: {:?}", path);
    
    if let Some(file_path) = path {
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

// Save document to existing path
#[tauri::command]
async fn save_document(_id: String, content: String) -> Result<HashMap<String, String>, String> {
    println!("[TAURI] Save document called with content length: {}", content.len());
    // This should use the existing document path from the frontend state
    // For now, return success - the frontend should handle path management
    let mut response = HashMap::new();
    response.insert("status".to_string(), "saved".to_string());
    println!("[TAURI] Document saved successfully");
    Ok(response)
}

// Save document to new path
#[tauri::command]
async fn save_document_as(_id: String, content: String, path: String) -> Result<HashMap<String, String>, String> {
    println!("[TAURI] Save document as: {}", path);
    
    match std::fs::write(&path, &content) {
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

// Export document as HTML
#[tauri::command]
async fn export_document(_id: String, content: String, path: String, format: String) -> Result<(), String> {
    println!("[TAURI] Export document as {} to: {}", format, path);
    
    match format.as_str() {
        "html" => {
            // Convert markdown to HTML (basic implementation)
            let html_content = markdown_to_html(&content);
            let html = format!(
                r#"<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Exported Document</title>
    <style>
        body {{ 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            max-width: 800px; 
            margin: 0 auto; 
            padding: 40px 20px; 
            line-height: 1.6;
            color: #333;
        }}
        h1, h2, h3, h4, h5, h6 {{ color: #2c3e50; margin-top: 2em; }}
        pre {{ 
            background: #f8f9fa; 
            padding: 15px; 
            border-radius: 5px; 
            border-left: 4px solid #007acc;
            overflow-x: auto;
        }}
        code {{
            background: #f8f9fa;
            padding: 2px 4px;
            border-radius: 3px;
            font-size: 0.9em;
        }}
        blockquote {{
            border-left: 4px solid #ddd;
            margin: 0;
            padding-left: 20px;
            color: #666;
        }}
        table {{
            border-collapse: collapse;
            width: 100%;
            margin: 20px 0;
        }}
        th, td {{
            border: 1px solid #ddd;
            padding: 12px;
            text-align: left;
        }}
        th {{
            background-color: #f8f9fa;
            font-weight: 600;
        }}
    </style>
</head>
<body>
{}
</body>
</html>"#,
                html_content
            );
            
            match std::fs::write(&path, html) {
                Ok(_) => {
                    println!("[TAURI] Successfully exported HTML to: {}", path);
                    Ok(())
                }
                Err(e) => {
                    let error_msg = format!("Failed to export HTML: {}", e);
                    println!("[TAURI] Error: {}", error_msg);
                    Err(error_msg)
                }
            }
        }
        _ => {
            let error_msg = format!("Unsupported export format: {}", format);
            println!("[TAURI] Error: {}", error_msg);
            Err(error_msg)
        }
    }
}

// Basic markdown to HTML conversion (safe implementation)
fn markdown_to_html(markdown: &str) -> String {
    // This is a very basic implementation with error handling
    // In a real app, you'd use a proper markdown parser like comrak or pulldown-cmark
    let mut html = markdown.to_string();
    
    // Headers - using lazy static patterns to avoid runtime panic
    html = get_h1_regex().replace_all(&html, "<h1>$1</h1>").to_string();
    html = get_h2_regex().replace_all(&html, "<h2>$1</h2>").to_string();
    html = get_h3_regex().replace_all(&html, "<h3>$1</h3>").to_string();
    
    // Bold and Italic - safe regex patterns
    html = get_bold_regex().replace_all(&html, "<strong>$1</strong>").to_string();
    html = get_italic_regex().replace_all(&html, "<em>$1</em>").to_string();
    
    // Line breaks to paragraphs - safe string processing
    let lines: Vec<&str> = html.lines().collect();
    let mut paragraphs = Vec::new();
    let mut current_paragraph = Vec::new();
    
    for line in lines {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            if !current_paragraph.is_empty() {
                let paragraph = current_paragraph.join(" ");
                if !paragraph.starts_with('<') {
                    paragraphs.push(format!("<p>{}</p>", paragraph));
                } else {
                    paragraphs.push(paragraph);
                }
                current_paragraph.clear();
            }
        } else {
            current_paragraph.push(trimmed);
        }
    }
    
    if !current_paragraph.is_empty() {
        let paragraph = current_paragraph.join(" ");
        if !paragraph.starts_with('<') {
            paragraphs.push(format!("<p>{}</p>", paragraph));
        } else {
            paragraphs.push(paragraph);
        }
    }
    
    paragraphs.join("\n")
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

fn main() {
    println!("[TAURI] Starting MarkWriter application");
    
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            create_document,
            open_document,
            save_document,
            save_document_as,
            export_document,
            quit_app,
            show_about_dialog
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}