# MarkWriter v2.0 API Specification

**Version**: 1.0  
**Date**: August 26, 2025  
**Architecture**: Rust + Tauri + React  

## Overview

This document defines the comprehensive API specification for MarkWriter v2.0, including Tauri command interfaces, event systems, plugin APIs, and data structures. The API is designed for type safety, security, and extensibility.

## Core Data Types

### Document Types

```typescript
interface Document {
  id: DocumentId;
  path: string | null;
  title: string;
  content: string;
  isDirty: boolean;
  metadata: DocumentMetadata;
  createdAt: Date;
  modifiedAt: Date;
}

interface DocumentMetadata {
  wordCount: number;
  lineCount: number;
  encoding: string;
  language: string;
  fileSize: number;
  checksum: string;
}

type DocumentId = string; // UUID format
type EditorMode = 'wysiwyg' | 'markdown' | 'preview';
```

### Settings Types

```typescript
interface UserSettings {
  editor: EditorSettings;
  ui: UiSettings;
  files: FileSettings;
  plugins: PluginSettings;
  advanced: AdvancedSettings;
}

interface EditorSettings {
  defaultMode: EditorMode;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  tabSize: number;
  wordWrap: boolean;
  autoSaveInterval: number; // milliseconds
  spellCheck: boolean;
  showLineNumbers: boolean;
  highlightActiveLine: boolean;
}

interface UiSettings {
  theme: 'light' | 'dark' | 'system';
  accentColor: string;
  showSidebar: boolean;
  sidebarWidth: number;
  showStatusBar: boolean;
  showToolbar: boolean;
  windowOpacity: number;
  animations: boolean;
}

interface FileSettings {
  defaultSaveLocation: string;
  autoBackup: boolean;
  backupInterval: number; // minutes
  maxRecentFiles: number;
  fileWatching: boolean;
  defaultExportFormat: 'html' | 'pdf' | 'docx';
}

interface PluginSettings {
  enabledPlugins: Set<string>;
  pluginDirectories: string[];
  autoUpdatePlugins: boolean;
  allowUnsignedPlugins: boolean;
}

interface AdvancedSettings {
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  enableTelemetry: boolean;
  checkForUpdates: boolean;
  updateChannel: 'stable' | 'beta' | 'nightly';
  maxMemoryUsage: number; // MB
}
```

### Plugin Types

```typescript
interface Plugin {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  homepage?: string;
  repository?: string;
  license: string;
  permissions: PluginPermission[];
  enabled: boolean;
  installed: boolean;
  updateAvailable: boolean;
}

interface PluginPermission {
  type: 'file_read' | 'file_write' | 'network' | 'ui_extension' | 'menu_item';
  scope: string[];
  description: string;
}

interface PluginManifest {
  name: string;
  version: string;
  author: string;
  description: string;
  main: string;
  permissions: PluginPermission[];
  dependencies?: Record<string, string>;
  engines: {
    markwriter: string;
  };
}
```

## Tauri Command API

### Document Management Commands

```rust
// File operations
#[tauri::command]
pub async fn create_document() -> Result<Document, ApiError>;

#[tauri::command]
pub async fn open_document(path: String) -> Result<Document, ApiError>;

#[tauri::command]
pub async fn save_document(doc: Document) -> Result<(), ApiError>;

#[tauri::command]
pub async fn save_document_as(doc: Document, path: String) -> Result<Document, ApiError>;

#[tauri::command]
pub async fn close_document(document_id: DocumentId) -> Result<(), ApiError>;

#[tauri::command]
pub async fn get_recent_documents() -> Result<Vec<DocumentMetadata>, ApiError>;

#[tauri::command]
pub async fn export_document(
    document_id: DocumentId, 
    format: ExportFormat, 
    options: ExportOptions
) -> Result<String, ApiError>;
```

```typescript
// TypeScript interfaces for commands
interface ExportFormat {
  type: 'html' | 'pdf' | 'docx' | 'epub';
  options: Record<string, any>;
}

interface ExportOptions {
  includeToc: boolean;
  includeMetadata: boolean;
  customCss?: string;
  template?: string;
}

// Frontend usage
import { invoke } from '@tauri-apps/api/tauri';

const openFile = async (filePath: string): Promise<Document> => {
  return await invoke<Document>('open_document', { path: filePath });
};

const saveFile = async (document: Document): Promise<void> => {
  await invoke('save_document', { doc: document });
};
```

