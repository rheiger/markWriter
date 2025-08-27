use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::Result;

/// Event system for communication between frontend and backend
#[derive(Debug)]
pub struct EventManager {
    app_handle: AppHandle,
}

impl EventManager {
    pub fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }

    /// Emit document-related events
    pub fn emit_document_event(&self, event: DocumentEvent) -> Result<()> {
        tracing::debug!("Emitted document event: {:?}", event);
        self.app_handle
            .emit("document-event", &event)
            .map_err(|e| crate::error::MarkWriterError::system_error(e.to_string()))?;
        Ok(())
    }

    /// Emit system notifications
    pub fn emit_system_notification(&self, event: SystemNotificationEvent) -> Result<()> {
        self.app_handle
            .emit("system-notification", &event)
            .map_err(|e| crate::error::MarkWriterError::system_error(e.to_string()))?;
        tracing::info!("System notification: {:?}", event);
        Ok(())
    }

    /// Emit configuration update events
    pub fn emit_config_updated(&self, event: ConfigUpdatedEvent) -> Result<()> {
        self.app_handle
            .emit("config-updated", &event)
            .map_err(|e| crate::error::MarkWriterError::system_error(e.to_string()))?;
        tracing::debug!("Configuration updated event emitted");
        Ok(())
    }

    /// Emit custom events
    pub fn emit_custom_event(&self, event_name: &str, payload: &impl Serialize) -> Result<()> {
        self.app_handle
            .emit(event_name, payload)
            .map_err(|e| crate::error::MarkWriterError::system_error(e.to_string()))?;
        tracing::debug!("Custom event emitted: {}", event_name);
        Ok(())
    }
}

/// Document-related event types
#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum DocumentEvent {
    Created { id: String, title: String },
    Updated { id: String, title: String },
    Saved { id: String, path: String },
    Deleted { id: String },
    Opened { id: String, path: String },
}

/// System notification event types
#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum SystemNotificationEvent {
    Info { message: String },
    Warning { message: String },
    Error { message: String },
    Success { message: String },
}

/// Configuration update event types
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConfigUpdatedEvent {
    pub section: String,
    pub changes: serde_json::Value,
}
