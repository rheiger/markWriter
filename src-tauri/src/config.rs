use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::fs;

use crate::{error::MarkWriterError, Result};

/// Main application configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub version: String,
    pub editor: EditorConfig,
    pub ui: UiConfig,
    pub files: FileConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditorConfig {
    pub default_mode: String,
    pub font_family: String,
    pub font_size: u32,
    pub tab_size: u32,
    pub word_wrap: bool,
    pub auto_save_interval: u32, // seconds
    pub spell_check: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiConfig {
    pub theme: String, // "light", "dark", "system"
    pub show_sidebar: bool,
    pub sidebar_width: u32,
    pub show_status_bar: bool,
    pub show_toolbar: bool,
    pub animations: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileConfig {
    pub auto_backup: bool,
    pub backup_interval: u32, // minutes
    pub max_recent_files: u32,
    pub file_watching: bool,
    pub default_export_format: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            version: env!("CARGO_PKG_VERSION").to_string(),
            editor: EditorConfig::default(),
            ui: UiConfig::default(),
            files: FileConfig::default(),
        }
    }
}

impl Default for EditorConfig {
    fn default() -> Self {
        Self {
            default_mode: "wysiwyg".to_string(),
            font_family: if cfg!(target_os = "macos") {
                "SF Mono".to_string()
            } else if cfg!(target_os = "windows") {
                "Consolas".to_string()
            } else {
                "monospace".to_string()
            },
            font_size: 14,
            tab_size: 2,
            word_wrap: true,
            auto_save_interval: 30,
            spell_check: true,
        }
    }
}

impl Default for UiConfig {
    fn default() -> Self {
        Self {
            theme: "system".to_string(),
            show_sidebar: true,
            sidebar_width: 250,
            show_status_bar: true,
            show_toolbar: true,
            animations: true,
        }
    }
}

impl Default for FileConfig {
    fn default() -> Self {
        Self {
            auto_backup: true,
            backup_interval: 10,
            max_recent_files: 20,
            file_watching: true,
            default_export_format: "html".to_string(),
        }
    }
}

impl AppConfig {
    /// Load configuration from file or create default if not found
    pub async fn load() -> Result<Self> {
        let config_path = Self::config_file_path()?;
        
        if config_path.exists() {
            tracing::debug!("Loading configuration from: {:?}", config_path);
            let contents = fs::read_to_string(&config_path).await?;
            let config: AppConfig = serde_json::from_str(&contents)?;
            Ok(config)
        } else {
            tracing::info!("Configuration file not found, creating default configuration");
            let config = Self::default();
            config.save().await?;
            Ok(config)
        }
    }
    
    /// Save configuration to file
    pub async fn save(&self) -> Result<()> {
        let config_path = Self::config_file_path()?;
        
        // Ensure the config directory exists
        if let Some(parent) = config_path.parent() {
            fs::create_dir_all(parent).await?;
        }
        
        let contents = serde_json::to_string_pretty(self)?;
        fs::write(&config_path, contents).await?;
        
        tracing::debug!("Configuration saved to: {:?}", config_path);
        Ok(())
    }
    
    /// Get the path to the configuration file
    fn config_file_path() -> Result<PathBuf> {
        let config_dir = dirs::config_dir()
            .ok_or_else(|| MarkWriterError::system_error("Could not determine config directory"))?;
        
        let app_config_dir = config_dir.join("markwriter");
        Ok(app_config_dir.join("config.json"))
    }
    
    /// Get the application data directory
    pub fn data_dir() -> Result<PathBuf> {
        let data_dir = dirs::data_dir()
            .ok_or_else(|| MarkWriterError::system_error("Could not determine data directory"))?;
        
        Ok(data_dir.join("markwriter"))
    }
    
    /// Update a specific configuration section
    pub fn update_editor(&mut self, editor_config: EditorConfig) {
        self.editor = editor_config;
    }
    
    pub fn update_ui(&mut self, ui_config: UiConfig) {
        self.ui = ui_config;
    }
    
    pub fn update_files(&mut self, file_config: FileConfig) {
        self.files = file_config;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    
    #[tokio::test]
    async fn test_default_config() {
        let config = AppConfig::default();
        
        assert_eq!(config.editor.default_mode, "wysiwyg");
        assert_eq!(config.ui.theme, "system");
        assert!(config.files.auto_backup);
        assert_eq!(config.files.max_recent_files, 20);
    }
    
    #[tokio::test]
    async fn test_config_serialization() {
        let config = AppConfig::default();
        let json = serde_json::to_string(&config).expect("Failed to serialize config");
        let deserialized: AppConfig = serde_json::from_str(&json).expect("Failed to deserialize config");
        
        assert_eq!(config.editor.default_mode, deserialized.editor.default_mode);
        assert_eq!(config.ui.theme, deserialized.ui.theme);
    }
}
