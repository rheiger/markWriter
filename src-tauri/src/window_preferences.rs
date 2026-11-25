//! Serialize shared preference patches from independently running editors.
use serde_json::{Map, Value};
use std::{path::Path, sync::Mutex};

#[derive(Default)]
pub struct PreferenceState(Mutex<u64>);

const SECTIONS: [&str; 2] = ["config", "updateChoices"];

fn versioned(mut value: Value, generation: u64) -> Value {
    value["generation"] = generation.into();
    value
}

fn merge_sections(mut committed: Value, proposed: &Value, base: &Value) -> Value {
    for section in SECTIONS {
        let empty = Map::new();
        let old = base[section].as_object().unwrap_or(&empty);
        let change = proposed[section].as_object().unwrap_or(&empty);
        let saved = committed[section].as_object().unwrap_or(&empty);
        let mut merged = if section == "config" {
            old.clone()
        } else {
            Map::new()
        };
        // Fill missing legacy defaults from the normalized baseline before
        // applying deltas, preserving independent source and rendered fonts.
        merged.extend(saved.clone());
        for (key, value) in change {
            if old.get(key) != Some(value) {
                merged.insert(key.clone(), value.clone());
            }
        }
        for key in old.keys().filter(|key| !change.contains_key(*key)) {
            merged.remove(key);
        }
        if section == "updateChoices" && merged.is_empty() {
            if let Some(record) = committed.as_object_mut() {
                record.remove(section);
            }
        } else {
            committed[section] = Value::Object(merged);
        }
    }
    committed
}

impl PreferenceState {
    pub fn load(&self, path: &Path) -> Result<Option<Value>, String> {
        let generation = self.0.lock().map_err(|error| error.to_string())?;
        crate::persistence::read_json(path)
            .map(|value| value.map(|value| versioned(value, *generation)))
    }

    pub fn save(
        &self,
        path: &Path,
        proposed: Value,
        base: &Value,
        repair_generation: Option<u64>,
        announce: impl FnOnce(&Value),
    ) -> Result<Value, String> {
        if proposed["version"].as_u64() != Some(1) || !proposed["config"].is_object() {
            return Err("Invalid preferences".into());
        }
        let mut generation = self.0.lock().map_err(|error| error.to_string())?;
        let committed = match crate::persistence::read_json(path) {
            // Two windows can request repair from the same rejected record.
            // A newer acknowledged commit must be merged, even for a repair request.
            Ok(Some(_)) if repair_generation == Some(*generation) => proposed,
            Err(_) if repair_generation.is_some() => proposed,
            Ok(Some(current))
                if current["version"].as_u64() == Some(1) && current["config"].is_object() =>
            {
                merge_sections(current, &proposed, base)
            }
            Ok(Some(current))
                if (current.get("version").is_none()
                    || matches!(current["version"].as_u64(), Some(0) | Some(1)))
                    && current.get("config").is_none_or(Value::is_object) =>
            {
                // The frontend already migrated this understood legacy format.
                proposed
            }
            Ok(None) => proposed,
            Ok(Some(_)) => {
                return Err("Current preferences need repair before they can be changed.".into())
            }
            Err(error) => return Err(error),
        };
        crate::persistence::write_json(path, &committed)?;
        *generation += 1;
        let update = versioned(committed, *generation);
        announce(&update);
        Ok(update)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn merges_disjoint_fields_and_choices_against_stale_windows() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("preferences.json");
        let state = PreferenceState::default();
        let base = json!({"version":1,"config":{"theme":"system","defaultEditorMode":"wysiwyg"}});
        let first = json!({"version":1,"config":{"theme":"dark","defaultEditorMode":"wysiwyg"},
            "updateChoices":{"2.16.3":{"kind":"skip"}}});
        let second = json!({"version":1,"config":{"theme":"system","defaultEditorMode":"markdown"},
            "updateChoices":{"2.17.4":{"kind":"skip"}}});
        state.save(&path, first, &base, None, |_| {}).unwrap();
        let result = state.save(&path, second, &base, None, |_| {}).unwrap();
        assert_eq!(
            result,
            json!({"generation":2,"version":1,
            "config":{"theme":"dark","defaultEditorMode":"markdown"},
            "updateChoices":{"2.16.3":{"kind":"skip"},"2.17.4":{"kind":"skip"}}})
        );
        assert_eq!(state.load(&path).unwrap(), Some(result));
        assert!(crate::persistence::read_json(&path)
            .unwrap()
            .unwrap()
            .get("generation")
            .is_none());
    }

    #[test]
    fn changing_source_size_preserves_the_normalized_legacy_rendered_size() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("preferences.json");
        crate::persistence::write_json(&path, &json!({"version":1,"config":{}})).unwrap();
        let base = json!({"version":1,"config":{"fontSize":14,"renderedFontSize":16}});
        let proposed = json!({"version":1,"config":{"fontSize":19,"renderedFontSize":16}});
        let result = PreferenceState::default()
            .save(&path, proposed, &base, None, |_| {})
            .unwrap();
        assert_eq!(
            result["config"],
            json!({"fontSize":19,"renderedFontSize":16})
        );
    }

    #[test]
    fn overlapping_repair_merges_with_the_first_repaired_commit() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("preferences.json");
        std::fs::write(&path, b"{broken").unwrap();
        let state = PreferenceState::default();
        let base = json!({"version":1,"config":{"theme":"system","defaultEditorMode":"wysiwyg"}});
        let first = json!({"version":1,"config":{"theme":"dark","defaultEditorMode":"wysiwyg"}});
        let second =
            json!({"version":1,"config":{"theme":"system","defaultEditorMode":"markdown"}});
        state.save(&path, first, &base, Some(0), |_| {}).unwrap();
        let result = state.save(&path, second, &base, Some(0), |_| {}).unwrap();
        assert_eq!(
            result["config"],
            json!({"theme":"dark","defaultEditorMode":"markdown"})
        );
    }
}
