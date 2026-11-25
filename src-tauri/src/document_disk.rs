use serde::Serialize;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::Path;

const MONITOR_BYTE_LIMIT: usize = 1024 * 1024;

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DiskState {
    Unchanged,
    Changed,
    Missing,
    Unreadable,
    TooLarge,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum SaveError {
    Conflict {
        #[serde(rename = "diskState")]
        disk_state: DiskState,
    },
    Io(String),
}

impl From<io::Error> for SaveError {
    fn from(error: io::Error) -> Self {
        Self::Io(format!("Failed to save file: {error}"))
    }
}

fn parent(path: &Path) -> &Path {
    path.parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."))
}

pub fn canonical_path(path: &Path, preserve_leaf: bool) -> io::Result<std::path::PathBuf> {
    if !preserve_leaf {
        match fs::canonicalize(path) {
            Ok(resolved) => return Ok(resolved),
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
    }
    Ok(fs::canonicalize(parent(path))?.join(path.file_name().unwrap_or_default()))
}

fn no_follow_read() -> OpenOptions {
    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        // Prevent a replacement symlink from being followed or a FIFO from blocking.
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        use windows::Win32::Storage::FileSystem::FILE_FLAG_OPEN_REPARSE_POINT;
        options.custom_flags(FILE_FLAG_OPEN_REPARSE_POINT.0);
    }
    options
}

pub(crate) fn regular_file(path: &Path) -> io::Result<File> {
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.is_file() || is_reparse_point(&metadata) {
        return Err(io::Error::other("Expected a regular file"));
    }
    let file = no_follow_read().open(path)?;
    let metadata = file.metadata()?;
    if !metadata.is_file() || is_reparse_point(&metadata) {
        return Err(io::Error::other("Expected a regular file"));
    }
    Ok(file)
}

fn is_reparse_point(_metadata: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        use windows::Win32::Storage::FileSystem::FILE_ATTRIBUTE_REPARSE_POINT;
        return _metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT.0 != 0;
    }
    #[cfg(not(windows))]
    false
}

pub fn save_as_path(path: &Path, owners: &[String]) -> io::Result<std::path::PathBuf> {
    let named = canonical_path(path, true)?;
    if owners.iter().any(|owner| Path::new(owner) == named) {
        return Ok(named);
    }
    if let Some(identity) = link_identity(&named) {
        if let Some(owner) = owners
            .iter()
            .find(|owner| link_identity(Path::new(owner)) == Some(identity))
        {
            return Ok(owner.into());
        }
    }
    canonical_path(path, false)
}

#[cfg(unix)]
fn link_identity(path: &Path) -> Option<(u64, u64)> {
    use std::os::unix::fs::MetadataExt;
    let metadata = fs::symlink_metadata(path).ok()?;
    metadata
        .is_symlink()
        .then(|| (metadata.dev(), metadata.ino()))
}

#[cfg(windows)]
fn link_identity(path: &Path) -> Option<(u64, u64)> {
    let metadata = fs::symlink_metadata(path).ok()?;
    if !is_reparse_point(&metadata) {
        return None;
    }
    let stamp = file_stamp(&no_follow_read().open(path).ok()?).ok()?;
    Some((stamp.volume, stamp.index))
}

fn reading_failure(error: io::Error) -> DiskState {
    match error.kind() {
        io::ErrorKind::NotFound => DiskState::Missing,
        _ => DiskState::Unreadable,
    }
}

/// Read at most one extra byte even if the file grows during the read.
pub fn monitor(path: &Path, expected: Option<&str>) -> DiskState {
    let file = match regular_file(path) {
        Ok(file) => file,
        Err(error) => return reading_failure(error),
    };
    let Some(expected) = expected.filter(|text| text.len() <= MONITOR_BYTE_LIMIT) else {
        return DiskState::TooLarge;
    };
    let mut bytes = Vec::new();
    match file
        .take((MONITOR_BYTE_LIMIT + 1) as u64)
        .read_to_end(&mut bytes)
    {
        Ok(_) if bytes.len() > MONITOR_BYTE_LIMIT => DiskState::TooLarge,
        Ok(_) if bytes == expected.as_bytes() => DiskState::Unchanged,
        Ok(_) if std::str::from_utf8(&bytes).is_ok() => DiskState::Changed,
        Ok(_) => DiskState::Unreadable,
        Err(error) => reading_failure(error),
    }
}

