pub mod app;
pub mod commands;
pub mod config;
pub mod document;
pub mod error;
pub mod events;

// Re-export commonly used types
pub use error::{MarkWriterError, Result};
