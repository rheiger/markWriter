use super::*;
use std::collections::{BTreeMap, VecDeque};

const SECOND: &str = "editor-c9495abb-4109-45ca-b413-487820958290";

fn with_two_windows() -> Windows {
    let mut state = Windows::default();
    state.windows.insert(SECOND.into(), EditorWindow::default());
    state
}

fn draft(id: &str, content: &str) -> Value {
    json!({ "id": id, "title": "Untitled", "content": content, "savedContent": "", "isDirty": true })
}

fn workspace(documents: Vec<Value>) -> Value {
    let active_id = documents.first().map(|doc| doc["id"].clone());
    json!({ "version": 1, "activeId": active_id, "documents": documents, "fileViews": [] })
}

#[test]
fn legacy_flat_workspace_remains_the_primary_recovery_snapshot() {
    let legacy =
        json!({ "version": 0, "activeId": "old", "documents": [draft("old", "exact draft")] });
    let state = Windows::restore(legacy).unwrap();
    assert_eq!(state.windows.len(), 1);
    assert_eq!(state.owned(MAIN, "old").unwrap().owner.label, MAIN);
    let value = persisted_workspace(&state.saved());
    assert_eq!(value["version"], 1);
    assert_eq!(value["activeId"], "old");
    assert_eq!(value["documents"][0]["content"], "exact draft");
    assert!(value.get("windows").is_none());
}

#[test]
fn a_failed_move_preserves_the_source_and_never_enqueues_a_transfer() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("workspace.json");
    let mut state = with_two_windows();
    state.claim(MAIN, "one", None).unwrap();
    let source = workspace(vec![draft("one", "original bytes")]);
    state.save(&path, MAIN, 0, source.clone(), None).unwrap();
    let before = std::fs::read(&path).unwrap();

    assert!(state
        .move_document(
            dir.path(),
            MoveRequest {
                label: MAIN,
                destination: SECOND,
                id: "one",
                source,
                epoch: 0,
                session: Some(json!({"history":"transient"})),
                transaction_id: "fail",
                geometry: None,
            }
        )
        .is_err());

    assert_eq!(std::fs::read(path).unwrap(), before);
    assert!(state.owned(MAIN, "one").is_ok());
    assert!(state.record(SECOND).unwrap().transfers.is_empty());
    assert_eq!(state.record(MAIN).unwrap().epoch, 0);
    assert_eq!(state.record(SECOND).unwrap().epoch, 0);
}

#[test]
fn a_committed_move_has_one_durable_owner_and_rejects_stale_snapshots() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("workspace.json");
    let mut state = with_two_windows();
    state.claim(MAIN, "one", None).unwrap();
    state.claim(SECOND, "two", None).unwrap();
    let doc = draft("one", "# dirty cross-window\r\n");
    let source = workspace(vec![doc.clone()]);
    let target = workspace(vec![draft("two", "destination draft")]);
    state.save(&path, MAIN, 0, source.clone(), None).unwrap();
    state.save(&path, SECOND, 0, target.clone(), None).unwrap();

    let request = || MoveRequest {
        label: MAIN,
        destination: SECOND,
        id: "one",
        source: source.clone(),
        epoch: 0,
        session: Some(json!({"history":"transient"})),
        transaction_id: "move-once",
        geometry: None,
    };
    assert_eq!(state.move_document(&path, request()).unwrap(), 1);
    assert_eq!(state.move_document(&path, request()).unwrap(), 1);
    assert!(state.owned(MAIN, "one").is_err());
    assert!(state.owned(SECOND, "one").is_ok());
    assert!(state.save(&path, MAIN, 0, source, None).is_err());
    assert!(state.save(&path, SECOND, 0, target.clone(), None).is_err());
    assert!(state.save(&path, SECOND, 1, target, None).is_err());
    assert_eq!(state.record(SECOND).unwrap().transfers.len(), 1);
    assert_eq!(
        state.record(SECOND).unwrap().transfers[0].session,
        Some(json!({"history":"transient"}))
    );

    let persisted = persistence::read_json(&path).unwrap().unwrap();
    assert!(!persisted.to_string().contains("transient"));
    let restarted = Windows::restore(persisted).unwrap();
    assert!(restarted.record(SECOND).unwrap().transfers.is_empty());
    assert!(restarted.owned(MAIN, "one").is_err());
    assert!(restarted.owned(SECOND, "one").is_ok());
    assert_eq!(
        restarted
            .record(MAIN)
            .unwrap()
            .saved
            .workspace
            .as_ref()
            .unwrap()["documents"],
        json!([])
    );
    assert_eq!(
        restarted
            .record(SECOND)
            .unwrap()
            .saved
            .workspace
            .as_ref()
            .unwrap()["documents"][1],
        doc
    );
}