pub fn read_current(path: &Path) -> Result<String, DiskState> {
    let mut file = regular_file(path).map_err(reading_failure)?;
    let stamp = file_stamp(&file).map_err(reading_failure)?;
    let mut content = String::new();
    file.read_to_string(&mut content).map_err(reading_failure)?;
    if !still_current(path, &stamp).map_err(reading_failure)? {
        return Err(DiskState::Changed);
    }
    Ok(content)
}

#[derive(PartialEq)]
struct FileStamp {
    volume: u64,
    index: u64,
    length: u64,
    modified: i128,
    changed: i128,
}

#[cfg(unix)]
fn file_stamp(file: &File) -> io::Result<FileStamp> {
    use std::os::unix::fs::MetadataExt;
    let metadata = file.metadata()?;
    Ok(FileStamp {
        volume: metadata.dev(),
        index: metadata.ino(),
        length: metadata.len(),
        modified: i128::from(metadata.mtime()) * 1_000_000_000 + i128::from(metadata.mtime_nsec()),
        changed: i128::from(metadata.ctime()) * 1_000_000_000 + i128::from(metadata.ctime_nsec()),
    })
}

#[cfg(windows)]
fn file_stamp(file: &File) -> io::Result<FileStamp> {
    use std::os::windows::io::AsRawHandle;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::Storage::FileSystem::{
        FileBasicInfo, GetFileInformationByHandle, GetFileInformationByHandleEx,
        BY_HANDLE_FILE_INFORMATION, FILE_BASIC_INFO,
    };
    let handle = HANDLE(file.as_raw_handle());
    let mut identity = BY_HANDLE_FILE_INFORMATION::default();
    let mut basic = FILE_BASIC_INFO::default();
    // The output buffers match the Win32 types and the handle is borrowed
    // for the lifetime of the calls.
    unsafe {
        GetFileInformationByHandle(handle, &mut identity).map_err(io::Error::other)?;
        GetFileInformationByHandleEx(
            handle,
            FileBasicInfo,
            (&mut basic as *mut FILE_BASIC_INFO).cast(),
            std::mem::size_of::<FILE_BASIC_INFO>() as u32,
        )
        .map_err(io::Error::other)?;
    }
    Ok(FileStamp {
        volume: u64::from(identity.dwVolumeSerialNumber),
        index: (u64::from(identity.nFileIndexHigh) << 32) | u64::from(identity.nFileIndexLow),
        length: (u64::from(identity.nFileSizeHigh) << 32) | u64::from(identity.nFileSizeLow),
        modified: i128::from(basic.LastWriteTime),
        changed: i128::from(basic.ChangeTime),
    })
}

fn still_current(path: &Path, stamp: &FileStamp) -> io::Result<bool> {
    Ok(file_stamp(&regular_file(path)?)? == *stamp)
}

fn compare_bytes(path: &Path, mut expected: &[u8]) -> io::Result<Option<FileStamp>> {
    let mut file = regular_file(path)?;
    let stamp = file_stamp(&file)?;
    let mut buffer = [0; 16 * 1024];
    loop {
        let read = match file.read(&mut buffer) {
            Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
            result => result?,
        };
        if read == 0 {
            return Ok((expected.is_empty() && still_current(path, &stamp)?).then_some(stamp));
        }
        if !expected.starts_with(&buffer[..read]) {
            return Ok(None);
        }
        expected = &expected[read..];
    }
}

