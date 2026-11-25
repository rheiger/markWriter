//! Serialized editor ownership and recovery transactions.
use crate::persistence;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, HashMap, HashSet, VecDeque},
    path::Path,
};
use tauri::WebviewWindow;

pub(super) const MAIN: &str = "main";
pub(super) const WINDOW_LIMIT: usize = 12;
const TRANSFER_LIMIT: usize = 16;
const HISTORY_LIMIT: usize = 8 * 1024 * 1024;

#[derive(Clone, Copy, Deserialize, Serialize)]
pub struct Geometry {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    maximized: bool,
}

impl Geometry {
    pub(super) fn read(window: &WebviewWindow) -> Option<Self> {
        let position = window.outer_position().ok()?;
        let size = window.inner_size().ok()?;
        Some(Self {
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
            maximized: window.is_maximized().ok()?,
        })
    }

    pub(super) fn apply(self, window: &WebviewWindow) {
        if !(400..=16_000).contains(&self.width) || !(300..=16_000).contains(&self.height) {
            return;
        }
        if window
            .available_monitors()
            .unwrap_or_default()
            .iter()
            .any(|monitor| {
                let position = monitor.position();
                let size = monitor.size();
                self.x >= position.x
                    && self.y >= position.y
                    && i64::from(self.x) + 100 <= i64::from(position.x) + i64::from(size.width)
                    && i64::from(self.y) + 100 <= i64::from(position.y) + i64::from(size.height)
            })
        {
            let _ = window.set_size(tauri::PhysicalSize::new(self.width, self.height));
            let _ = window.set_position(tauri::PhysicalPosition::new(self.x, self.y));
        }
        if self.maximized {
            let _ = window.maximize();
        }
    }
}

#[derive(Clone, Default)]
pub(super) struct SavedWindow {
    pub(super) workspace: Option<Value>,
    pub(super) geometry: Option<Geometry>,
}

#[derive(Default)]
pub(super) struct EditorWindow {
    pub(super) saved: SavedWindow,
    pub(super) epoch: u64,
    pub(super) ready: bool,
    pub(super) pending_focus: Option<String>,
    pub(super) transfers: Vec<Transfer>,
    pub(super) os_open: crate::os_open::OpenQueue,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Owner {
    pub(super) label: String,
    pub(super) id: String,
}

#[derive(Clone)]
pub(super) struct DocumentClaim {
    pub(super) owner: Owner,
    pub(super) path: Option<String>,
}

#[derive(Clone, Serialize)]
pub(super) struct Transfer {
    pub(super) document: Value,
    pub(super) session: Option<Value>,
}

#[derive(Clone)]
struct CompletedMove {
    token: String,
    source: String,
    destination: String,
    id: String,
    epoch: u64,
}

pub(super) struct Quit {
    pub(super) token: String,
    pub(super) pending: VecDeque<String>,
    pub(super) snapshots: BTreeMap<String, SavedWindow>,
}

pub(super) struct Windows {
    pub(super) windows: BTreeMap<String, EditorWindow>,
    pub(super) claims: HashMap<String, DocumentClaim>,
    pub(super) focused: Option<String>,
    pub(super) quitting: Option<Quit>,
    pub(super) exiting: bool,
    pub(super) startup_error: Option<String>,
    completed: VecDeque<CompletedMove>,
}

impl Default for Windows {
    fn default() -> Self {
        Self {
            windows: BTreeMap::from([(MAIN.into(), EditorWindow::default())]),
            claims: HashMap::new(),
            focused: Some(MAIN.into()),
            quitting: None,
            exiting: false,
            startup_error: None,
            completed: VecDeque::new(),
        }
    }
}

pub(super) fn fail(message: &str) -> String {
    message.into()
}

pub(super) fn blank_workspace() -> Value {
    json!({ "version": 1, "activeId": null, "documents": [], "fileViews": [] })
}

fn clean_workspace(mut value: Value) -> Result<Value, String> {
    let Some(version) = value.get("version").and_then(Value::as_u64) else {
        return Err(fail("Invalid workspace version."));
    };
    if version > 1 {
        return Err(fail("Unsupported workspace version."));
    }
    let Some(documents) = value.get("documents").and_then(Value::as_array) else {
        return Err(fail("Invalid workspace documents."));
    };
    let mut ids = HashSet::new();
    for document in documents {
        let id = document_id(document)?;
        if !ids.insert(id) {
            return Err(fail("Duplicate workspace document ID."));
        }
        document_path(document)?;
    }
    let object = value.as_object_mut().ok_or("Invalid workspace snapshot.")?;
    object.remove("windows");
    object.remove("windowGeometry");
    object.remove("windowEpoch");
    object.insert("version".into(), json!(1));
    Ok(value)
}

fn document_id(document: &Value) -> Result<&str, String> {
    document
        .get("id")
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())
        .ok_or_else(|| fail("Invalid workspace document identity."))
}

