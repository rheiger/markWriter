use std::path::{Path, PathBuf};

// Optional portable/isolated profile. Redirects only preferences/recovery;
// document paths and real native dialogs remain unchanged.
pub fn profile_file(root: &Path, filename: &str) -> Result<PathBuf, String> {
    if !root.is_absolute() {
        return Err("MARKWRITER_PROFILE_DIR must be an absolute path".into());
    }
    Ok(root.join(filename))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn isolated_profile_cannot_depend_on_launch_directory() {
        assert!(profile_file(Path::new("relative"), "workspace.json").is_err());
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(profile_file(dir.path(), "workspace.json").unwrap(), dir.path().join("workspace.json"));
    }
}
