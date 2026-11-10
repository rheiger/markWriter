use std::{path::{Path, PathBuf}, sync::Mutex};

const LIMIT: usize = 64;
const MAX_ERROR_CHARS: usize = 512;
const OVERFLOW: &str = "Additional OS-open errors were omitted. Try smaller selections.";

pub fn is_markdown_path(path: &Path) -> bool {
    path.is_absolute()
        && path.extension().and_then(|value| value.to_str()).is_some_and(|extension| {
            extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown")
        })
}

#[derive(Default)]
struct QueueState {
    paths: Vec<PathBuf>,
    errors: Vec<String>,
}

pub struct OpenBatch {
    pub paths: Vec<String>,
    pub errors: Vec<String>,
}

#[derive(Default)]
pub struct OpenQueue(Mutex<QueueState>);

fn bounded_error(message: &str) -> String {
    let mut chars = message.chars();
    let mut result: String = chars.by_ref().take(MAX_ERROR_CHARS).collect();
    if chars.next().is_some() {
        result.push('…');
    }
    result
}

fn push_error(state: &mut QueueState, error: &str) {
    // Preserve the first 63 individual failures and explicitly signal later loss.
    if state.errors.len() < LIMIT - 1 {
        state.errors.push(bounded_error(error));
    } else if state.errors.len() == LIMIT - 1 {
        state.errors.push(OVERFLOW.into());
    }
}

impl OpenQueue {
    /// Windows Explorer invokes the executable with absolute paths after argv[0].
    #[cfg(any(target_os = "windows", test))]
    pub fn enqueue_argv(&self, args: impl IntoIterator<Item = impl Into<PathBuf>>) -> Result<(), String> {
        self.enqueue(args.into_iter().skip(1).map(Into::into))
    }

    /// Records a conversion or other batch failure before notifying the frontend.
    pub fn reject_batch(&self, error: &str) -> Result<(), String> {
        let mut state = self
            .0
            .lock()
            .map_err(|_| "OS-open queue unavailable".to_string())?;
        push_error(&mut state, error);
        Ok(())
    }

    pub fn enqueue(&self, paths: impl IntoIterator<Item = PathBuf>) -> Result<(), String> {
        let mut state = self
            .0
            .lock()
            .map_err(|_| "OS-open queue unavailable".to_string())?;
        // Only inspect one more than the maximum; input cannot force unbounded collection.
        let paths: Vec<_> = paths.into_iter().take(LIMIT + 1).collect();
        let error = if paths.len() > LIMIT.saturating_sub(state.paths.len()) {
            Some(
                "No files from this batch were opened. Too many pending OS-open files (maximum 64). Open a smaller selection."
                    .to_string(),
            )
        } else {
            paths.iter().find_map(|path| {
                if is_markdown_path(path) {
                    None
                } else {
                    Some(format!(
                        "No files from this batch were opened. Cannot open ‘{}’: expected an absolute Markdown file path.",
                        path.to_string_lossy()
                    ))
                }
            })
        };
        if let Some(error) = error {
            let error = bounded_error(&error);
            push_error(&mut state, &error);
            return Err(error);
        }
        state.paths.extend(paths);
        Ok(())
    }

    pub fn drain(&self) -> Result<OpenBatch, String> {
        let mut state = self
            .0
            .lock()
            .map_err(|_| "OS-open queue unavailable".to_string())?;
        Ok(OpenBatch {
            paths: std::mem::take(&mut state.paths)
                .into_iter()
                .map(|p| p.to_string_lossy().into_owned())
                .collect(),
            errors: std::mem::take(&mut state.errors),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windows_argv_preserves_a_quoted_unicode_path_as_one_argument() {
        let queue = OpenQueue::default();
        let first = std::env::temp_dir().join("Grüße 中文 path.markdown");
        let second = std::env::temp_dir().join("UPPER.MD");
        queue.enqueue_argv([PathBuf::from("MarkWriter.exe"), first.clone(), second.clone()]).unwrap();
        assert_eq!(queue.drain().unwrap().paths, vec![
            first.to_string_lossy().into_owned(), second.to_string_lossy().into_owned(),
        ]);
        queue.enqueue_argv(["MarkWriter.exe"]).unwrap();
        assert!(queue.drain().unwrap().paths.is_empty());
    }

    #[test]
    fn unicode_duplicates_and_errors_survive_until_one_atomic_drain() {
        let q = OpenQueue::default();
        let path = std::env::temp_dir().join("Grüße 中文 file.md");
        q.enqueue([path.clone(), path.clone()]).unwrap();
        assert!(q
            .enqueue([
                std::env::temp_dir().join("valid.md"),
                PathBuf::from("relative.md")
            ])
            .is_err());
        let batch = q.drain().unwrap();
        assert_eq!(
            batch.paths,
            vec![
                path.to_string_lossy().into_owned(),
                path.to_string_lossy().into_owned()
            ]
        );
        assert_eq!(batch.errors.len(), 1);
        assert!(batch.errors[0].contains("relative.md"));
        let empty = q.drain().unwrap();
        assert!(empty.paths.is_empty() && empty.errors.is_empty());
    }

    #[test]
    fn capacity_rejection_does_not_add_any_paths_and_error_is_preserved() {
        let q = OpenQueue::default();
        let path = std::env::temp_dir().join("a.md");
        q.enqueue(std::iter::repeat_n(path.clone(), 63)).unwrap();
        assert!(q.enqueue([path.clone(), path]).is_err());
        let batch = q.drain().unwrap();
        assert_eq!(batch.paths.len(), 63);
        assert!(batch.errors[0].contains("maximum 64"));
    }

    #[test]
    fn rejected_batch_errors_are_bounded_and_report_overflow() {
        let q = OpenQueue::default();
        for _ in 0..100 {
            assert!(q.enqueue([PathBuf::from("invalid.md")]).is_err());
        }
        let batch = q.drain().unwrap();
        assert_eq!(batch.errors.len(), 64);
        assert!(batch.errors.last().unwrap().contains("Additional"));
    }
    #[test]
    fn conversion_failure_can_be_recorded_without_adding_other_batch_paths() {
        let q = OpenQueue::default();
        q.reject_batch("Unsupported URL in OS-open batch").unwrap();
        let batch = q.drain().unwrap();
        assert!(batch.paths.is_empty());
        assert!(batch.errors[0].contains("Unsupported URL"));
    }
}
