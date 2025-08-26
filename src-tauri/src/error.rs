use serde::{Deserialize, Serialize};
use thiserror::Error;

pub type Result<T> = std::result::Result<T, MarkWriterError>;

#[derive(Error, Debug, Clone, Serialize, Deserialize)]
pub enum MarkWriterError {
    #[error("File operation failed: {message}")]
    FileError { message: String },
    
    #[error("Permission denied: {message}")]
    PermissionDenied { message: String },
    
    #[error("Invalid input: {message}")]
    InvalidInput { message: String },
    
    #[error("Configuration error: {message}")]
    ConfigError { message: String },
    
    #[error("Document error: {message}")]
    DocumentError { message: String },
    
    #[error("System error: {message}")]
    SystemError { message: String },
    
    #[error("Network error: {message}")]
    NetworkError { message: String },
    
    #[error("Serialization error: {message}")]
    SerializationError { message: String },
    
    #[error("Internal error: {message}")]
    InternalError { message: String },
}

impl MarkWriterError {
    pub fn file_error(message: impl Into<String>) -> Self {
        Self::FileError {
            message: message.into(),
        }
    }
    
    pub fn permission_denied(message: impl Into<String>) -> Self {
        Self::PermissionDenied {
            message: message.into(),
        }
    }
    
    pub fn invalid_input(message: impl Into<String>) -> Self {
        Self::InvalidInput {
            message: message.into(),
        }
    }
    
    pub fn config_error(message: impl Into<String>) -> Self {
        Self::ConfigError {
            message: message.into(),
        }
    }
    
    pub fn document_error(message: impl Into<String>) -> Self {
        Self::DocumentError {
            message: message.into(),
        }
    }
    
    pub fn system_error(message: impl Into<String>) -> Self {
        Self::SystemError {
            message: message.into(),
        }
    }
    
    pub fn network_error(message: impl Into<String>) -> Self {
        Self::NetworkError {
            message: message.into(),
        }
    }
    
    pub fn serialization_error(message: impl Into<String>) -> Self {
        Self::SerializationError {
            message: message.into(),
        }
    }
    
    pub fn internal_error(message: impl Into<String>) -> Self {
        Self::InternalError {
            message: message.into(),
        }
    }
    
    /// Get user-friendly error message
    pub fn user_message(&self) -> String {
        match self {
            MarkWriterError::FileError { message } => format!("File operation failed: {}", message),
            MarkWriterError::PermissionDenied { message } => format!("Access denied: {}", message),
            MarkWriterError::InvalidInput { message } => format!("Invalid input: {}", message),
            MarkWriterError::ConfigError { message } => format!("Configuration error: {}", message),
            MarkWriterError::DocumentError { message } => format!("Document error: {}", message),
            MarkWriterError::SystemError { message } => format!("System error: {}", message),
            MarkWriterError::NetworkError { message } => format!("Network error: {}", message),
            MarkWriterError::SerializationError { .. } => "Data processing error".to_string(),
            MarkWriterError::InternalError { .. } => "An internal error occurred".to_string(),
        }
    }
}

// Implement conversions from common error types
impl From<std::io::Error> for MarkWriterError {
    fn from(err: std::io::Error) -> Self {
        Self::file_error(err.to_string())
    }
}

impl From<serde_json::Error> for MarkWriterError {
    fn from(err: serde_json::Error) -> Self {
        Self::serialization_error(err.to_string())
    }
}

impl From<toml::de::Error> for MarkWriterError {
    fn from(err: toml::de::Error) -> Self {
        Self::config_error(err.to_string())
    }
}

impl From<toml::ser::Error> for MarkWriterError {
    fn from(err: toml::ser::Error) -> Self {
        Self::config_error(err.to_string())
    }
}

#[cfg(feature = "database")]
impl From<sqlx::Error> for MarkWriterError {
    fn from(err: sqlx::Error) -> Self {
        Self::system_error(format!("Database error: {}", err))
    }
}

// Tauri command error conversion
impl From<MarkWriterError> for tauri::Error {
    fn from(err: MarkWriterError) -> Self {
        tauri::Error::Command(tauri::CommandError::new(err.to_string()))
    }
}
