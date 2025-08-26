use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tokio::fs;
use uuid::Uuid;

use crate::{commands::ExportOptions, error::MarkWriterError, Result};

/// Represents a markdown document in MarkWriter
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    pub id: String,
    pub path: Option<PathBuf>,
    pub title: String,
    pub content: String,
    pub is_dirty: bool,
    pub metadata: DocumentMetadata,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentMetadata {
    pub word_count: usize,
    pub line_count: usize,
    pub character_count: usize,
    pub encoding: String,
    pub language: String,
    pub file_size: u64,
    pub checksum: String,
}

impl Document {
    /// Create a new empty document
    pub fn new() -> Self {
        let now = Utc::now();
        let id = Uuid::new_v4().to_string();
        
        Self {
            id,
            path: None,
            title: "Untitled".to_string(),
            content: String::new(),
            is_dirty: false,
            metadata: DocumentMetadata::default(),
            created_at: now,
            modified_at: now,
        }
    }
    
    /// Create a document from a file
    pub async fn from_file(path: &Path, content: String) -> Result<Self> {
        let now = Utc::now();
        let id = Uuid::new_v4().to_string();
        
        // Extract title from filename
        let title = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Untitled")
            .to_string();
        
        // Calculate metadata
        let metadata = DocumentMetadata::from_content(&content, path).await?;
        
        Ok(Self {
            id,
            path: Some(path.to_path_buf()),
            title,
            content,
            is_dirty: false,
            metadata,
            created_at: now,
            modified_at: now,
        })
    }
    
    /// Update document content and mark as dirty
    pub fn update_content(&mut self, new_content: String) {
        if self.content != new_content {
            self.content = new_content;
            self.is_dirty = true;
            self.modified_at = Utc::now();
            
            // Update metadata based on new content
            self.update_metadata();
        }
    }
    
    /// Save document to file
    pub async fn save_to_file(&self, path: &Path) -> Result<()> {
        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).await.map_err(|e| {
                MarkWriterError::file_error(format!("Failed to create directory: {}", e))
            })?;
        }
        
        // Write content to file
        fs::write(path, &self.content).await.map_err(|e| {
            MarkWriterError::file_error(format!("Failed to write file: {}", e))
        })?;
        
        tracing::info!("Document saved: {}", path.display());
        Ok(())
    }
    
    /// Convert document to HTML
    pub async fn to_html(&self, options: &ExportOptions) -> Result<String> {
        // Basic markdown to HTML conversion
        // In a real implementation, you would use a proper markdown parser
        let mut html = String::new();
        
        if options.include_metadata {
            html.push_str(&format!(
                "<!-- Document: {} -->\n<!-- Generated: {} -->\n",
                self.title,
                Utc::now().to_rfc3339()
            ));
        }
        
        html.push_str("<!DOCTYPE html>\n<html>\n<head>\n");
        html.push_str(&format!("<title>{}</title>\n", html_escape::encode_text(&self.title)));
        html.push_str("<meta charset=\"utf-8\">\n");
        
        if let Some(css) = &options.custom_css {
            html.push_str(&format!("<style>\n{}\n</style>\n", css));
        } else {
            // Default CSS
            html.push_str(include_str!("../assets/export.css"));
        }
        
        html.push_str("</head>\n<body>\n");
        
        if options.include_toc {
            html.push_str("<div id=\"table-of-contents\">\n<h2>Table of Contents</h2>\n");
            // TODO: Generate TOC from headers
            html.push_str("</div>\n");
        }
        
        html.push_str("<div id=\"content\">\n");
        
        // Basic markdown parsing (simplified)
        let content_html = self.basic_markdown_to_html(&self.content);
        html.push_str(&content_html);
        
        html.push_str("</div>\n</body>\n</html>");
        
        Ok(html)
    }
    
    /// Basic markdown to HTML conversion (simplified)
    fn basic_markdown_to_html(&self, markdown: &str) -> String {
        let mut html = String::new();
        let lines: Vec<&str> = markdown.lines().collect();
        
        for line in lines {
            if line.starts_with("# ") {
                html.push_str(&format!("<h1>{}</h1>\n", html_escape::encode_text(&line[2..])));
            } else if line.starts_with("## ") {
                html.push_str(&format!("<h2>{}</h2>\n", html_escape::encode_text(&line[3..])));
            } else if line.starts_with("### ") {
                html.push_str(&format!("<h3>{}</h3>\n", html_escape::encode_text(&line[4..])));
            } else if line.trim().is_empty() {
                html.push_str("<br>\n");
            } else {
                html.push_str(&format!("<p>{}</p>\n", html_escape::encode_text(line)));
            }
        }
        
        html
    }
    
    /// Update document metadata based on current content
    fn update_metadata(&mut self) {
        let word_count = self.content
            .split_whitespace()
            .count();
        
        let line_count = self.content.lines().count();
        let character_count = self.content.chars().count();
        
        // Simple checksum using content length and first/last characters
        let checksum = format!(
            "{:x}",
            self.content.len() as u64
                + self.content.chars().next().unwrap_or('\0') as u64
                + self.content.chars().last().unwrap_or('\0') as u64
        );
        
        self.metadata.word_count = word_count;
        self.metadata.line_count = line_count;
        self.metadata.character_count = character_count;
        self.metadata.checksum = checksum;
        self.metadata.file_size = self.content.len() as u64;
    }
    
    /// Get document statistics
    pub fn get_stats(&self) -> DocumentStats {
        DocumentStats {
            word_count: self.metadata.word_count,
            character_count: self.metadata.character_count,
            character_count_no_spaces: self.content.chars().filter(|c| !c.is_whitespace()).count(),
            line_count: self.metadata.line_count,
            paragraph_count: self.content.split("\n\n").filter(|p| !p.trim().is_empty()).count(),
        }
    }
}