fn document_path(document: &Value) -> Result<Option<&str>, String> {
    match document.get("path") {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(path)) if Path::new(path).is_absolute() => Ok(Some(path)),
        _ => Err(fail("Invalid workspace document path.")),
    }
}

pub(super) fn persisted_workspace(snapshots: &BTreeMap<String, SavedWindow>) -> Value {
    let primary = snapshots
        .get_key_value(MAIN)
        .or_else(|| snapshots.first_key_value());
    let Some((primary_label, primary)) = primary else {
        return blank_workspace();
    };
    let mut value = primary.workspace.clone().unwrap_or_else(blank_workspace);
    if let Some(geometry) = primary.geometry {
        value["windowGeometry"] = json!(geometry);
    }
    let other: Vec<_> = snapshots
        .iter()
        .filter(|(label, _)| *label != primary_label)
        .map(|(label, saved)| {
            json!({
                "label": label,
                "workspace": saved.workspace.clone().unwrap_or_else(blank_workspace),
                "geometry": saved.geometry,
            })
        })
        .collect();
    if !other.is_empty() {
        value["windows"] = json!(other);
    }
    value
}

fn valid_secondary_label(label: &str) -> bool {
    label.strip_prefix("editor-").is_some_and(|suffix| {
        uuid::Uuid::parse_str(suffix).is_ok_and(|uuid| uuid.to_string() == suffix)
    })
}

impl Windows {
    pub(super) fn restore(value: Value) -> Result<Self, String> {
        let mut restored = Self::default();
        let main = SavedWindow {
            workspace: Some(clean_workspace(value.clone())?),
            geometry: value
                .get("windowGeometry")
                .and_then(|value| serde_json::from_value(value.clone()).ok()),
        };
        restored.windows.get_mut(MAIN).unwrap().saved = main;
        if let Some(secondary) = value.get("windows") {
            let windows = secondary.as_array().ok_or("Invalid saved window list.")?;
            if windows.len() >= WINDOW_LIMIT {
                return Err(fail("Too many saved editor windows."));
            }
            for entry in windows {
                let label = entry["label"]
                    .as_str()
                    .filter(|label| valid_secondary_label(label))
                    .ok_or("Invalid saved editor window label.")?;
                let saved = SavedWindow {
                    workspace: Some(clean_workspace(entry["workspace"].clone())?),
                    geometry: serde_json::from_value(entry["geometry"].clone()).ok(),
                };
                if restored
                    .windows
                    .insert(
                        label.into(),
                        EditorWindow {
                            saved,
                            ..EditorWindow::default()
                        },
                    )
                    .is_some()
                {
                    return Err(fail("Duplicate saved editor window."));
                }
            }
        }
        for (label, window) in &restored.windows {
            if let Some(value) = &window.saved.workspace {
                for document in value["documents"].as_array().unwrap() {
                    let id = document_id(document)?.to_owned();
                    let path = document_path(document)?.map(str::to_owned);
                    if restored.claims.contains_key(&id)
                        || path
                            .as_deref()
                            .is_some_and(|path| restored.path_owner(path).is_some())
                    {
                        return Err(fail("Duplicate document ownership in saved windows."));
                    }
                    restored.claims.insert(
                        id.clone(),
                        DocumentClaim {
                            owner: Owner {
                                label: label.clone(),
                                id,
                            },
                            path,
                        },
                    );
                }
            }
        }
        Ok(restored)
    }