fn stage_write(
    path: &Path,
    content: &str,
    preserve_permissions: bool,
) -> io::Result<tempfile::NamedTempFile> {
    let mut temporary = tempfile::NamedTempFile::new_in(parent(path))?;
    if preserve_permissions {
        if let Ok(metadata) = fs::symlink_metadata(path) {
            if metadata.is_file() {
                temporary
                    .as_file()
                    .set_permissions(metadata.permissions())?;
            }
        }
    }
    temporary.write_all(content.as_bytes())?;
    temporary.as_file().sync_all()?;
    Ok(temporary)
}

fn verify_baseline(path: &Path, expected: &str) -> Result<FileStamp, SaveError> {
    let disk_state = match compare_bytes(path, expected.as_bytes()) {
        Ok(Some(stamp)) => return Ok(stamp),
        Ok(None) => DiskState::Changed,
        Err(error) => reading_failure(error),
    };
    Err(SaveError::Conflict { disk_state })
}

fn commit_write(
    temporary: tempfile::NamedTempFile,
    path: &Path,
    expected: Option<&str>,
) -> Result<(), SaveError> {
    if let Some(expected) = expected {
        #[cfg(windows)]
        return commit_owned_write_with_wait(temporary, path, expected, std::thread::sleep);
        #[cfg(not(windows))]
        verify_baseline(path, expected)?;
    }
    temporary.persist(path).map_err(|error| error.error)?;
    Ok(())
}

#[cfg(windows)]
fn commit_owned_write_with_wait(
    mut temporary: tempfile::NamedTempFile,
    path: &Path,
    expected: &str,
    mut wait: impl FnMut(std::time::Duration),
) -> Result<(), SaveError> {
    use windows::Win32::Foundation::{
        ERROR_ACCESS_DENIED, ERROR_LOCK_VIOLATION, ERROR_SHARING_VIOLATION,
    };

    // Match the bounded replacement delays used by native workspace persistence.
    const DELAYS_MS: [u64; 4] = [20, 40, 80, 160];
    let initial_stamp = verify_baseline(path, expected)?;
    for attempt in 1..=DELAYS_MS.len() + 1 {
        let failure = match temporary.persist(path) {
            Ok(_) => return Ok(()),
            Err(failure) => failure,
        };
        let may_retry = [
            ERROR_ACCESS_DENIED,
            ERROR_SHARING_VIOLATION,
            ERROR_LOCK_VIOLATION,
        ]
        .iter()
        .any(|code| failure.error.raw_os_error() == Some(code.0 as i32));
        let delay = DELAYS_MS.get(attempt - 1).filter(|_| may_retry);
        let Some(delay) = delay else {
            return Err(SaveError::Io(format!(
                "Failed to save file: document replacement failed on attempt {attempt}: {}",
                failure.error
            )));
        };
        // Retain the same staged bytes. The file or its permissions may have
        // changed while Windows blocked replacement, even if its bytes match.
        temporary = failure.file;
        wait(std::time::Duration::from_millis(*delay));
        if verify_baseline(path, expected)? != initial_stamp {
            return Err(SaveError::Conflict {
                disk_state: DiskState::Changed,
            });
        }
    }
    unreachable!("the final failed replacement returns its error")
}

pub fn write(path: &Path, content: &str, expected: Option<&str>) -> Result<(), SaveError> {
    let temporary = stage_write(path, content, true).map_err(|error| {
        if expected.is_some() {
            if let Err(read_error) = regular_file(path) {
                return SaveError::Conflict {
                    disk_state: reading_failure(read_error),
                };
            }
        }
        error.into()
    })?;
    commit_write(temporary, path, expected)
}

