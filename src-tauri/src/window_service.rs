//! Tauri transport and native lifecycle for editor windows.
use crate::{document_disk, persistence, storage_file, Document};
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    path::Path,
    sync::{Mutex, MutexGuard},
};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

mod state;
use state::*;

#[derive(Default)]
pub struct WindowService(Mutex<Windows>);

impl WindowService {
    fn lock(&self) -> Result<MutexGuard<'_, Windows>, String> {
        self.0
            .lock()
            .map_err(|_| fail("The editor window service is unavailable."))
    }
}

pub fn build_windows(app: &AppHandle) -> tauri::Result<()> {
    let storage = storage_file(app, "workspace")
        .and_then(|path| persistence::read_json(&path))
        .and_then(|value| value.map(Windows::restore).transpose());
    let state = match storage {
        Ok(restored) => restored.unwrap_or_default(),
        Err(error) => {
            let mut state = Windows::default();
            state.startup_error = Some(error);
            state
        }
    };
    let labels: Vec<_> = state
        .windows
        .iter()
        .map(|(label, window)| (label.clone(), window.saved.geometry))
        .collect();
    let service = app.state::<WindowService>();
    *service.0.lock().unwrap() = state;
    for (label, geometry) in labels {
        if let Err(error) = build_window(app, &label, geometry) {
            if label == MAIN {
                return Err(error);
            }
            let mut state = service.0.lock().unwrap();
            state.recover_into_main(&label);
            let message = format!(
                "A saved window could not reopen. Its documents are in the primary window: {error}"
            );
            let _ = state.record(MAIN).unwrap().os_open.reject_batch(&message);
        }
    }
    Ok(())
}

fn build_window(
    app: &AppHandle,
    label: &str,
    geometry: Option<Geometry>,
) -> tauri::Result<WebviewWindow> {
    let mut config = app
        .config()
        .app
        .windows
        .iter()
        .find(|config| config.label == MAIN)
        .expect("Configured main window")
        .clone();
    config.label = label.into();
    let window = tauri::WebviewWindowBuilder::from_config(app, &config)?
        .on_web_resource_request(|request, response| {
            use crate::dot_policy;
            let path = request.uri().path();
            let csp = if dot_policy::is_dot_worker(path) {
                eprintln!("[DOT] worker response CSP: {}", dot_policy::WORKER_CSP);
                Some(dot_policy::WORKER_CSP)
            } else if dot_policy::is_math_worker(path)
                || dot_policy::is_regex_worker(path)
                || dot_policy::is_dbml_worker(path)
                || dot_policy::is_sql_worker(path)
            {
                Some(dot_policy::LOCAL_WORKER_CSP)
            } else {
                None
            };
            if let Some(csp) = csp {
                response.headers_mut().insert(
                    "Content-Security-Policy",
                    tauri::http::HeaderValue::from_static(csp),
                );
                response.headers_mut().insert(
                    "X-Content-Type-Options",
                    tauri::http::HeaderValue::from_static("nosniff"),
                );
            }
        })
        .build()?;
    if let Some(geometry) = geometry {
        geometry.apply(&window);
    } else if label != MAIN {
        // Offset a new window so both workspaces remain easy to distinguish.
        if let Ok(position) = window.outer_position() {
            let _ = window.set_position(tauri::PhysicalPosition::new(
                position.x.saturating_add(28),
                position.y.saturating_add(28),
            ));
        }
    }
    Ok(window)
}

pub fn target(app: &AppHandle) -> Option<String> {
    app.state::<WindowService>().lock().ok()?.target()
}

pub(crate) fn announce(app: &AppHandle) {
    let _ = app.emit("editor-windows-changed", ());
}