    pub(super) fn recover_into_main(&mut self, label: &str) {
        let Some(window) = self.windows.remove(label) else {
            return;
        };
        for claim in self
            .claims
            .values_mut()
            .filter(|claim| claim.owner.label == label)
        {
            claim.owner.label = MAIN.into();
        }
        if let Some(mut snapshot) = window.saved.workspace {
            let main = self.windows.get_mut(MAIN).unwrap();
            let saved = main.saved.workspace.get_or_insert_with(blank_workspace);
            if saved["activeId"].is_null() {
                saved["activeId"] = snapshot["activeId"].take();
            }
            saved["documents"]
                .as_array_mut()
                .unwrap()
                .append(snapshot["documents"].as_array_mut().unwrap());
        }
    }

    pub(super) fn target(&self) -> Option<String> {
        self.focused
            .as_ref()
            .filter(|label| self.windows.contains_key(*label))
            .cloned()
            .or_else(|| self.windows.keys().next().cloned())
    }

    pub(super) fn record(&self, label: &str) -> Result<&EditorWindow, String> {
        self.windows
            .get(label)
            .ok_or_else(|| fail("This editor window is closed."))
    }

    fn ensure_current(&self, label: &str, epoch: u64) -> Result<(), String> {
        if let Some(error) = &self.startup_error {
            return Err(error.clone());
        }
        if self.exiting
            || self.record(label)?.epoch != epoch
            || self
                .quitting
                .as_ref()
                .is_some_and(|quit| quit.snapshots.contains_key(label))
        {
            return Err(fail(
                "The editor window changed. Refresh its workspace and try again.",
            ));
        }
        Ok(())
    }

    pub(super) fn incoming(&self, label: &str, id: &str) -> bool {
        self.windows.get(label).is_some_and(|window| {
            window
                .transfers
                .iter()
                .any(|transfer| transfer.document["id"] == id)
        })
    }

    pub(super) fn path_owner(&self, path: &str) -> Option<&Owner> {
        self.claims.values().find_map(|claim| {
            claim
                .path
                .as_ref()
                .filter(|owned| Path::new(owned) == Path::new(path))
                .map(|_| &claim.owner)
        })
    }

    pub(super) fn owned_paths(&self) -> Vec<String> {
        self.claims
            .values()
            .filter_map(|claim| claim.path.clone())
            .collect()
    }

    pub(super) fn owned(&self, label: &str, id: &str) -> Result<&DocumentClaim, String> {
        self.claims
            .get(id)
            .filter(|claim| claim.owner.label == label)
            .ok_or_else(|| fail("The document no longer belongs to this window."))
    }

    fn check_workspace_ownership(&self, label: &str, value: &Value) -> Result<(), String> {
        for document in value["documents"].as_array().unwrap() {
            let id = document_id(document)?;
            if self
                .claims
                .get(id)
                .is_some_and(|claim| claim.owner.label != label)
                || document_path(document)?
                    .and_then(|path| self.path_owner(path))
                    .is_some_and(|owner| owner.label != label || owner.id != id)
            {
                return Err(fail(
                    "A document in this snapshot belongs to another tab or window.",
                ));
            }
        }
        Ok(())
    }

    pub(super) fn saved(&self) -> BTreeMap<String, SavedWindow> {
        self.windows
            .iter()
            .filter(|(label, window)| *label == MAIN || window.saved.workspace.is_some())
            .map(|(label, window)| (label.clone(), window.saved.clone()))
            .collect()
    }

    fn commit(
        &mut self,
        path: &Path,
        snapshots: BTreeMap<String, SavedWindow>,
    ) -> Result<(), String> {
        persistence::write_json(path, &persisted_workspace(&snapshots))?;
        for (label, saved) in snapshots {
            if let Some(window) = self.windows.get_mut(&label) {
                window.saved = saved;
            }
        }
        Ok(())
    }

