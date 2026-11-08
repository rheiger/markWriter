use std::fs::{self, OpenOptions};
use std::io::Read;
use std::path::Path;
use std::sync::Arc;
use tauri::State;
use tauri_plugin_dialog::DialogExt;
use tokio::sync::Mutex;

// Keep in sync with the frontend SQL parser cap. The limit includes a UTF-8 BOM.
const MAX_SQL_BYTES: u64 = 64 * 1024;
#[derive(Default)]
pub struct SqlPicker(Arc<Mutex<()>>);

fn read_sql(path: &Path) -> Result<String, String> {
    if !path.is_absolute()
        || !path
            .extension()
            .is_some_and(|suffix| suffix.eq_ignore_ascii_case("sql"))
    {
        return Err("Choose a local .sql file.".into());
    }
    let io_error = |_: std::io::Error| "Could not read the selected SQL file.".to_owned();
    if !fs::metadata(path).map_err(io_error)?.is_file() {
        return Err("Choose a regular SQL file.".into());
    }

    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        // A file replaced by a pipe between the two metadata checks must not block.
        options.custom_flags(libc::O_NONBLOCK);
    }
    let file = options.open(path).map_err(io_error)?;
    let metadata = file.metadata().map_err(io_error)?;
    if !metadata.is_file() {
        return Err("Choose a regular SQL file.".into());
    }
    if metadata.len() > MAX_SQL_BYTES {
        return Err("SQL file exceeds 64 KiB.".into());
    }
    let mut bytes = Vec::new();
    file.take(MAX_SQL_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(io_error)?;
    if bytes.len() as u64 > MAX_SQL_BYTES {
        return Err("SQL file exceeds 64 KiB.".into());
    }
    String::from_utf8(bytes).map_err(|_| "SQL file must be UTF-8.".into())
}

#[tauri::command]
pub async fn pick_sql_source(
    window: tauri::WebviewWindow,
    state: State<'_, SqlPicker>,
) -> Result<Option<String>, String> {
    // An owned permit stays with the picker callback even if the caller dismisses its dialog.
    let permit = state
        .0
        .clone()
        .try_lock_owned()
        .map_err(|_| "A SQL file picker is already open.".to_owned())?;
    let (send, receive) = tokio::sync::oneshot::channel();
    window
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Choose a SQL DDL file")
        .add_filter("SQL", &["sql"])
        .pick_file(move |selection| {
            let result = selection
                .map(|file| {
                    file.into_path()
                        .map_err(|_| "Choose a local .sql file.".to_owned())
                        .and_then(|path| read_sql(&path))
                })
                .transpose();
            drop(permit);
            let _ = send.send(result);
        });
    receive
        .await
        .map_err(|_| "The SQL file picker could not be opened.".to_owned())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selected_source_read_is_bounded_utf8_and_leaves_file_intact() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("migration.SQL");
        fs::write(&file, "CREATE TABLE café (id integer);").unwrap();
        let before = fs::read(&file).unwrap();
        assert_eq!(read_sql(&file).unwrap().as_bytes(), before);
        assert_eq!(fs::read(&file).unwrap(), before);
        fs::write(&file, [0xff]).unwrap();
        assert!(read_sql(&file).unwrap_err().contains("UTF-8"));
        fs::write(&file, vec![b' '; MAX_SQL_BYTES as usize + 1]).unwrap();
        assert!(read_sql(&file).unwrap_err().contains("64 KiB"));
        let directory = dir.path().join("directory.sql");
        fs::create_dir(&directory).unwrap();
        assert!(read_sql(&directory).unwrap_err().contains("regular"));
    }
}
