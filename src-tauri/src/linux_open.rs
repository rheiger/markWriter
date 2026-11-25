//! Route GNOME Files launches to the editor that owns the current profile.
use gio::{glib, prelude::*};
use std::{
    collections::HashMap,
    env,
    os::unix::ffi::OsStrExt,
    path::{Component, Path, PathBuf},
};
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
    pub fn register(identifier: &str) -> Result<Option<Self>, Box<dyn std::error::Error>> {
        let profile = env::var_os("MARKWRITER_PROFILE_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| glib::user_data_dir().join(identifier));
        let application_id = profile_application_id(&profile);
        let application =
            gio::Application::new(Some(&application_id), gio::ApplicationFlags::HANDLES_OPEN);
        application.register(gio::Cancellable::NONE)?;
        let files: Vec<_> = env::args_os()
            .skip(1)
            .take(LIMIT + 1)
            .map(gio::File::for_commandline_arg)
            .collect();
        if application.is_remote() {
            forward(&application, &application_id, &files)?;
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

fn profile_application_id(profile: &Path) -> String {
    // Resolve existing aliases even when the profile has not yet been created.
    // Profile failures are surfaced by the existing workspace recovery UI.
    let identity = if profile.is_absolute() {
        profile.canonicalize().unwrap_or_else(|_| {
            let mut resolved = PathBuf::new();
            for component in profile.components() {
                match component {
                    Component::ParentDir => {
                        resolved.pop();
                    }
                    Component::Normal(name) => {
                        resolved.push(name);
                        if let Ok(canonical) = resolved.canonicalize() {
                            resolved = canonical;
                        }
                    }
                    other => resolved.push(other.as_os_str()),
                }
            }
            resolved
        })
    } else {
        profile.to_path_buf()
    };
    let digest = glib::compute_checksum_for_data(
        glib::ChecksumType::Sha256,
        identity.as_os_str().as_bytes(),
    )
    .expect("GLib supports SHA-256");
    format!("com.markwriter.app.Shell.p{digest}")
}

fn forward(
    application: &gio::Application,
    application_id: &str,
    files: &[gio::File],
) -> Result<(), Box<dyn std::error::Error>> {
    let connection = application
        .dbus_connection()
        .ok_or("Missing editor session bus connection")?;
    let object_path = application
        .dbus_object_path()
        .ok_or("Missing editor session bus object")?;
    let platform_data: HashMap<_, _> = [
        ("desktop-startup-id", "DESKTOP_STARTUP_ID"),
        ("activation-token", "XDG_ACTIVATION_TOKEN"),
    ]
    .into_iter()
    .filter_map(|(key, variable)| {
        env::var(variable)
            .ok()
            .map(|value| (key, value.to_variant()))
    })
    .collect();
    let (method, request) = if files.is_empty() {
        ("Activate", (platform_data,).to_variant())
    } else {
        let uris: Vec<_> = files.iter().map(|file| file.uri().to_string()).collect();
        ("Open", (uris, platform_data).to_variant())
    };
    // Wait for the primary to receive the request. A flush alone only
    // confirms that D-Bus got the bytes and can hide a closing editor.
    connection.call_sync(
        Some(application_id),
        &object_path,
        "org.freedesktop.Application",
        method,
        Some(&request),
        None,
        gio::DBusCallFlags::NO_AUTO_START,
        10_000,
        gio::Cancellable::NONE,
    )?;
    Ok(())
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
    fn an_uncreated_profile_and_its_alias_share_the_same_session() {
        let root = tempfile::tempdir().unwrap();
        let original = root.path().join("original");
        let alias = root.path().join("alias");
        std::fs::create_dir(&original).unwrap();
        std::os::unix::fs::symlink(&original, &alias).unwrap();
        let aliased_path = alias.join("missing/../first/profile");
        let canonical_path = original.join("first/profile");
        let first_launch = profile_application_id(&aliased_path);
        assert!(!canonical_path.exists());
        std::fs::create_dir_all(alias.join("missing")).unwrap();
        std::fs::create_dir_all(&canonical_path).unwrap();
        assert_eq!(first_launch, profile_application_id(&canonical_path));
        assert_eq!(first_launch, profile_application_id(&aliased_path));
        assert_ne!(
            first_launch,
            profile_application_id(&original.join("second/profile"))
        );
    }

    #[test]
    fn local_unicode_files_are_delivered_as_one_batch() {
        let queue = OpenQueue::default();
        let first = "/tmp/Grüße 中文 file.md";
        let second = "/tmp/second.MKD";
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
