//! Forward Explorer launches before constructing a second editor or opening
//! the workspace. A new listener is created before the previous handle is dropped.
use std::{
    ffi::OsString,
    hash::{DefaultHasher, Hash, Hasher},
    io,
    os::windows::{ffi::OsStringExt, io::AsRawHandle},
    path::PathBuf,
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::windows::named_pipe::{ClientOptions, NamedPipeServer, ServerOptions},
    runtime::{Builder, Runtime},
    time::{sleep, timeout},
};
use windows::Win32::{
    Foundation::{CloseHandle, HANDLE},
    Security::{EqualSid, GetTokenInformation, TokenUser, TOKEN_QUERY, TOKEN_USER},
    System::{
        Pipes::{GetNamedPipeClientProcessId, GetNamedPipeServerProcessId},
        Threading::{
            GetCurrentProcess, OpenProcess, OpenProcessToken, QueryFullProcessImageNameW,
            PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
        },
    },
    UI::WindowsAndMessaging::{AllowSetForegroundWindow, MessageBoxW, MB_ICONERROR},
};

const MAX_BYTES: usize = 256 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

pub struct Inbox {
    runtime: Runtime,
    name: String,
    server: NamedPipeServer,
}

fn pipe_name() -> io::Result<String> {
    let profile = std::env::var_os("MARKWRITER_PROFILE_DIR")
        .map(PathBuf::from)
        .or_else(dirs::data_local_dir)
        .ok_or_else(|| io::Error::other("Could not identify the current Windows profile"))?;
    let mut hash = DefaultHasher::new();
    profile.hash(&mut hash);
    Ok(format!(
        r"\\.\pipe\com.markwriter.app.{:016x}",
        hash.finish()
    ))
}

pub fn connect_or_listen(args: &[OsString]) -> io::Result<Option<Inbox>> {
    let name = pipe_name()?;
    let runtime = Builder::new_current_thread().enable_all().build()?;
    let server = runtime.block_on(async {
        match ServerOptions::new()
            .first_pipe_instance(true)
            .reject_remote_clients(true)
            .create(&name)
        {
            Ok(server) => Ok(Some(server)),
            // First-instance creation on an existing pipe returns access denied.
            Err(error) if error.raw_os_error() == Some(5) => {
                timeout(REQUEST_TIMEOUT, forward(&name, args)).await??;
                Ok(None)
            }
            Err(error) => Err(error),
        }
    })?;
    Ok(server.map(|server| Inbox {
        runtime,
        name,
        server,
    }))
}

async fn forward(name: &str, args: &[OsString]) -> io::Result<()> {
    let paths: Vec<_> = args
        .iter()
        .skip(1)
        .map(|path| path.to_string_lossy().into_owned())
        .collect();
    let data = serde_json::to_vec(&paths)?;
    if data.len() > MAX_BYTES {
        return Err(io::Error::other(
            "Too much data in the Explorer launch request",
        ));
    }
    let mut client = loop {
        match ClientOptions::new().open(name) {
            Ok(client) => break client,
            Err(error) if matches!(error.raw_os_error(), Some(231)) => {
                sleep(Duration::from_millis(30)).await
            }
            Err(error) => return Err(error),
        }
    };
    // Windows may allow the shell-launched process to transfer foreground
    // activation to the receiving app for this request.
    let mut pid = 0;
    unsafe {
        GetNamedPipeServerProcessId(HANDLE(client.as_raw_handle()), &mut pid)
            .map_err(io::Error::other)?;
    }
    verify_peer(pid)?;
    let _ = unsafe { AllowSetForegroundWindow(pid) };
    client.write_u32(data.len() as u32).await?;
    client.write_all(&data).await?;
    if client.read_u8().await? != 1 {
        return Err(io::Error::other(
            "The running editor rejected the launch request",
        ));
    }
    client.write_u8(1).await
}

impl Inbox {
    pub fn start(self, app: AppHandle) -> io::Result<()> {
        std::thread::Builder::new()
            .name("windows-shell-open".into())
            .spawn(move || {
                let Self {
                    runtime,
                    name,
                    server,
                } = self;
                runtime.block_on(serve(&name, server, |paths| {
                    // Validation and queuing stay in the same path used by the cold launch.
                    let _ = app.state::<crate::os_open::OpenQueue>().enqueue(paths);
                    let _ = app.emit("os-open-pending", ());
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                }));
            })?;
        Ok(())
    }
}

pub(crate) struct OwnedHandle(pub HANDLE);

impl Drop for OwnedHandle {
    fn drop(&mut self) {
        let _ = unsafe { CloseHandle(self.0) };
    }
}

fn process_image(process: HANDLE) -> windows::core::Result<OsString> {
    let mut path = vec![0u16; 32768];
    let mut len = path.len() as u32;
    unsafe {
        QueryFullProcessImageNameW(
            process,
            PROCESS_NAME_WIN32,
            windows::core::PWSTR(path.as_mut_ptr()),
            &mut len,
        )?;
    }
    Ok(OsString::from_wide(&path[..len as usize]))
}

fn open_query_token(process: HANDLE) -> windows::core::Result<OwnedHandle> {
    let mut handle = HANDLE::default();
    unsafe {
        OpenProcessToken(process, TOKEN_QUERY, &mut handle)?;
    }
    Ok(OwnedHandle(handle))
}