pub fn on_window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    let app = window.app_handle();
    match event {
        tauri::WindowEvent::CloseRequested { api, .. } => api.prevent_close(),
        tauri::WindowEvent::Focused(true) => {
            if let Ok(mut state) = app.state::<WindowService>().lock() {
                if state.windows.contains_key(window.label()) {
                    state.focused = Some(window.label().into());
                }
            }
            crate::native_menu::refresh_focused(app);
            announce(app);
        }
        tauri::WindowEvent::Destroyed => {
            let cancelled = app
                .state::<WindowService>()
                .lock()
                .ok()
                .and_then(|mut state| {
                    state.remove(window.label());
                    if state.exiting {
                        return None;
                    }
                    state.quitting.take().map(|quit| quit.token)
                });
            crate::native_menu::remove(app, window.label());
            if let Some(token) = cancelled {
                cancel_notice(
                    app,
                    &token,
                    Some("A window closed before all quit choices were reviewed."),
                );
            }
            announce(app);
        }
        _ => {}
    }
}

#[tauri::command]
pub async fn create_editor_window(app: AppHandle) -> Result<String, String> {
    let label = format!("editor-{}", uuid::Uuid::new_v4());
    let service = app.state::<WindowService>();
    {
        let mut state = service.lock()?;
        if state.exiting || state.quitting.is_some() {
            return Err(fail("Finish the current quit request first."));
        }
        if state.windows.len() >= WINDOW_LIMIT {
            return Err(fail("All 12 editor window slots are in use."));
        }
        state.windows.insert(label.clone(), EditorWindow::default());
    }
    match build_window(&app, &label, None) {
        Ok(_) => {
            announce(&app);
            Ok(label)
        }
        Err(error) => {
            service.lock()?.remove(&label);
            Err(format!("Could not open an editor window: {error}"))
        }
    }
}

#[derive(Serialize)]
pub struct WindowInfo {
    label: String,
    title: String,
    focused: bool,
    ready: bool,
}

#[tauri::command]
pub async fn list_editor_windows(app: AppHandle) -> Result<Vec<WindowInfo>, String> {
    let service = app.state::<WindowService>();
    let (labels, focused) = {
        let state = service.lock()?;
        (
            state.windows.iter().map(|(label, window)| (label.clone(), window.ready)).collect::<Vec<_>>(),
            state.target(),
        )
    };
    Ok(labels
        .into_iter()
        .filter_map(|(label, ready)| {
            let window = app.get_webview_window(&label)?;
            Some(WindowInfo {
                ready,
                focused: focused.as_ref() == Some(&label),
                title: window.title().unwrap_or_else(|_| "MarkWriter".into()),
                label,
            })
        })
        .collect())
}

fn focus(app: &AppHandle, label: &str) -> Result<WebviewWindow, String> {
    let window = app
        .get_webview_window(label)
        .ok_or("This editor window is closed.")?;
    present_window(&window)?;
    Ok(window)
}

