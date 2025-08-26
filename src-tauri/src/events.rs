use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::{document::Document, Result};

/// Event types for the MarkWriter application
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AppEvent {
    DocumentOpened { document_id: String },
    DocumentSaved { document_id: String },
    DocumentClosed { document_id: String },
    DocumentModified { document_id: String },
    ConfigurationUpdated,
    SystemNotification { message: String, level: NotificationLevel },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NotificationLevel {
    Info,
    Warning,
    Error,
    Success,
}

/// Event emitter for the application
pub struct EventEmitter {
    app_handle: AppHandle,
}

impl EventEmitter {
    pub fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }

    /// Emit a document-related event
    pub fn emit_document_event(&self, event: AppEvent) -> Result<()> {
        self.app_handle
            .emit_all("document-event", &event)
            .map_err(|e| crate::error::MarkWriterError::system_error(format!("Failed to emit event: {}", e)))?;
        
        tracing::debug!("Emitted document event: {:?}", event);
        Ok(())
    }

    /// Emit a system notification
    pub fn emit_notification(&self, message: String, level: NotificationLevel) -> Result<()> {
        let event = AppEvent::SystemNotification { message, level };
        
        self.app_handle
            .emit_all("system-notification", &event)
            .map_err(|e| crate::error::MarkWriterError::system_error(format!("Failed to emit notification: {}", e)))?;
        
        tracing::info!("System notification: {:?}", event);
        Ok(())
    }

    /// Emit configuration update event
    pub fn emit_config_update(&self) -> Result<()> {
        let event = AppEvent::ConfigurationUpdated;
        
        self.app_handle
            .emit_all("config-updated", &event)
            .map_err(|e| crate::error::MarkWriterError::system_error(format!("Failed to emit config update: {}", e)))?;
        
        tracing::debug!("Configuration updated event emitted");
        Ok(())
    }

    /// Emit a generic custom event
    pub fn emit_custom(&self, event_name: &str, payload: serde_json::Value) -> Result<()> {
        self.app_handle
            .emit_all(event_name, &payload)
            .map_err(|e| crate::error::MarkWriterError::system_error(format!("Failed to emit custom event: {}", e)))?;
        
        tracing::debug!("Custom event emitted: {}", event_name);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_event_serialization() {
        let event = AppEvent::DocumentOpened {
            document_id: "test-doc".to_string(),
        };

        let serialized = serde_json::to_string(&event).expect("Failed to serialize event");
        let deserialized: AppEvent = serde_json::from_str(&serialized).expect("Failed to deserialize event");

        match deserialized {
            AppEvent::DocumentOpened { document_id } => {
                assert_eq!(document_id, "test-doc");
            }
            _ => panic!("Wrong event type"),
        }
    }

    #[test]
    fn test_notification_levels() {
        let levels = vec![
            NotificationLevel::Info,
            NotificationLevel::Warning,
            NotificationLevel::Error,
            NotificationLevel::Success,
        ];

        for level in levels {
            let serialized = serde_json::to_string(&level).expect("Failed to serialize level");
            let _deserialized: NotificationLevel = serde_json::from_str(&serialized).expect("Failed to deserialize level");
        }
    }
}
