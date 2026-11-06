use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Custom error types for MarkWriter application
#[derive(Error, Debug, Clone, Serialize, Deserialize)]
pub enum MarkWriterError {
    #[error("File operation failed: {message}")]
    FileError { message: String },
    
    #[error("Permission denied: {message}")]
    PermissionError { message: String },
    
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
    // Convenience constructors
    pub fn file_error(message: impl Into<String>) -> Self {
        Self::FileError {
            message: message.into(),
        }
    }

    pub fn permission_error(message: impl Into<String>) -> Self {
        Self::PermissionError {
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
}

// Conversion from std::io::Error
impl From<std::io::Error> for MarkWriterError {
    fn from(err: std::io::Error) -> Self {
        MarkWriterError::file_error(err.to_string())
    }
}

// Conversion from serde_json::Error
impl From<serde_json::Error> for MarkWriterError {
    fn from(err: serde_json::Error) -> Self {
        MarkWriterError::serialization_error(err.to_string())
    }
}

// Conversion from toml deserialization errors
impl From<toml::de::Error> for MarkWriterError {
    fn from(err: toml::de::Error) -> Self {
        MarkWriterError::config_error(err.to_string())
    }
}

// Conversion from toml serialization errors
impl From<toml::ser::Error> for MarkWriterError {
    fn from(err: toml::ser::Error) -> Self {
        MarkWriterError::config_error(err.to_string())
    }
}

// Conversion to Tauri Error for command handlers
impl From<MarkWriterError> for tauri::Error {
    fn from(err: MarkWriterError) -> Self {
        tauri::Error::Io(std::io::Error::new(
            std::io::ErrorKind::Other,
            err.to_string(),
        ))
    }
}

// Type alias for convenience
pub type Result<T> = std::result::Result<T, MarkWriterError>;