#[test]
fn claims_exclude_other_windows_and_failed_write_keeps_the_previous_destination() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("file.md").to_string_lossy().into_owned();
    let other = dir.path().join("other.md").to_string_lossy().into_owned();
    let service = WindowService(Mutex::new(with_two_windows()));
    register_document(MAIN, &service, "first").unwrap();
    register_document(SECOND, &service, "second").unwrap();
    let canonical = save_document(&service, MAIN, "first", "owned", &path, None).unwrap();
    assert!(save_document(&service, SECOND, "second", "wrong", &path, None).is_err());
    assert!(save_document(&service, SECOND, "first", "wrong", &path, Some("owned")).is_err());
    assert!(write_unowned(&service, SECOND, &path, "export", false).is_err());
    assert!(write_unowned(&service, SECOND, &path, "copy", true).is_err());
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "owned");

    let impossible = dir
        .path()
        .join("missing-parent")
        .join("bad.md")
        .to_string_lossy()
        .into_owned();
    assert!(save_document(&service, MAIN, "first", "revision", &impossible, None).is_err());
    assert_eq!(
        service
            .lock()
            .unwrap()
            .path_owner(&canonical)
            .unwrap()
            .label,
        MAIN
    );
    assert!(save_document(&service, MAIN, "first", "updated", &path, Some("owned")).is_ok());

    let destination = save_document(&service, MAIN, "first", "renamed", &other, None).unwrap();
    assert!(service.lock().unwrap().path_owner(&canonical).is_none());
    assert_eq!(
        service
            .lock()
            .unwrap()
            .path_owner(&destination)
            .unwrap()
            .label,
        MAIN
    );
    assert!(save_document(
        &service,
        MAIN,
        "first",
        "stale write",
        &path,
        Some("updated")
    )
    .is_err());
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "updated");
}

#[test]
fn cancelled_quit_keeps_each_window_draft_and_approved_quit_commits_them_together() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("workspace.json");
    let mut state = with_two_windows();
    let first = workspace(vec![draft("a", "first draft")]);
    let second = workspace(vec![draft("b", "second draft")]);
    state.claim(MAIN, "a", None).unwrap();
    state.claim(SECOND, "b", None).unwrap();
    state.save(&path, MAIN, 0, first.clone(), None).unwrap();
    state.save(&path, SECOND, 0, second.clone(), None).unwrap();
    let before = std::fs::read(&path).unwrap();

    let requested = |token: &str| {
        Some(Quit {
            token: token.into(),
            pending: VecDeque::from([MAIN.into(), SECOND.into()]),
            snapshots: BTreeMap::new(),
        })
    };
    state.quitting = requested("cancel");
    assert!(
        matches!(state.answer_quit(&path, MAIN, "cancel", Some((0, blank_workspace(), None))).unwrap(), QuitProgress::Next(label) if label == SECOND)
    );
    assert!(state.save(&path, MAIN, 0, first, None).is_err());
    assert!(matches!(
        state.answer_quit(&path, SECOND, "cancel", None).unwrap(),
        QuitProgress::Cancelled
    ));
    assert_eq!(std::fs::read(&path).unwrap(), before);
    assert!(!state.exiting);

    state.quitting = requested("finish");
    state
        .answer_quit(&path, MAIN, "finish", Some((0, blank_workspace(), None)))
        .unwrap();
    assert!(matches!(
        state
            .answer_quit(&path, SECOND, "finish", Some((0, second, None)))
            .unwrap(),
        QuitProgress::Exit
    ));
    let reopened = Windows::restore(persistence::read_json(&path).unwrap().unwrap()).unwrap();
    assert!(reopened.owned(MAIN, "a").is_err());
    assert!(reopened.owned(SECOND, "b").is_ok());
}