fn present_window(window: &WebviewWindow) -> Result<(), String> {
    window.unminimize().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn focus_editor_window(
    app: AppHandle,
    label: String,
    id: Option<String>,
) -> Result<(), String> {
    let id_to_emit = {
        let service = app.state::<WindowService>();
        let mut state = service.lock()?;
        if let Some(id) = &id {
            state.owned(&label, id)?;
        }
        let record = state
            .windows
            .get_mut(&label)
            .ok_or("This editor window is closed.")?;
        if record.ready {
            id
        } else {
            if id.is_some() {
                record.pending_focus = id;
            }
            None
        }
    };
    focus(&app, &label)?;
    if let Some(id) = id_to_emit {
        emit_focus_document(&app, &label, &id)?;
    }
    Ok(())
}

fn emit_focus_document(app: &AppHandle, label: &str, id: &str) -> Result<(), String> {
    app.emit_to(label, "editor-focus-document", json!({ "id": id }))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn mark_editor_window_ready(
    window: WebviewWindow,
    service: State<'_, WindowService>,
) -> Result<(), String> {
    let pending = {
        let mut state = service.lock()?;
        let record = state
            .windows
            .get_mut(window.label())
            .ok_or("This editor window is closed.")?;
        record.ready = true;
        record.pending_focus.take()
    };
    if let Some(id) = pending {
        emit_focus_document(window.app_handle(), window.label(), &id)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn load_workspace(
    window: WebviewWindow,
    service: State<'_, WindowService>,
) -> Result<Option<Value>, String> {
    let state = service.lock()?;
    if let Some(error) = &state.startup_error {
        return Err(error.clone());
    }
    let record = state.record(window.label())?;
    let mut snapshot = record.saved.workspace.clone();
    if let Some(snapshot) = snapshot.as_mut() {
        snapshot["windowEpoch"] = json!(record.epoch);
    }
    Ok(snapshot)
}

#[tauri::command]
pub async fn save_workspace(
    window: WebviewWindow,
    service: State<'_, WindowService>,
    value: Value,
    epoch: Option<u64>,
) -> Result<(), WorkspaceWriteError> {
    let path = storage_file(window.app_handle(), "workspace")?;
    let geometry = Geometry::read(&window);
    service
        .lock()?
        .save(&path, window.label(), epoch.unwrap_or(0), value, geometry)
}

pub fn retain_rejected_workspace(app: &AppHandle, label: &str) -> Result<(), String> {
    let path = storage_file(app, "workspace")?;
    let service = app.state::<WindowService>();
    let mut state = service.lock()?;
    persistence::retain_rejected(&path)?;
    state.startup_error = None;
    if let Some(window) = state.windows.get_mut(label) {
        window.saved.workspace = None;
    }
    state.claims.retain(|_, claim| claim.owner.label != label);
    Ok(())
}

#[tauri::command]
pub async fn finish_editor_window_close(
    window: WebviewWindow,
    service: State<'_, WindowService>,
    value: Value,
    epoch: Option<u64>,
) -> Result<(), String> {
    let path = storage_file(window.app_handle(), "workspace")?;
    let geometry = Geometry::read(&window);
    service
        .lock()?
        .close(&path, window.label(), epoch.unwrap_or(0), value, geometry)?;
    window.destroy().map_err(|error| error.to_string())
}

pub fn register_document(label: &str, service: &WindowService, id: &str) -> Result<(), String> {
    service.lock()?.claim(label, id, None).map(|_| ())
}

#[tauri::command]
pub async fn claim_document_path(
    window: WebviewWindow,
    service: State<'_, WindowService>,
    id: String,
    path: Option<String>,
) -> Result<Option<Value>, String> {
    let mut state = service.lock()?;
    if state.incoming(window.label(), &id) {
        return Ok(None);
    }
    let resolved = path
        .map(|path| {
            if !Path::new(&path).is_absolute() {
                return Err(fail("The document path must be absolute."));
            }
            // Recovered owners keep their original leaf if it has been replaced.
            crate::canonical_document_path(path, None, Some(state.owned_paths()))
        })
        .transpose()?;
    state
        .claim(window.label(), &id, resolved)
        .map(|owner| owner.map(|owner| json!(owner)))
}

#[tauri::command]
pub async fn release_document_claim(
    window: WebviewWindow,
    service: State<'_, WindowService>,
    id: String,
) -> Result<(), String> {
    service.lock()?.release_claim(window.label(), &id);
    Ok(())
}

#[derive(Serialize)]
#[serde(untagged)]
pub enum OpenResult {
    Opened { document: Document },
    Existing { owner: Owner },
}

#[tauri::command]
pub async fn open_owned_document(
    window: WebviewWindow,
    service: State<'_, WindowService>,
    path: String,
) -> Result<OpenResult, String> {
    let mut state = service.lock()?;
    state.ensure_document_mutation(window.label())?;
    let path = crate::canonical_document_path(path, None, None)?;
    if let Some(owner) = state.path_owner(&path) {
        return Ok(OpenResult::Existing {
            owner: owner.clone(),
        });
    }
    let document = crate::read_document_from_path(path.clone())?;
    state.claim(window.label(), &document.id, Some(path))?;
    Ok(OpenResult::Opened { document })
}

pub fn save_document(
    service: &WindowService,
    label: &str,
    id: &str,
    content: &str,
    path: &str,
    expected: Option<&str>,
) -> Result<String, document_disk::SaveError> {
    use document_disk::SaveError;
    let mut state = service.lock().map_err(SaveError::Io)?;
    state
        .ensure_document_mutation(label)
        .map_err(SaveError::Io)?;
    let claim = state.owned(label, id).map_err(SaveError::Io)?;
    let canonical = if expected.is_some() {
        let existing = Path::new(path);
        let canonical = document_disk::canonical_path(existing, true)?
            .to_string_lossy()
            .into_owned();
        if claim.path.as_deref() != Some(canonical.as_str()) {
            return Err(SaveError::Io(fail(
                "The document no longer owns this save destination.",
            )));
        }
        canonical
    } else {
        let destination = document_disk::save_as_path(Path::new(path), &state.owned_paths())?;
        let canonical = destination.to_string_lossy().into_owned();
        if state.path_owner(&canonical).is_some() {
            return Err(SaveError::Io(fail("That file is already owned by an open tab. Activate it or choose another destination.")));
        }
        canonical
    };

    // The mutex covers the file operation and the ownership update as one reservation.
    document_disk::write(Path::new(&canonical), content, expected)?;
    if expected.is_none() {
        state.finish_save_as(label, id, &canonical, content);
    }
    Ok(canonical)
}

pub fn write_unowned(
    service: &WindowService,
    label: &str,
    path: &str,
    content: &str,
    copy: bool,
) -> Result<(), String> {
    let state = service.lock()?;
    state.ensure_document_mutation(label)?;
    let destination = document_disk::save_as_path(Path::new(path), &state.owned_paths())
        .map_err(|error| format!("Cannot resolve destination: {error}"))?;
    if state.path_owner(&destination.to_string_lossy()).is_some() {
        return Err(fail(
            "That destination belongs to an open document. Choose a different file.",
        ));
    }
    if copy {
        return document_disk::write_copy(&destination, content)
            .map_err(|error| format!("Could not save a copy to a new file: {error}"));
    }
    document_disk::write(&destination, content, None).map_err(|error| match error {
        document_disk::SaveError::Io(message) => message,
        document_disk::SaveError::Conflict { .. } => fail("Could not export HTML."),
    })
}

#[tauri::command]
pub async fn move_editor_document(
    window: WebviewWindow,
    service: State<'_, WindowService>,
    destination: String,
    id: String,
    source: Value,
    epoch: u64,
    session: Option<Value>,
    transaction_id: String,
) -> Result<Value, String> {
    let app = window.app_handle();
    let path = storage_file(app, "workspace")?;
    let geometry = Geometry::read(&window);
    let epoch = service.lock()?.move_document(
        &path,
        MoveRequest {
            label: window.label(),
            destination: &destination,
            id: &id,
            source,
            epoch,
            session,
            transaction_id: &transaction_id,
            geometry,
        },
    )?;
    let _ = app.emit_to(&destination, "editor-transfer-pending", ());
    Ok(json!({ "epoch": epoch }))
}

#[tauri::command]
pub async fn take_editor_transfers(
    window: WebviewWindow,
    service: State<'_, WindowService>,
) -> Result<Value, String> {
    let state = service.lock()?;
    let record = state.record(window.label())?;
    Ok(json!({ "epoch": record.epoch, "transfers": record.transfers }))
}

#[tauri::command]
pub async fn ack_editor_transfer(
    window: WebviewWindow,
    service: State<'_, WindowService>,
    id: String,
) -> Result<(), String> {
    let mut state = service.lock()?;
    let record = state
        .windows
        .get_mut(window.label())
        .ok_or("This editor window is closed.")?;
    record
        .transfers
        .retain(|transfer| transfer.document["id"] != id);
    Ok(())
}

#[tauri::command]
pub async fn editor_document_owner(
    window: WebviewWindow,
    service: State<'_, WindowService>,
    id: String,
) -> Result<Value, String> {
    let state = service.lock()?;
    let owner = state.claims.get(&id).map(|claim| &claim.owner);
    Ok(json!({ "owner": owner, "epoch": state.record(window.label())?.epoch }))
}

pub fn enqueue_os_open(app: &AppHandle, enqueue: impl FnOnce(&crate::os_open::OpenQueue)) {
    enqueue_os_open_with_present(app, enqueue, |_| false);
}

pub(crate) fn enqueue_os_open_with_present(
    app: &AppHandle,
    enqueue: impl FnOnce(&crate::os_open::OpenQueue),
    present: impl FnOnce(&WebviewWindow) -> bool,
) {
    let label = app.state::<WindowService>().lock().ok().and_then(|state| {
        let label = state.target()?;
        enqueue(&state.windows.get(&label)?.os_open);
        Some(label)
    });
    if let Some(label) = label {
        let _ = app.emit_to(&label, "os-open-pending", ());
        if let Some(window) = app.get_webview_window(&label) {
            if !present(&window) {
                let _ = present_window(&window);
            }
        }
    }
}

#[tauri::command]
pub fn take_os_open(
    window: WebviewWindow,
    service: State<'_, WindowService>,
) -> Result<Value, String> {
    let state = service.lock()?;
    let batch = state.record(window.label())?.os_open.drain()?;
    Ok(json!({ "paths": batch.paths, "errors": batch.errors }))
}

fn cancel_notice(app: &AppHandle, token: &str, message: Option<&str>) {
    let _ = app.emit(
        "editor-quit-cancelled",
        json!({ "token": token, "message": message }),
    );
}

fn prompt_quit(app: &AppHandle, label: &str, token: &str) -> Result<(), String> {
    focus(app, label)?;
    app.emit_to(label, "editor-quit-requested", json!({ "token": token }))
        .map_err(|error| error.to_string())
}

pub fn initiate_quit(app: &AppHandle) -> Result<(), String> {
    let service = app.state::<WindowService>();
    let first_request = service.lock()?.begin_quit()?;
    let Some((first, token)) = first_request else {
        return Ok(());
    };
    if let Err(error) = prompt_quit(app, &first, &token) {
        service.lock()?.quitting = None;
        cancel_notice(app, &token, Some(&error));
        return Err(error);
    }
    Ok(())
}

#[cfg(target_os = "macos")]
pub fn intercept_exit(app: &AppHandle) -> bool {
    app.state::<WindowService>()
        .lock()
        .is_ok_and(|state| !state.exiting && state.target().is_some())
}

#[tauri::command]
pub async fn quit_app(app: AppHandle) -> Result<(), String> {
    initiate_quit(&app)
}

#[tauri::command]
pub async fn answer_app_quit(
    window: WebviewWindow,
    service: State<'_, WindowService>,
    token: String,
    allowed: bool,
    value: Option<Value>,
    epoch: Option<u64>,
) -> Result<(), String> {
    let app = window.app_handle();
    let path = storage_file(app, "workspace")?;
    let answer = if allowed {
        Some((
            epoch.unwrap_or(0),
            value.ok_or("A prepared workspace is required before quitting.")?,
            Geometry::read(&window),
        ))
    } else {
        None
    };
    let result = {
        let mut state = service.lock()?;
        let result = state.answer_quit(&path, window.label(), &token, answer);
        if result.is_err()
            && state.quitting.as_ref().is_some_and(|quit| {
                quit.token == token
                    && quit
                        .pending
                        .front()
                        .is_some_and(|label| label == window.label())
            })
        {
            state.quitting = None;
        }
        result
    };
    match result {
        Ok(QuitProgress::Next(next)) => {
            if let Err(error) = prompt_quit(app, &next, &token) {
                service.lock()?.quitting = None;
                cancel_notice(app, &token, Some(&error));
                return Err(error);
            }
        }
        Ok(QuitProgress::Cancelled) => cancel_notice(app, &token, None),
        Ok(QuitProgress::Exit) => app.exit(0),
        Err(error) => {
            cancel_notice(app, &token, Some(&error));
            return Err(error);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests;