    pub(super) fn save(
        &mut self,
        path: &Path,
        label: &str,
        epoch: u64,
        value: Value,
        geometry: Option<Geometry>,
    ) -> Result<(), String> {
        self.ensure_current(label, epoch)?;
        let value = clean_workspace(value)?;
        self.check_workspace_ownership(label, &value)?;
        if self.record(label)?.transfers.iter().any(|transfer| {
            !value["documents"]
                .as_array()
                .unwrap()
                .iter()
                .any(|doc| doc["id"] == transfer.document["id"])
        }) {
            return Err(fail(
                "Finish accepting the incoming tab before saving this workspace.",
            ));
        }
        let mut snapshots = self.saved();
        snapshots.insert(
            label.into(),
            SavedWindow {
                workspace: Some(value),
                geometry,
            },
        );
        self.commit(path, snapshots)
    }

    pub(super) fn claim(
        &mut self,
        label: &str,
        id: &str,
        path: Option<String>,
    ) -> Result<Option<Owner>, String> {
        self.record(label)?;
        if self.exiting {
            return Err(fail("MarkWriter is quitting."));
        }
        if let Some(claim) = self
            .claims
            .get(id)
            .filter(|claim| claim.owner.label != label)
        {
            return Ok(Some(claim.owner.clone()));
        }
        if let Some(owner) = path
            .as_deref()
            .and_then(|path| self.path_owner(path))
            .filter(|owner| owner.id != id)
        {
            return Ok(Some(owner.clone()));
        }
        self.claims.insert(
            id.into(),
            DocumentClaim {
                owner: Owner {
                    label: label.into(),
                    id: id.into(),
                },
                path,
            },
        );
        Ok(None)
    }

    pub(super) fn close(
        &mut self,
        path: &Path,
        label: &str,
        epoch: u64,
        value: Value,
        geometry: Option<Geometry>,
    ) -> Result<(), String> {
        self.ensure_current(label, epoch)?;
        if self.quitting.is_some() || !self.record(label)?.transfers.is_empty() {
            return Err(fail(
                "Finish the current quit or tab move before closing this window.",
            ));
        }
        let mut snapshots = self.saved();
        if self.windows.len() == 1 {
            let value = clean_workspace(value)?;
            self.check_workspace_ownership(label, &value)?;
            snapshots.insert(
                label.into(),
                SavedWindow {
                    workspace: Some(value),
                    geometry,
                },
            );
        } else {
            snapshots.remove(label);
        }
        // A new live window with no prior disk snapshot must not revive the closed one.
        if snapshots.is_empty() && self.windows.len() > 1 {
            let remaining = self
                .windows
                .keys()
                .find(|key| key.as_str() != label)
                .unwrap();
            snapshots.insert(remaining.clone(), SavedWindow::default());
        }
        self.commit(path, snapshots)?;
        self.remove(label);
        Ok(())
    }

    pub(super) fn remove(&mut self, label: &str) {
        self.windows.remove(label);
        self.claims.retain(|_, claim| claim.owner.label != label);
        if self.focused.as_deref() == Some(label) {
            self.focused = self.target();
        }
    }