impl Default for Document {
    fn default() -> Self {
        Self::new()
    }
}

impl DocumentMetadata {
    /// Create metadata from content and file path
    pub async fn from_content(content: &str, path: &Path) -> Result<Self> {
        let word_count = content.split_whitespace().count();
        let line_count = content.lines().count();
        let character_count = content.chars().count();
        let file_size = content.len() as u64;
        
        // Simple checksum
        let checksum = format!("{:x}", file_size + character_count as u64);
        
        // Detect encoding (simplified - assume UTF-8)
        let encoding = "UTF-8".to_string();
        
        // Detect language from file extension
        let language = path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| match ext.to_lowercase().as_str() {
                "md" | "markdown" => "markdown",
                "txt" => "text",
                _ => "unknown",
            })
            .unwrap_or("unknown")
            .to_string();
        
        Ok(Self {
            word_count,
            line_count,
            character_count,
            encoding,
            language,
            file_size,
            checksum,
        })
    }
}

impl Default for DocumentMetadata {
    fn default() -> Self {
        Self {
            word_count: 0,
            line_count: 0,
            character_count: 0,
            encoding: "UTF-8".to_string(),
            language: "markdown".to_string(),
            file_size: 0,
            checksum: "0".to_string(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DocumentStats {
    pub word_count: usize,
    pub character_count: usize,
    pub character_count_no_spaces: usize,
    pub line_count: usize,
    pub paragraph_count: usize,
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;
    use tokio::io::AsyncWriteExt;

    #[tokio::test]
    async fn test_document_creation() {
        let doc = Document::new();
        
        assert!(!doc.id.is_empty());
        assert_eq!(doc.title, "Untitled");
        assert_eq!(doc.content, "");
        assert!(!doc.is_dirty);
        assert!(doc.path.is_none());
    }

    #[tokio::test]
    async fn test_document_from_file() {
        let content = "# Test Document\n\nThis is a test document.";
        let mut temp_file = NamedTempFile::new().expect("Failed to create temp file");
        temp_file.write_all(content.as_bytes()).await.expect("Failed to write temp file");
        
        let doc = Document::from_file(temp_file.path(), content.to_string())
            .await
            .expect("Failed to create document from file");
        
        assert_eq!(doc.content, content);
        assert!(doc.path.is_some());
        assert_eq!(doc.metadata.word_count, 6);
        assert_eq!(doc.metadata.line_count, 3);
    }

    #[tokio::test]
    async fn test_update_content() {
        let mut doc = Document::new();
        let new_content = "Hello, world!";
        
        doc.update_content(new_content.to_string());
        
        assert_eq!(doc.content, new_content);
        assert!(doc.is_dirty);
        assert_eq!(doc.metadata.word_count, 2);
    }

    #[tokio::test]
    async fn test_basic_html_export() {
        let mut doc = Document::new();
        doc.update_content("# Hello\n\nWorld!".to_string());
        
        let options = ExportOptions::default();
        let html = doc.to_html(&options).await.expect("Failed to export HTML");
        
        assert!(html.contains("<h1>Hello</h1>"));
        assert!(html.contains("<p>World!</p>"));
        assert!(html.contains("<!DOCTYPE html>"));
    }

    #[tokio::test]
    async fn test_document_stats() {
        let mut doc = Document::new();
        doc.update_content("Hello world!\n\nThis is a test.".to_string());
        
        let stats = doc.get_stats();
        
        assert_eq!(stats.word_count, 6);
        assert_eq!(stats.line_count, 3);
        assert_eq!(stats.paragraph_count, 2);
    }
}
