use std::sync::Arc;
use tauri::{App, AppHandle, Manager};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::{
    commands,
    config::AppConfig,
    error::MarkWriterError,
    Result,
};

/// Application state shared across all components
#[derive(Debug)]
pub struct AppState {
    pub config: Arc<AppConfig>,
}

/// Set up application logging with tracing
pub fn setup_logging() -> Result<()> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "markwriter=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    Ok(())
}

/// Create and configure the Tauri application
pub async fn create_app() -> Result<tauri::Builder<tauri::Wry>> {
    tracing::info!("Initializing MarkWriter application");

    // Load configuration
    let config = AppConfig::load().await?;
    let app_state = AppState {
        config: Arc::new(config),
    };

    // Build the Tauri application
    let app = tauri::Builder::default()
        .setup(move |app| {
            setup_app(app, app_state)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Core file operations
            commands::create_document,
            commands::open_document,
            commands::save_document,
            commands::save_document_as,
            commands::export_document,
            
            // Configuration
            commands::get_app_config,
            commands::update_app_config,
            
            // System integration
            commands::show_file_dialog,
            commands::show_save_dialog,
            commands::get_system_info,
        ])
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init());

    Ok(app)
}

/// Set up the application state and initialize components
fn setup_app(app: &mut App, app_state: AppState) -> Result<()> {
    tracing::info!("Setting up application components");

    // Store the application state
    app.manage(app_state);

    // Set up the main window - Updated for Tauri v2
    if let Some(window) = app.get_webview_window("main") {
        tracing::info!("Main window created successfully");
        
        // Set window title with version
        let title = format!("MarkWriter v{}", env!("CARGO_PKG_VERSION"));
        window.set_title(&title).map_err(|e| {
            MarkWriterError::system_error(format!("Failed to set window title: {}", e))
        })?;

        // Additional window setup can be added here
    }

    // Initialize event handlers
    setup_event_handlers(app.handle().clone())?;

    tracing::info!("Application setup completed successfully");
    Ok(())
}

/// Set up global event handlers
fn setup_event_handlers(app_handle: AppHandle) -> Result<()> {
    tracing::debug!("Setting up event handlers");
    
    // Example: Handle window events
    let app_handle_clone = app_handle.clone();
    tokio::spawn(async move {
        // Add any background tasks or event listeners here
        tracing::debug!("Background event handlers started");
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_app_creation() {
        setup_logging().expect("Failed to setup logging");
        let app_builder = create_app().await.expect("Failed to create app");
        
        // Basic test to ensure the app builder is created without errors
        assert!(true); // If we get here, the app was created successfully
    }
}