#[test]
fn closing_the_primary_does_not_resurrect_it_or_lose_the_remaining_window() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("workspace.json");
    let mut state = with_two_windows();
    state.claim(MAIN, "a", None).unwrap();
    state.claim(SECOND, "b", None).unwrap();
    state
        .save(&path, MAIN, 0, workspace(vec![draft("a", "closed")]), None)
        .unwrap();
    state
        .save(
            &path,
            SECOND,
            0,
            workspace(vec![draft("b", "survives")]),
            None,
        )
        .unwrap();

    state
        .close(&path, MAIN, 0, blank_workspace(), None)
        .unwrap();
    assert!(state.owned(MAIN, "a").is_err());
    assert!(state.owned(SECOND, "b").is_ok());
    let reopened = Windows::restore(persistence::read_json(&path).unwrap().unwrap()).unwrap();
    assert_eq!(reopened.windows.len(), 1);
    assert_eq!(
        reopened
            .record(MAIN)
            .unwrap()
            .saved
            .workspace
            .as_ref()
            .unwrap()["documents"][0]["content"],
        "survives"
    );
}

#[test]
fn save_as_releases_the_old_path_without_creating_duplicate_recovery_owners() {
    let dir = tempfile::tempdir().unwrap();
    let storage = dir.path().join("workspace.json");
    let old_path = dir.path().join("old.md").to_string_lossy().into_owned();
    let new_path = dir.path().join("new.md").to_string_lossy().into_owned();
    let service = WindowService(Mutex::new(with_two_windows()));
    register_document(MAIN, &service, "one").unwrap();
    let old = save_document(&service, MAIN, "one", "old bytes", &old_path, None).unwrap();
    let mut doc = draft("one", "unflushed edit");
    doc["path"] = json!(old);
    let stale = workspace(vec![doc]);
    service
        .lock()
        .unwrap()
        .save(&storage, MAIN, 0, stale.clone(), None)
        .unwrap();

    let new = save_document(&service, MAIN, "one", "captured save", &new_path, None).unwrap();
    let mut state = service.lock().unwrap();
    assert!(state.save(&storage, MAIN, 0, stale, None).is_err());
    assert!(state
        .claim(SECOND, "two", Some(old.clone()))
        .unwrap()
        .is_none());
    let mut second = draft("two", "old bytes");
    second["path"] = json!(old);
    state
        .save(&storage, SECOND, 0, workspace(vec![second]), None)
        .unwrap();

    let persisted = persistence::read_json(&storage).unwrap().unwrap();
    let restored = Windows::restore(persisted.clone()).unwrap();
    assert_eq!(restored.path_owner(&new).unwrap().label, MAIN);
    assert_eq!(restored.path_owner(&old).unwrap().label, SECOND);
    let document = &persisted["documents"][0];
    assert_eq!(document["path"], new);
    assert_eq!(document["title"], "new.md");
    assert_eq!(document["content"], "unflushed edit");
    assert_eq!(document["savedContent"], "captured save");
    assert_eq!(document["isDirty"], true);
}

#[test]
fn releasing_an_omitted_restore_document_reconciles_the_saved_owner() {
    let dir = tempfile::tempdir().unwrap();
    let storage = dir.path().join("workspace.json");
    let path = dir.path().join("example.md").to_string_lossy().into_owned();
    let mut state = with_two_windows();
    state.claim(MAIN, "omitted", Some(path.clone())).unwrap();
    let mut old = draft("omitted", "");
    old["isDirty"] = json!(false);
    old["path"] = json!(path);
    state
        .save(&storage, MAIN, 0, workspace(vec![old]), None)
        .unwrap();

    state.release_claim(MAIN, "omitted");
    state.claim(SECOND, "new", Some(path.clone())).unwrap();
    let mut reopened = draft("new", "example file");
    reopened["path"] = json!(path);
    state
        .save(&storage, SECOND, 0, workspace(vec![reopened]), None)
        .unwrap();

    let persisted = persistence::read_json(&storage).unwrap().unwrap();
    let restored = Windows::restore(persisted.clone()).unwrap();
    assert_eq!(restored.path_owner(&path).unwrap().id, "new");
    assert_eq!(persisted["activeId"], Value::Null);
    assert_eq!(persisted["documents"], json!([]));
}

#[test]
fn quit_is_retryable_while_a_window_has_not_registered_its_listener() {
    let mut state = with_two_windows();
    state.windows.get_mut(MAIN).unwrap().ready = true;
    assert!(state.begin_quit().unwrap_err().contains("finish opening"));
    assert!(state.quitting.is_none());

    state.windows.get_mut(SECOND).unwrap().ready = true;
    state.focused = Some(SECOND.into());
    let (first, token) = state.begin_quit().unwrap().unwrap();
    assert_eq!(first, SECOND);
    let request = state.quitting.unwrap();
    assert_eq!(request.token, token);
    assert_eq!(request.pending, [SECOND, MAIN]);
}
