use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;
use tokio::fs;

use crate::{
    app::AppState,
    config::AppConfig,
    document::Document,
    error::MarkWriterError,
    Result,
};

// ============================================================================
// Document Operations
// ============================================================================

#[tauri::command]
pub async fn create_document() -> Result<Document> {
    tracing::info!("Creating new document");
    let document = Document::new();
    Ok(document)
}

#[tauri::command]
pub async fn open_document(path: String) -> Result<Document> {
    tracing::info!("Opening document: {}", path);
    
    let path_buf = PathBuf::from(&path);
    
    // Validate file exists and is readable
    if !path_buf.exists() {
        return Err(MarkWriterError::file_error(format!("File not found: {}", path)));
    }
    
    if !path_buf.is_file() {
        return Err(MarkWriterError::file_error(format!("Path is not a file: {}", path)));
    }
    
    // Read file contents
    let content = fs::read_to_string(&path_buf).await
        .map_err(|e| MarkWriterError::file_error(format!("Failed to read file: {}", e)))?;
    
    // Create document from file
    let document = Document::from_file(&path_buf, content).await?;
    
    tracing::debug!("Document opened successfully: {} ({} chars)", path, document.content.len());
    Ok(document)
}

#[tauri::command]
pub async fn save_document(document: Document) -> Result<()> {
    tracing::info!("Saving document: {:?}", document.path);
    
    let path = document.path.as_ref()
        .ok_or_else(|| MarkWriterError::document_error("Document has no file path"))?;
    
    document.save_to_file(path).await?;
    
    tracing::debug!("Document saved successfully: {}", path.display());
    Ok(())
}

#[tauri::command]
pub async fn save_document_as(document: Document, path: String) -> Result<Document> {
    tracing::info!("Saving document as: {}", path);
    
    let path_buf = PathBuf::from(path);
    
    // Save to new path
    document.save_to_file(&path_buf).await?;
    
    // Create new document instance with updated path
    let mut updated_document = document;
    updated_document.path = Some(path_buf.clone());
    updated_document.title = path_buf.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled")
        .to_string();
    
    tracing::debug!("Document saved as: {}", path_buf.display());
    Ok(updated_document)
}

#[tauri::command]
pub async fn export_document(
    document: Document,
    format: ExportFormat,
    options: ExportOptions,
) -> Result<String> {
    tracing::info!("Exporting document to format: {:?}", format);
    
    match format {
        ExportFormat::Html => {
            let html = document.to_html(&options).await?;
            Ok(html)
        }
        ExportFormat::Pdf => {
            // TODO: Implement PDF export
            Err(MarkWriterError::system_error("PDF export not yet implemented"))
        }
    }
}

// ============================================================================
// Configuration Operations
// ============================================================================

#[tauri::command]
pub async fn get_app_config(_state: State<'_, AppState>) -> Result<AppConfig> {
    tracing::debug!("Getting application configuration");
    // For now, return a default config since we're not using the state
    // TODO: Implement proper state-based config retrieval
    Ok(AppConfig::default())
}

#[tauri::command]
pub async fn update_app_config(
    config: AppConfig,
    _state: State<'_, AppState>,
) -> Result<()> {
    tracing::info!("Updating application configuration");
    
    // Save the configuration
    config.save().await?;
    
    // TODO: Update the application state properly
    // Note: In a real implementation, we might want to use Arc<RwLock<AppConfig>>
    // for thread-safe updates, but for now this is a simplified version
    
    tracing::debug!("Configuration updated successfully");
    Ok(())
}

// ============================================================================
// System Integration
// ============================================================================

#[tauri::command]
pub async fn show_file_dialog(options: FileDialogOptions) -> Result<Option<String>> {
    tracing::debug!("Showing file dialog with options: {:?}", options);
    
    // This is a simplified implementation
    // In practice, you would use tauri-plugin-dialog
    
    Ok(None) // Placeholder - implement with actual dialog
}

#[tauri::command]
pub async fn show_save_dialog(options: SaveDialogOptions) -> Result<Option<String>> {
    tracing::debug!("Showing save dialog with options: {:?}", options);
    
    // This is a simplified implementation
    // In practice, you would use tauri-plugin-dialog
    
    Ok(None) // Placeholder - implement with actual dialog
}

#[tauri::command]
pub async fn get_system_info() -> Result<SystemInfo> {
    tracing::debug!("Getting system information");
    
    let system_info = SystemInfo {
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    };
    
    Ok(system_info)
}

// ============================================================================
// Supporting Types
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub enum ExportFormat {
    Html,
    Pdf,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportOptions {
    pub include_toc: bool,
    pub include_metadata: bool,
    pub custom_css: Option<String>,
}

impl Default for ExportOptions {
    fn default() -> Self {
        Self {
            include_toc: false,
            include_metadata: true,
            custom_css: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileDialogOptions {
    pub title: Option<String>,
    pub default_path: Option<String>,
    pub filters: Vec<FileFilter>,
    pub multiple: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveDialogOptions {
    pub title: Option<String>,
    pub default_path: Option<String>,
    pub filters: Vec<FileFilter>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileFilter {
    pub name: String,
    pub extensions: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemInfo {
    pub platform: String,
    pub arch: String,
    pub version: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;
    use tokio::io::AsyncWriteExt;

    #[tokio::test]
    async fn test_create_document() {
        let document = create_document().await.expect("Failed to create document");
        
        assert!(document.id.len() > 0);
        assert_eq!(document.content, "");
        assert_eq!(document.title, "Untitled");
        assert!(document.path.is_none());
    }

    #[tokio::test]
    async fn test_open_document() {
        // Create a temporary file
        let mut temp_file = NamedTempFile::new().expect("Failed to create temp file");
        let test_content = "# Test Document\n\nThis is a test.";
        temp_file.write_all(test_content.as_bytes()).await.expect("Failed to write temp file");
        
        let path = temp_file.path().to_string_lossy().to_string();
        let document = open_document(path).await.expect("Failed to open document");
        
        assert_eq!(document.content, test_content);
        assert!(document.path.is_some());
    }

    #[tokio::test]
    async fn test_export_options_default() {
        let options = ExportOptions::default();
        
        assert!(!options.include_toc);
        assert!(options.include_metadata);
        assert!(options.custom_css.is_none());
    }

    #[tokio::test]
    async fn test_system_info() {
        let info = get_system_info().await.expect("Failed to get system info");
        
        assert!(!info.platform.is_empty());
        assert!(!info.arch.is_empty());
        assert!(!info.version.is_empty());
    }
}