### Settings Management Commands

```rust
#[tauri::command]
pub async fn get_settings() -> Result<UserSettings, ApiError>;

#[tauri::command]
pub async fn update_settings(settings: UserSettings) -> Result<(), ApiError>;

#[tauri::command]
pub async fn reset_settings() -> Result<UserSettings, ApiError>;

#[tauri::command]
pub async fn export_settings() -> Result<String, ApiError>;

#[tauri::command]
pub async fn import_settings(settings_json: String) -> Result<UserSettings, ApiError>;
```

### Plugin Management Commands

```rust
#[tauri::command]
pub async fn get_installed_plugins() -> Result<Vec<Plugin>, ApiError>;

#[tauri::command]
pub async fn install_plugin(plugin_path: String) -> Result<Plugin, ApiError>;

#[tauri::command]
pub async fn uninstall_plugin(plugin_id: String) -> Result<(), ApiError>;

#[tauri::command]
pub async fn enable_plugin(plugin_id: String) -> Result<(), ApiError>;

#[tauri::command]
pub async fn disable_plugin(plugin_id: String) -> Result<(), ApiError>;

#[tauri::command]
pub async fn get_plugin_info(plugin_id: String) -> Result<Plugin, ApiError>;

#[tauri::command]
pub async fn check_plugin_updates() -> Result<Vec<PluginUpdate>, ApiError>;
```

### System Integration Commands

```rust
#[tauri::command]
pub async fn show_file_dialog(options: FileDialogOptions) -> Result<Option<String>, ApiError>;

#[tauri::command]
pub async fn show_save_dialog(options: SaveDialogOptions) -> Result<Option<String>, ApiError>;

#[tauri::command]
pub async fn show_message_dialog(options: MessageDialogOptions) -> Result<bool, ApiError>;

#[tauri::command]
pub async fn open_external(url: String) -> Result<(), ApiError>;

#[tauri::command]
pub async fn get_system_info() -> Result<SystemInfo, ApiError>;

#[tauri::command]
pub async fn check_for_updates() -> Result<UpdateInfo, ApiError>;

#[tauri::command]
pub async fn install_update() -> Result<(), ApiError>;
```

```typescript
interface FileDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: Array<{
    name: string;
    extensions: string[];
  }>;
  multiple?: boolean;
}

interface SystemInfo {
  platform: string;
  version: string;
  arch: string;
  totalMemory: number;
  availableMemory: number;
}

interface UpdateInfo {
  available: boolean;
  version?: string;
  releaseNotes?: string;
  downloadSize?: number;
}
```

## Event System API

### Core Events

```typescript
// Document events
interface DocumentEvent {
  type: 'document_opened' | 'document_saved' | 'document_closed' | 'content_changed';
  document: Document;
  timestamp: Date;
}

// Settings events
interface SettingsEvent {
  type: 'settings_updated';
  settings: UserSettings;
  changedKeys: string[];
}

// Plugin events
interface PluginEvent {
  type: 'plugin_installed' | 'plugin_uninstalled' | 'plugin_enabled' | 'plugin_disabled';
  plugin: Plugin;
}

// System events
interface SystemEvent {
  type: 'update_available' | 'update_installed' | 'low_memory' | 'file_changed';
  data: any;
}
```

### Event Handling

```typescript
import { listen, emit } from '@tauri-apps/api/event';

// Listen to document events
await listen<DocumentEvent>('document-event', (event) => {
  const { type, document } = event.payload;
  
  switch (type) {
    case 'document_opened':
      console.log('Document opened:', document.title);
      break;
    case 'content_changed':
      handleDocumentChange(document);
      break;
  }
});

// Listen to settings changes
await listen<SettingsEvent>('settings-event', (event) => {
  const { settings, changedKeys } = event.payload;
  applySettingsUpdate(settings, changedKeys);
});

// Emit custom events
await emit('custom-event', { data: 'value' });
```

