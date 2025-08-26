// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use markwriter::app::{create_app, setup_logging};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize logging
    setup_logging()?;
    
    tracing::info!("Starting MarkWriter v2.0");
    
    // Create and run the Tauri application
    let app = create_app().await?;
    
    app.run(tauri::generate_context!())
        .expect("error while running tauri application");

    Ok(())
}
