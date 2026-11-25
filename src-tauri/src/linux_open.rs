//! Route GNOME Files launches to the editor that owns the current profile.
use gio::{glib, prelude::*};
use std::{env, os::unix::ffi::OsStrExt, path::PathBuf};
use tauri::AppHandle;

use crate::{
    os_open::{OpenQueue, LIMIT},
    window_service,
};

pub struct Launch {
    application: gio::Application,
    files: Vec<gio::File>,
}

impl Launch {
    pub fn register() -> Result<Option<Self>, glib::Error> {
        let application =
            gio::Application::new(Some(&application_id()), gio::ApplicationFlags::HANDLES_OPEN);
        application.register(gio::Cancellable::NONE)?;
        let files: Vec<_> = env::args_os()
            .skip(1)
            .take(LIMIT + 1)
            .map(gio::File::for_commandline_arg)
            .collect();
        if application.is_remote() {
            if files.is_empty() {
                application.activate();
            } else {
                application.open(&files, "");
            }
            if let Some(connection) = application.dbus_connection() {
                connection.flush_sync(gio::Cancellable::NONE)?;
            }
            Ok(None)
        } else {
            Ok(Some(Self { application, files }))
        }
    }

    pub fn listen(&self, app: &AppHandle) {
        let open_app = app.clone();
        self.application.connect_open(move |_, files, _| {
            window_service::enqueue_os_open(&open_app, |queue| enqueue(queue, files));
        });
        let activate_app = app.clone();
        self.application.connect_activate(move |_| {
            window_service::enqueue_os_open(&activate_app, |_| {});
        });
        if !self.files.is_empty() {
            window_service::enqueue_os_open(app, |queue| enqueue(queue, &self.files));
        }
    }
}

fn application_id() -> String {
    let profile = env::var_os("MARKWRITER_PROFILE_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| glib::user_data_dir().join("com.markwriter.app"));
    let profile = profile.canonicalize().unwrap_or(profile);
    let digest =
        glib::compute_checksum_for_data(glib::ChecksumType::Sha256, profile.as_os_str().as_bytes())
            .expect("GLib supports SHA-256");
    format!("com.markwriter.app.Shell.p{digest}")
}

fn enqueue(queue: &OpenQueue, files: &[gio::File]) {
    let paths = files
        .iter()
        .take(LIMIT + 1)
        .map(|file| file.path().filter(|path| path.to_str().is_some()))
        .collect::<Option<Vec<_>>>();
    match paths {
        Some(paths) => {
            let _ = queue.enqueue(paths);
        }
        None => {
            let _ = queue.reject_batch(
                "No files from this batch were opened. Only local Markdown paths with UTF-8 names are supported.",
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_unicode_files_are_delivered_as_one_batch() {
        let queue = OpenQueue::default();
        let first = "/tmp/Grüße 中文 file.md";
        let second = "/tmp/second.markdown";
        enqueue(
            &queue,
            &[gio::File::for_path(first), gio::File::for_path(second)],
        );
        let batch = queue.drain().unwrap();
        assert_eq!(batch.paths, [first, second]);
        assert!(batch.errors.is_empty());
    }

    #[test]
    fn remote_files_reject_the_whole_batch() {
        let queue = OpenQueue::default();
        enqueue(
            &queue,
            &[
                gio::File::for_path("/tmp/local.md"),
                gio::File::for_uri("smb://test.invalid/remote.md"),
            ],
        );
        let batch = queue.drain().unwrap();
        assert!(batch.paths.is_empty());
        assert_eq!(batch.errors.len(), 1);
    }
}