    pub(super) fn move_document(
        &mut self,
        path: &Path,
        request: MoveRequest<'_>,
    ) -> Result<u64, String> {
        let MoveRequest {
            label,
            destination,
            id,
            source,
            epoch,
            session,
            transaction_id,
            geometry,
        } = request;
        if let Some(receipt) = self
            .completed
            .iter()
            .find(|receipt| receipt.token == transaction_id)
        {
            if receipt.source == label && receipt.destination == destination && receipt.id == id {
                return Ok(receipt.epoch);
            }
            return Err(fail(
                "This move transaction ID already belongs to another document.",
            ));
        }
        self.ensure_current(label, epoch)?;
        if self.quitting.is_some()
            || label == destination
            || transaction_id.is_empty()
            || transaction_id.len() > 128
        {
            return Err(fail("The requested tab move is unavailable."));
        }
        let pending = self
            .windows
            .values()
            .map(|window| window.transfers.len())
            .sum::<usize>();
        if pending >= TRANSFER_LIMIT {
            return Err(fail("Wait for pending tab moves to finish."));
        }
        let target = self.record(destination)?;
        if session
            .as_ref()
            .is_some_and(|value| value.to_string().len() > HISTORY_LIMIT)
        {
            return Err(fail("The editor history is too large to move safely."));
        }
        if self.incoming(label, id) {
            return Err(fail("Finish accepting this tab before moving it again."));
        }
        let owner = self.owned(label, id)?;
        let mut source = clean_workspace(source)?;
        self.check_workspace_ownership(label, &source)?;
        let source_documents = source["documents"].as_array_mut().unwrap();
        let position = source_documents
            .iter()
            .position(|doc| doc["id"] == id)
            .ok_or("The current source snapshot no longer contains the tab.")?;
        let document = source_documents.remove(position);
        if document_path(&document)? != owner.path.as_deref() {
            return Err(fail("The document path changed before the tab could move."));
        }
        let next = source_documents
            .get(position.min(source_documents.len().saturating_sub(1)))
            .map(|doc| doc["id"].clone())
            .unwrap_or(Value::Null);
        if source["activeId"] == id {
            source["activeId"] = next;
        }
        let mut target_workspace = target
            .saved
            .workspace
            .clone()
            .unwrap_or_else(blank_workspace);
        target_workspace["documents"]
            .as_array_mut()
            .unwrap()
            .push(document.clone());
        target_workspace["activeId"] = json!(id);
        let mut snapshots = self.saved();
        snapshots.insert(
            label.into(),
            SavedWindow {
                workspace: Some(source),
                geometry,
            },
        );
        snapshots.insert(
            destination.into(),
            SavedWindow {
                workspace: Some(target_workspace),
                geometry: target.saved.geometry,
            },
        );
        self.commit(path, snapshots)?;

        // All mutation that escapes this transaction happens after disk commit.
        self.claims.get_mut(id).unwrap().owner.label = destination.into();
        self.windows.get_mut(label).unwrap().epoch += 1;
        let destination_window = self.windows.get_mut(destination).unwrap();
        destination_window.epoch += 1;
        destination_window
            .transfers
            .push(Transfer { document, session });
        if self.completed.len() >= 128 {
            self.completed.pop_front();
        }
        self.completed.push_back(CompletedMove {
            token: transaction_id.into(),
            source: label.into(),
            destination: destination.into(),
            id: id.into(),
            epoch: epoch + 1,
        });
        Ok(epoch + 1)
    }
}

pub(super) struct MoveRequest<'a> {
    pub(super) label: &'a str,
    pub(super) destination: &'a str,
    pub(super) id: &'a str,
    pub(super) source: Value,
    pub(super) epoch: u64,
    pub(super) session: Option<Value>,
    pub(super) transaction_id: &'a str,
    pub(super) geometry: Option<Geometry>,
}

pub(super) enum QuitProgress {
    Next(String),
    Cancelled,
    Exit,
}

impl Windows {
    pub(super) fn answer_quit(
        &mut self,
        path: &Path,
        label: &str,
        token: &str,
        answer: Option<(u64, Value, Option<Geometry>)>,
    ) -> Result<QuitProgress, String> {
        let quit = self
            .quitting
            .as_ref()
            .filter(|quit| {
                quit.token == token && quit.pending.front().is_some_and(|next| next == label)
            })
            .ok_or("This quit prompt is superseded.")?;
        let Some((epoch, value, geometry)) = answer else {
            self.quitting = None;
            return Ok(QuitProgress::Cancelled);
        };
        // Validate before consuming the in-progress transaction.
        self.ensure_current(label, epoch)?;
        let value = clean_workspace(value)?;
        self.check_workspace_ownership(label, &value)?;
        let next = quit.pending.get(1).cloned();
        let quit = self.quitting.as_mut().unwrap();
        quit.snapshots.insert(
            label.into(),
            SavedWindow {
                workspace: Some(value),
                geometry,
            },
        );
        quit.pending.pop_front();
        if let Some(next) = next {
            return Ok(QuitProgress::Next(next));
        }
        let quit = self.quitting.take().unwrap();
        self.commit(path, quit.snapshots)?;
        self.exiting = true;
        Ok(QuitProgress::Exit)
    }
}

impl Windows {
    pub(super) fn ensure_document_mutation(&self, label: &str) -> Result<(), String> {
        self.record(label)?;
        if self.exiting
            || self
                .quitting
                .as_ref()
                .is_some_and(|quit| quit.snapshots.contains_key(label))
        {
            return Err(fail("MarkWriter is quitting."));
        }
        Ok(())
    }
}