```rust
// Backend event emission
use tauri::Manager;

impl EventBus {
    pub fn emit_document_event(&self, window: &Window, event_type: &str, document: &Document) {
        let event = DocumentEvent {
            type: event_type.to_string(),
            document: document.clone(),
            timestamp: chrono::Utc::now(),
        };
        
        window.emit("document-event", &event)
            .expect("Failed to emit document event");
    }
    
    pub fn emit_settings_event(&self, window: &Window, settings: &UserSettings, changed_keys: Vec<String>) {
        let event = SettingsEvent {
            type: "settings_updated".to_string(),
            settings: settings.clone(),
            changed_keys,
        };
        
        window.emit("settings-event", &event)
            .expect("Failed to emit settings event");
    }
}
```

## Plugin API

### Plugin Interface

```rust
// Core plugin trait
pub trait MarkWriterPlugin: Send + Sync {
    fn metadata(&self) -> PluginMetadata;
    fn initialize(&mut self, api: &PluginApi) -> Result<(), PluginError>;
    fn shutdown(&mut self) -> Result<(), PluginError>;
    
    // Document lifecycle hooks
    fn on_document_opened(&self, doc: &Document) -> Result<(), PluginError> { Ok(()) }
    fn on_document_saved(&self, doc: &Document) -> Result<(), PluginError> { Ok(()) }
    fn on_document_closed(&self, doc: &Document) -> Result<(), PluginError> { Ok(()) }
    fn on_content_changed(&self, doc: &Document) -> Result<Option<String>, PluginError> { Ok(None) }
    
    // Editor hooks
    fn on_editor_focus(&self, doc_id: &DocumentId) -> Result<(), PluginError> { Ok(()) }
    fn on_editor_blur(&self, doc_id: &DocumentId) -> Result<(), PluginError> { Ok(()) }
    fn on_selection_changed(&self, doc_id: &DocumentId, selection: &Selection) -> Result<(), PluginError> { Ok(()) }
    
    // Menu and UI hooks
    fn get_menu_items(&self) -> Result<Vec<MenuItem>, PluginError> { Ok(vec![]) }
    fn get_toolbar_items(&self) -> Result<Vec<ToolbarItem>, PluginError> { Ok(vec![]) }
    fn get_sidebar_panels(&self) -> Result<Vec<SidebarPanel>, PluginError> { Ok(vec![]) }
    
    // Processing hooks
    fn process_markdown(&self, content: &str) -> Result<Option<String>, PluginError> { Ok(None) }
    fn process_html(&self, html: &str) -> Result<Option<String>, PluginError> { Ok(None) }
}

// Plugin metadata
#[derive(Debug, Clone)]
pub struct PluginMetadata {
    pub id: String,
    pub name: String,
    pub version: String,
    pub author: String,
    pub description: String,
    pub homepage: Option<String>,
    pub repository: Option<String>,
    pub license: String,
    pub permissions: Vec<PluginPermission>,
}
```

### Plugin API Interface

```rust
// API provided to plugins
pub struct PluginApi {
    pub file_access: FileAccess,
    pub ui_extensions: UiExtensions,
    pub settings: SettingsAccess,
    pub events: EventAccess,
    pub editor: EditorAccess,
}

impl PluginApi {
    // File operations (scoped by plugin permissions)
    pub async fn read_file(&self, path: &str) -> Result<String, PluginError> { /* ... */ }
    pub async fn write_file(&self, path: &str, content: &str) -> Result<(), PluginError> { /* ... */ }
    pub async fn list_directory(&self, path: &str) -> Result<Vec<String>, PluginError> { /* ... */ }
    
    // Settings access
    pub async fn get_plugin_setting(&self, key: &str) -> Result<serde_json::Value, PluginError> { /* ... */ }
    pub async fn set_plugin_setting(&self, key: &str, value: serde_json::Value) -> Result<(), PluginError> { /* ... */ }
    
    // Event system
    pub fn emit_event(&self, event_type: &str, data: serde_json::Value) -> Result<(), PluginError> { /* ... */ }
    pub fn subscribe_to_event(&self, event_type: &str, callback: Box<dyn Fn(serde_json::Value)>) -> Result<(), PluginError> { /* ... */ }
    
    // Editor interaction
    pub async fn get_active_document(&self) -> Result<Option<Document>, PluginError> { /* ... */ }
    pub async fn insert_text(&self, doc_id: &DocumentId, text: &str, position: Option<u32>) -> Result<(), PluginError> { /* ... */ }
    pub async fn replace_selection(&self, doc_id: &DocumentId, text: &str) -> Result<(), PluginError> { /* ... */ }
    pub async fn get_selection(&self, doc_id: &DocumentId) -> Result<Selection, PluginError> { /* ... */ }
    
    // UI extensions
    pub fn add_menu_item(&self, item: MenuItem) -> Result<(), PluginError> { /* ... */ }
    pub fn add_toolbar_button(&self, button: ToolbarItem) -> Result<(), PluginError> { /* ... */ }
    pub fn add_sidebar_panel(&self, panel: SidebarPanel) -> Result<(), PluginError> { /* ... */ }
    pub fn show_notification(&self, message: &str, level: NotificationLevel) -> Result<(), PluginError> { /* ... */ }
}
```