pub fn write_copy(path: &Path, content: &str) -> io::Result<()> {
    stage_write(path, content, false)?
        .persist_noclobber(path)
        .map_err(|error| error.error)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_same_length_edits_and_replacements_and_classifies_unusable_paths() {
        let fixture = tempfile::tempdir().unwrap();
        let path = fixture.path().join("Grüße.md");
        assert_eq!(monitor(&path, Some("éa")), DiskState::Missing);
        fs::write(&path, "éa").unwrap();
        assert_eq!(monitor(&path, Some("éa")), DiskState::Unchanged);
        fs::write(&path, "éz").unwrap();
        assert_eq!(monitor(&path, Some("éa")), DiskState::Changed);
        write(&path, "öx", None).unwrap();
        assert_eq!(monitor(&path, Some("éz")), DiskState::Changed);
        fs::write(&path, b"\xff").unwrap();
        assert_eq!(monitor(&path, Some("éz")), DiskState::Unreadable);
        assert_eq!(read_current(&path), Err(DiskState::Unreadable));
        fs::remove_file(&path).unwrap();
        fs::create_dir(&path).unwrap();
        assert_eq!(monitor(&path, Some("éz")), DiskState::Unreadable);
    }

    #[test]
    fn refuses_changes_between_staging_and_commit_without_altering_disk() {
        let fixture = tempfile::tempdir().unwrap();
        let path = fixture.path().join("external.md");
        let old = "same bytes before";
        fs::write(&path, old).unwrap();
        let staged = stage_write(&path, "draft", true).unwrap();
        write(&path, "same bytes edited", None).unwrap();
        assert!(matches!(
            commit_write(staged, &path, Some(old)),
            Err(SaveError::Conflict {
                disk_state: DiskState::Changed
            })
        ));
        assert_eq!(fs::read_to_string(&path).unwrap(), "same bytes edited");
        fs::remove_file(&path).unwrap();
        assert!(matches!(
            write(&path, "draft", Some(old)),
            Err(SaveError::Conflict {
                disk_state: DiskState::Missing
            })
        ));
        assert!(!path.exists());
        let missing_parent = fixture.path().join("renamed").join("external.md");
        assert!(matches!(
            write(&missing_parent, "draft", Some(old)),
            Err(SaveError::Conflict {
                disk_state: DiskState::Missing
            })
        ));
    }

    #[test]
    fn detects_replacement_when_the_path_is_reopened() {
        let fixture = tempfile::tempdir().unwrap();
        let path = fixture.path().join("external.md");
        fs::write(&path, "old through handle").unwrap();
        let open = regular_file(&path).unwrap();
        let stamp = file_stamp(&open).unwrap();

        // MoveFileExW cannot always replace an open target, even when the
        // reader allows delete sharing. On Windows verify after releasing it.
        #[cfg(windows)]
        drop(open);
        write(&path, "new through path  ", None).unwrap();
        #[cfg(unix)]
        {
            let mut original = String::new();
            (&open).read_to_string(&mut original).unwrap();
            assert_eq!(original, "old through handle");
        }
        assert!(!still_current(&path, &stamp).unwrap());
    }

    #[test]
    fn copy_never_clobbers_and_large_files_remain_guarded() {
        let fixture = tempfile::tempdir().unwrap();
        let path = fixture.path().join("large.md");
        let large = "a".repeat(MONITOR_BYTE_LIMIT + 1);
        write_copy(&path, &large).unwrap();
        assert_eq!(monitor(&path, Some("")), DiskState::TooLarge);
        assert_eq!(monitor(&path, Some(&large)), DiskState::TooLarge);
        assert_eq!(
            write_copy(&path, "draft").unwrap_err().kind(),
            io::ErrorKind::AlreadyExists
        );
        assert_eq!(fs::read_to_string(&path).unwrap(), large);
        write(&path, "draft", Some(&large)).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "draft");
    }

    #[cfg(windows)]
    mod windows {
        use super::*;
        use ::windows::Win32::Storage::FileSystem::{FILE_SHARE_READ, FILE_SHARE_WRITE};
        use std::os::windows::fs::OpenOptionsExt;
        use std::time::Duration;

        fn hold_target_without_delete_sharing(path: &Path) -> File {
            OpenOptions::new()
                .read(true)
                .share_mode((FILE_SHARE_READ | FILE_SHARE_WRITE).0)
                .open(path)
                .unwrap()
        }

        #[test]
        fn owned_save_reuses_its_staging_file_after_a_temporary_windows_lock() {
            let fixture = tempfile::tempdir().unwrap();
            let path = fixture.path().join("locked.md");
            let baseline = "prior markdown\r\n";
            let draft = "edited markdown\r\n";
            fs::write(&path, baseline).unwrap();
            let mut held = Some(hold_target_without_delete_sharing(&path));
            let temporary = stage_write(&path, draft, true).unwrap();
            let staged_path = temporary.path().to_owned();

            let mut waits = Vec::new();
            commit_owned_write_with_wait(temporary, &path, baseline, |delay| {
                waits.push(delay);
                assert_eq!(fs::read(&staged_path).unwrap(), draft.as_bytes());
                assert_eq!(fs::read(&path).unwrap(), baseline.as_bytes());
                drop(held.take());
            })
            .unwrap();

            assert_eq!(waits, [Duration::from_millis(20)]);
            assert_eq!(fs::read(&path).unwrap(), draft.as_bytes());
            assert!(!staged_path.exists());
        }

        #[test]
        fn owned_save_rejects_an_external_edit_or_replacement_during_the_retry_delay() {
            let baseline = "prior markdown";
            for external in ["other markdown", baseline] {
                let fixture = tempfile::tempdir().unwrap();
                let path = fixture.path().join("locked.md");
                fs::write(&path, baseline).unwrap();
                let mut held = Some(hold_target_without_delete_sharing(&path));
                let temporary = stage_write(&path, "edited markdown", true).unwrap();
                let staged_path = temporary.path().to_owned();

                let result = commit_owned_write_with_wait(temporary, &path, baseline, |_| {
                    drop(held.take().unwrap());
                    write(&path, external, None).unwrap();
                });

                assert!(matches!(
                    result,
                    Err(SaveError::Conflict {
                        disk_state: DiskState::Changed
                    })
                ));
                assert_eq!(fs::read(&path).unwrap(), external.as_bytes());
                assert!(!staged_path.exists());
            }
        }

        #[test]
        fn owned_save_reports_a_persistent_windows_lock_after_bounded_retries() {
            let fixture = tempfile::tempdir().unwrap();
            let path = fixture.path().join("locked.md");
            let baseline = "prior markdown";
            fs::write(&path, baseline).unwrap();
            let _held = hold_target_without_delete_sharing(&path);
            let temporary = stage_write(&path, "edited markdown", true).unwrap();
            let staged_path = temporary.path().to_owned();

            let mut waited_millis = 0;
            let error = commit_owned_write_with_wait(temporary, &path, baseline, |delay| {
                waited_millis += delay.as_millis();
            })
            .unwrap_err();

            let SaveError::Io(error) = error else {
                panic!("expected replacement failure, got {error:?}");
            };
            assert!(
                error.contains("document replacement failed on attempt 5"),
                "{error}"
            );
            assert_eq!(waited_millis, 300);
            assert_eq!(fs::read(&path).unwrap(), baseline.as_bytes());
            assert!(!staged_path.exists());
        }
    }

    #[cfg(unix)]
    #[test]
    fn replacement_symlink_does_not_redirect_access() {
        let fixture = tempfile::tempdir().unwrap();
        let original = fixture.path().join("original.md");
        let target = fixture.path().join("other.md");
        fs::write(&target, "same bytes").unwrap();
        std::os::unix::fs::symlink(&target, &original).unwrap();
        assert_eq!(
            monitor(&original, Some("same bytes")),
            DiskState::Unreadable
        );
        assert!(matches!(
            write(&original, "draft", Some("same bytes")),
            Err(SaveError::Conflict {
                disk_state: DiskState::Unreadable
            })
        ));
        assert_eq!(fs::read_to_string(&target).unwrap(), "same bytes");
        assert!(original.is_symlink());
        let canonical = fs::canonicalize(fixture.path())
            .unwrap()
            .join("original.md");
        let alias = fixture.path().join("alias.md");
        fs::hard_link(&original, &alias).unwrap();
        assert_eq!(
            save_as_path(&alias, &[canonical.to_string_lossy().into_owned()]).unwrap(),
            canonical
        );
    }
}