fn token_user(token: HANDLE) -> windows::core::Result<Vec<usize>> {
    // TOKEN_USER and a maximum-length Windows SID fit in 256 aligned bytes.
    let mut data = vec![0usize; 256 / std::mem::size_of::<usize>()];
    let mut needed = 0;
    unsafe {
        GetTokenInformation(
            token,
            TokenUser,
            Some(data.as_mut_ptr().cast()),
            256,
            &mut needed,
        )?;
    }
    Ok(data)
}

pub(crate) fn require_same_token_user(left: HANDLE, right: HANDLE) -> windows::core::Result<()> {
    let left_user = token_user(left)?;
    let right_user = token_user(right)?;
    unsafe {
        EqualSid(
            (*left_user.as_ptr().cast::<TOKEN_USER>()).User.Sid,
            (*right_user.as_ptr().cast::<TOKEN_USER>()).User.Sid,
        )
    }
}

fn verify_peer(pid: u32) -> io::Result<()> {
    let peer = OwnedHandle(unsafe {
        OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).map_err(io::Error::other)?
    });
    let own = unsafe { GetCurrentProcess() };
    let own_user = open_query_token(own).map_err(io::Error::other)?;
    let peer_user = open_query_token(peer.0).map_err(io::Error::other)?;
    if require_same_token_user(own_user.0, peer_user.0).is_err()
        || !process_image(own)
            .map_err(io::Error::other)?
            .eq_ignore_ascii_case(&process_image(peer.0).map_err(io::Error::other)?)
    {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "Unrecognized MarkWriter launch peer",
        ));
    }
    Ok(())
}

async fn serve(name: &str, mut listener: NamedPipeServer, mut on_paths: impl FnMut(Vec<PathBuf>)) {
    loop {
        let connected = listener.connect().await;
        let mut client = listener;
        // Retain ownership of the pipe name while the next listener is created.
        // Dropping each used handle also discards its buffered and pending reads.
        listener = loop {
            match ServerOptions::new()
                .reject_remote_clients(true)
                .create(name)
            {
                Ok(next) => break next,
                Err(_) => sleep(Duration::from_millis(100)).await,
            }
        };
        if connected.is_ok() {
            let _ = timeout(Duration::from_secs(2), receive(&mut client, &mut on_paths)).await;
        } else {
            sleep(Duration::from_millis(100)).await;
        }
    }
}

async fn receive(
    pipe: &mut NamedPipeServer,
    on_paths: &mut impl FnMut(Vec<PathBuf>),
) -> io::Result<()> {
    let mut pid = 0;
    unsafe {
        GetNamedPipeClientProcessId(HANDLE(pipe.as_raw_handle()), &mut pid)
            .map_err(io::Error::other)?;
    }
    verify_peer(pid)?;
    let len = pipe.read_u32().await? as usize;
    if len > MAX_BYTES {
        return Err(io::Error::other(
            "Explorer launch request exceeds the limit",
        ));
    }
    let mut data = vec![0; len];
    pipe.read_exact(&mut data).await?;
    let paths: Vec<PathBuf> = serde_json::from_slice::<Vec<String>>(&data)?
        .into_iter()
        .map(PathBuf::from)
        .collect();
    on_paths(paths);
    pipe.write_u8(1).await?;
    // Let the client consume the acknowledgement before closing its end of
    // the exchange. The listener for the next request is already available.
    let _ = pipe.read_u8().await?;
    Ok(())
}

pub fn show_error(message: &str) {
    let text: Vec<_> = message.encode_utf16().chain([0]).collect();
    unsafe {
        MessageBoxW(
            None,
            windows::core::PCWSTR(text.as_ptr()),
            windows::core::w!("MarkWriter"),
            MB_ICONERROR,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::mpsc;

    #[tokio::test]
    async fn repeated_launches_do_not_inherit_reads_from_the_previous_client() {
        let name = format!(r"\\.\pipe\markwriter-reopen-test-{}", std::process::id());
        let server = ServerOptions::new()
            .first_pipe_instance(true)
            .reject_remote_clients(true)
            .create(&name)
            .unwrap();
        let (send, mut received) = mpsc::unbounded_channel();
        let service_name = name.clone();
        let service = tokio::spawn(async move {
            serve(&service_name, server, move |paths| {
                send.send(paths).unwrap();
            })
            .await;
        });

        let first = r"C:\MarkWriter test\Zürich.md";
        let frame = serde_json::to_vec(&[first]).unwrap();
        let mut client = ClientOptions::new().open(&name).unwrap();
        client.write_u32(frame.len() as u32).await.unwrap();
        client.write_all(&frame).await.unwrap();
        assert_eq!(client.read_u8().await.unwrap(), 1);
        // The final acknowledgement and unread bytes share a kernel write.
        // A connection's buffered reads must never reach the next client.
        client.write_all(&[1, 0, 0, 0, 0]).await.unwrap();
        drop(client);
        assert_eq!(received.recv().await.unwrap(), [PathBuf::from(first)]);
        sleep(Duration::from_millis(100)).await;

        for index in 0..24 {
            let path = PathBuf::from(format!(r"C:\MarkWriter test\Über {index}.markdown"));
            let args = [
                OsString::from("markwriter.exe"),
                path.clone().into_os_string(),
            ];
            timeout(Duration::from_secs(3), forward(&name, &args))
                .await
                .unwrap_or_else(|error| panic!("Explorer request {index} timed out: {error}"))
                .unwrap_or_else(|error| panic!("Explorer request {index} failed: {error}"));
            assert_eq!(received.try_recv().unwrap(), [path]);
        }

        assert!(received.try_recv().is_err());
        service.abort();
    }
}