### Plugin UI Extensions

```typescript
// Frontend plugin extension points
interface MenuItemExtension {
  id: string;
  label: string;
  shortcut?: string;
  icon?: string;
  action: string;
  submenu?: MenuItemExtension[];
}

interface ToolbarExtension {
  id: string;
  icon: string;
  tooltip: string;
  action: string;
  position: 'start' | 'end' | number;
}

interface SidebarExtension {
  id: string;
  title: string;
  icon: string;
  component: React.ComponentType<any>;
  position: number;
}

// Plugin component registration
declare global {
  interface Window {
    __MARKWRITER_PLUGINS__: {
      registerMenuItems: (items: MenuItemExtension[]) => void;
      registerToolbarItems: (items: ToolbarExtension[]) => void;
      registerSidebarPanels: (panels: SidebarExtension[]) => void;
      executeAction: (action: string, data?: any) => Promise<void>;
    };
  }
}
```

## Error Handling

### Error Types

```rust
#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("File operation failed: {0}")]
    FileError(String),
    
    #[error("Permission denied: {0}")]
    PermissionDenied(String),
    
    #[error("Invalid input: {0}")]
    InvalidInput(String),
    
    #[error("Plugin error: {0}")]
    PluginError(String),
    
    #[error("Configuration error: {0}")]
    ConfigError(String),
    
    #[error("System error: {0}")]
    SystemError(String),
    
    #[error("Network error: {0}")]
    NetworkError(String),
    
    #[error("Serialization error: {0}")]
    SerializationError(String),
}

// Convert to user-friendly error messages
impl ApiError {
    pub fn user_message(&self) -> String {
        match self {
            ApiError::FileError(msg) => format!("File operation failed: {}", msg),
            ApiError::PermissionDenied(msg) => format!("Access denied: {}", msg),
            ApiError::InvalidInput(msg) => format!("Invalid input: {}", msg),
            ApiError::PluginError(msg) => format!("Plugin error: {}", msg),
            ApiError::ConfigError(msg) => format!("Configuration error: {}", msg),
            ApiError::SystemError(msg) => format!("System error: {}", msg),
            ApiError::NetworkError(msg) => format!("Network error: {}", msg),
            ApiError::SerializationError(_) => "Data processing error".to_string(),
        }
    }
}
```

```typescript
// Frontend error handling
interface ApiErrorResponse {
  code: string;
  message: string;
  details?: Record<string, any>;
}

class ApiClient {
  async handleCommand<T>(command: string, args: any): Promise<T> {
    try {
      return await invoke<T>(command, args);
    } catch (error) {
      if (typeof error === 'string') {
        throw new Error(error);
      }
      
      const apiError = error as ApiErrorResponse;
      throw new Error(apiError.message || 'Unknown error occurred');
    }
  }
}

// Usage with error handling
const apiClient = new ApiClient();

try {
  const document = await apiClient.handleCommand<Document>('open_document', { path: filePath });
  // Handle success
} catch (error) {
  console.error('Failed to open document:', error.message);
  // Show user-friendly error message
  showNotification(error.message, 'error');
}
```

## Security Considerations

