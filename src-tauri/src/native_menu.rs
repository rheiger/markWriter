//! macOS screen menus. Mutating actions return through the same frontend command
//! authority, carrying the last synchronized view generation.
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MenuState {
    pub generation: u64,
    pub ready: bool,
    pub has_document: bool,
    pub modal: bool,
    pub markdown: bool,
    pub highlighting: bool,
    pub theme: String,
}
#[derive(Default)]
pub struct NativeState(pub Mutex<MenuState>);
#[derive(Clone, Serialize)]
pub struct Command { pub action: String, pub generation: u64 }

pub fn emit(app: &tauri::AppHandle, action: &str) {
    let state = app.state::<NativeState>();
    let Ok(state) = state.0.lock() else { return };
    if !state.modal || ["undo", "redo"].contains(&action) { let _ = app.emit("native-command", Command { action: action.into(), generation: state.generation }); }
}

#[tauri::command]
pub async fn sync_native_menu(app: tauri::AppHandle, state: MenuState) -> Result<(), String> {
    let (send, receive) = tokio::sync::oneshot::channel();
    let handle = app.clone();
    app.run_on_main_thread(move || { let _ = send.send(apply_menu_state(handle, state)); }).map_err(|e|e.to_string())?;
    receive.await.map_err(|e|e.to_string())?
}

// Keep generation comparison and native-menu mutation on the same UI thread;
// an older IPC completion cannot repaint state after a newer synchronization.
fn apply_menu_state(app: tauri::AppHandle, state: MenuState) -> Result<(), String> {
    let stored = app.state::<NativeState>();
    {
        let mut previous = stored.0.lock().map_err(|e| e.to_string())?;
        if state.generation < previous.generation { return Ok(()) }
        *previous = state.clone();
    }
    #[cfg(target_os = "macos")]
    if let Some(menu) = app.menu() {
        for id in ["save", "save-as", "save-all", "close-tab", "export", "find", "replace", "erd", "dot", "math", "markdown", "wysiwyg", "zoom-in", "zoom-out", "actual-size"] {
            if let Some(item) = menu.get(id) {
                match item {
                    tauri::menu::MenuItemKind::MenuItem(i) => i.set_enabled(state.has_document && !state.modal),
                    tauri::menu::MenuItemKind::Check(i) => i.set_enabled(state.has_document && !state.modal),
                    _ => Ok(()),
                }.map_err(|e| e.to_string())?;
            }
        }
        for (id, checked) in [("markdown",state.markdown),("wysiwyg",!state.markdown),("highlighting",state.highlighting),("theme-system",state.theme=="system"),("theme-light",state.theme=="light"),("theme-dark",state.theme=="dark")] {
            if let Some(tauri::menu::MenuItemKind::Check(item))=menu.get(id) { item.set_checked(checked).map_err(|e| e.to_string())?; }
        }
        for id in ["new","open","settings","about","help","updates","highlighting","theme-system","theme-light","theme-dark"] {
            if let Some(item)=menu.get(id) {
                match item { tauri::menu::MenuItemKind::MenuItem(i)=>i.set_enabled(!state.modal),tauri::menu::MenuItemKind::Check(i)=>i.set_enabled(!state.modal),_=>Ok(()) }.map_err(|e|e.to_string())?;
            }
        }
    }
    Ok(())
}

#[cfg(target_os = "macos")]
pub fn install(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::menu::{MenuBuilder, SubmenuBuilder, MenuItem, CheckMenuItem, PredefinedMenuItem};
    let item = |id: &str, label: &str, accelerator: Option<&str>| MenuItem::with_id(app,id,label,true,accelerator);
    let check = |id: &str, label: &str| CheckMenuItem::with_id(app,id,label,true,false,None::<&str>);
    let application=SubmenuBuilder::new(app,"MarkWriter")
        .item(&item("about","About MarkWriter",None)?)
        .item(&item("updates","Check for Updates…",None)?)
        .separator().item(&item("settings","Settings…",Some("CmdOrCtrl+,"))?)
        .separator().item(&PredefinedMenuItem::services(app,None)?)
        .separator().item(&PredefinedMenuItem::hide(app,None)?)
        .item(&PredefinedMenuItem::hide_others(app,None)?)
        .item(&PredefinedMenuItem::show_all(app,None)?)
        .separator().item(&item("quit","Quit MarkWriter",Some("CmdOrCtrl+Q"))?).build()?;
    let file=SubmenuBuilder::new(app,"File")
        .item(&item("new","New",Some("CmdOrCtrl+N"))?)
        .item(&item("open","Open…",Some("CmdOrCtrl+O"))?).separator()
        .item(&item("save","Save",Some("CmdOrCtrl+S"))?)
        .item(&item("save-as","Save As…",Some("CmdOrCtrl+Shift+S"))?)
        .item(&item("save-all","Save All",None)?)
        .item(&item("close-tab","Close Tab",Some("CmdOrCtrl+W"))?).separator()
        .item(&item("export","Export as HTML…",None)?).build()?;
    let edit=SubmenuBuilder::new(app,"Edit")
        .item(&item("undo","Undo",Some("CmdOrCtrl+Z"))?)
        .item(&item("redo","Redo",Some("CmdOrCtrl+Shift+Z"))?).separator()
        .item(&PredefinedMenuItem::cut(app,None)?)
        .item(&PredefinedMenuItem::copy(app,None)?)
        .item(&PredefinedMenuItem::paste(app,None)?)
        .item(&PredefinedMenuItem::select_all(app,None)?).separator()
        .item(&item("find","Find…",Some("CmdOrCtrl+F"))?)
        .item(&item("replace","Replace…",Some("CmdOrCtrl+Shift+H"))?).build()?;
    let insert=SubmenuBuilder::new(app,"Insert")
        .item(&item("erd","Mermaid ERD",None)?)
        .item(&item("dot","DOT",None)?)
        .item(&item("math","Math block",None)?).build()?;
    let theme=SubmenuBuilder::new(app,"Theme")
        .item(&check("theme-system","Auto")?).item(&check("theme-light","Light")?).item(&check("theme-dark","Dark")?).build()?;
    let view=SubmenuBuilder::new(app,"View")
        .item(&check("markdown","Markdown with preview")?).item(&check("wysiwyg","WYSIWYG")?).separator()
        .item(&check("highlighting","Syntax highlighting")?).item(&theme).separator()
        .item(&item("zoom-in","Zoom In",Some("CmdOrCtrl+="))?)
        .item(&item("zoom-out","Zoom Out",Some("CmdOrCtrl+-"))?)
        .item(&item("actual-size","Actual Size",Some("CmdOrCtrl+0"))?).build()?;
    let window=SubmenuBuilder::new(app,"Window")
        .item(&PredefinedMenuItem::minimize(app,None)?)
        .item(&PredefinedMenuItem::maximize(app,None)?)
        .item(&PredefinedMenuItem::fullscreen(app,None)?).build()?;
    let help=SubmenuBuilder::new(app,"Help").item(&item("help","User Guide",None)?).build()?;
    app.set_menu(MenuBuilder::new(app).items(&[&application,&file,&edit,&insert,&view,&window,&help]).build()?)?;
    app.on_menu_event(|app,event| emit(app,event.id().as_ref()));
    Ok(())
}