### Permission System

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Permission {
    pub resource_type: ResourceType,
    pub actions: Vec<Action>,
    pub scope: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ResourceType {
    File,
    Network,
    System,
    Plugin,
    Settings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Action {
    Read,
    Write,
    Execute,
    Delete,
}

// Permission validation
impl SecurityLayer {
    pub fn check_permission(
        &self,
        source: &PermissionSource,
        resource: &ResourceType,
        action: &Action,
        target: &str,
    ) -> Result<(), SecurityError> {
        // Validate permission against allowed permissions
        // Check scope restrictions
        // Log security events
        Ok(())
    }
}
```

### Input Validation

```rust
// Input sanitization and validation
pub struct InputValidator;

impl InputValidator {
    pub fn validate_file_path(path: &str) -> Result<PathBuf, ValidationError> {
        let path = PathBuf::from(path);
        
        // Prevent path traversal attacks
        if path.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
            return Err(ValidationError::PathTraversal);
        }
        
        // Validate file extension
        if let Some(ext) = path.extension() {
            if !ALLOWED_EXTENSIONS.contains(&ext.to_string_lossy().as_ref()) {
                return Err(ValidationError::InvalidFileType);
            }
        }
        
        Ok(path)
    }
    
    pub fn sanitize_html(html: &str) -> String {
        ammonia::Builder::default()
            .tags(hashset!["p", "br", "strong", "em", "code", "pre", "h1", "h2", "h3", "h4", "h5", "h6"])
            .clean(html)
            .to_string()
    }
    
    pub fn validate_json(json: &str) -> Result<serde_json::Value, ValidationError> {
        serde_json::from_str(json)
            .map_err(|_| ValidationError::InvalidJson)
    }
}
```

## Performance Considerations

### Async Operations

```rust
// Non-blocking file operations
#[tauri::command]
pub async fn read_large_file(path: String) -> Result<String, ApiError> {
    tokio::fs::read_to_string(path)
        .await
        .map_err(|e| ApiError::FileError(e.to_string()))
}

// Streaming for large files
#[tauri::command]
pub async fn read_file_stream(path: String) -> Result<String, ApiError> {
    use tokio::io::{AsyncBufReadExt, BufReader};
    
    let file = tokio::fs::File::open(path).await?;
    let mut reader = BufReader::new(file);
    let mut contents = String::new();
    
    reader.read_to_string(&mut contents).await?;
    Ok(contents)
}
```

### Caching Strategy

```rust
use std::collections::HashMap;
use tokio::sync::RwLock;

pub struct CacheManager {
    document_cache: RwLock<HashMap<DocumentId, Document>>,
    settings_cache: RwLock<Option<UserSettings>>,
    plugin_cache: RwLock<HashMap<String, Plugin>>,
}

impl CacheManager {
    pub async fn get_document(&self, id: &DocumentId) -> Option<Document> {
        self.document_cache.read().await.get(id).cloned()
    }
    
    pub async fn cache_document(&self, doc: Document) {
        self.document_cache.write().await.insert(doc.id.clone(), doc);
    }
    
    pub async fn invalidate_document(&self, id: &DocumentId) {
        self.document_cache.write().await.remove(id);
    }
}
```

## Migration Strategy

### Data Migration API

```rust
#[tauri::command]
pub async fn migrate_from_python_version() -> Result<MigrationResult, ApiError> {
    let migration_service = MigrationService::new();
    
    // Detect Python version installation
    let python_data = migration_service.detect_python_installation().await?;
    
    // Migrate settings
    let settings = migration_service.migrate_settings(&python_data).await?;
    
    // Migrate recent files list
    let recent_files = migration_service.migrate_recent_files(&python_data).await?;
    
    // Migrate any custom configurations
    let custom_config = migration_service.migrate_custom_config(&python_data).await?;
    
    Ok(MigrationResult {
        settings_migrated: true,
        recent_files_count: recent_files.len(),
        custom_config_migrated: custom_config.is_some(),
        warnings: migration_service.get_warnings(),
    })
}

#[derive(Debug, Serialize)]
pub struct MigrationResult {
    pub settings_migrated: bool,
    pub recent_files_count: usize,
    pub custom_config_migrated: bool,
    pub warnings: Vec<String>,
}
```

### Backward Compatibility

```typescript
// Version compatibility handling
interface CompatibilityLayer {
  checkVersion(version: string): Promise<CompatibilityResult>;
  migrateData(fromVersion: string, toVersion: string): Promise<MigrationResult>;
  getDeprecationWarnings(version: string): Promise<DeprecationWarning[]>;
}

interface CompatibilityResult {
  supported: boolean;
  requiresMigration: boolean;
  deprecationWarnings: DeprecationWarning[];
}

interface DeprecationWarning {
  feature: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  migrationPath?: string;
}
```

---

This API specification provides a comprehensive foundation for MarkWriter v2.0 development, ensuring type safety, security, and extensibility while maintaining clear separation of concerns between frontend and backend components.