//! Per-user half of the NSIS migration. Run from the installed executable at
//! ordinary privilege, never from the old user-writable installer directory.
use crate::windows_open::{require_same_token_user, OwnedHandle};
use std::{
    fs, io,
    os::windows::{ffi::OsStrExt, fs::MetadataExt},
    path::{Path, PathBuf},
};
use windows::{
    core::{Interface, PCWSTR, PWSTR},
    Win32::{
        Foundation::{
            GetLastError, ERROR_NOT_ALL_ASSIGNED, ERROR_NO_SUCH_LOGON_SESSION, E_ACCESSDENIED,
            E_FAIL, HANDLE, LUID, WAIT_OBJECT_0,
        },
        Security::{
            AdjustTokenPrivileges, CreateRestrictedToken, CreateWellKnownSid, DuplicateTokenEx,
            GetTokenInformation, LookupPrivilegeValueW, SecurityImpersonation, SetTokenInformation,
            TokenElevation, TokenIntegrityLevel, TokenLinkedToken, TokenPrimary,
            WinBuiltinAdministratorsSid, WinMediumLabelSid, DISABLE_MAX_PRIVILEGE,
            LUID_AND_ATTRIBUTES, PSID, SE_DEBUG_NAME, SE_PRIVILEGE_ENABLED, SID_AND_ATTRIBUTES,
            TOKEN_ADJUST_DEFAULT, TOKEN_ADJUST_PRIVILEGES, TOKEN_ASSIGN_PRIMARY, TOKEN_DUPLICATE,
            TOKEN_ELEVATION, TOKEN_LINKED_TOKEN, TOKEN_MANDATORY_LABEL, TOKEN_PRIVILEGES,
            TOKEN_QUERY,
        },
        System::Com::{
            CoCreateInstance, CoInitializeEx, CoUninitialize, IPersistFile, CLSCTX_INPROC_SERVER,
            COINIT_APARTMENTTHREADED, STGM_READ,
        },
        System::Threading::{
            CreateProcessAsUserW, CreateProcessWithTokenW, GetCurrentProcess, GetExitCodeProcess,
            OpenProcess, OpenProcessToken, WaitForSingleObject, CREATE_NO_WINDOW,
            CREATE_PROCESS_LOGON_FLAGS, PROCESS_INFORMATION, PROCESS_QUERY_LIMITED_INFORMATION,
            STARTUPINFOW,
        },
        UI::Shell::{
            IShellLinkW, IsUserAnAdmin, SHChangeNotify, ShellLink, SHCNE_ASSOCCHANGED,
            SHCNF_IDLIST, SLGP_RAWPATH,
        },
        UI::WindowsAndMessaging::{GetShellWindow, GetWindowThreadProcessId},
    },
};
use winreg::{
    enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_SET_VALUE, KEY_WOW64_64KEY},
    RegKey,
};

const LOCATION: &str = r"Software\markwriter\MarkWriter";
const UNINSTALL: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\MarkWriter";
const PREVIEW_LIST: &str = r"Software\Microsoft\Windows\CurrentVersion\PreviewHandlers";
const STALE_MARKWRITE_COMMAND: &str = r"Software\Classes\MarkWrite.Document\shell\open\command";
const OLD_CLSID: &str = "{A448B833-8E1A-4EA4-BCC4-272134A64E97}";
const PREVIEW_IID: &str = "{8895b1c6-b41f-4c1c-a562-0d564250836f}";
const PREVHOST: &str = "{6D2B5079-2F0B-48DD-AB7F-97CEC514D30B}";
const LABEL: &str = "MarkWriter Markdown Preview";
const REPARSE_POINT: u32 = 0x400;

fn read(root: &RegKey, path: &str, name: &str) -> Option<String> {
    root.open_subkey_with_flags(path, KEY_READ | KEY_WOW64_64KEY)
        .ok()?
        .get_value(name)
        .ok()
}

fn remove_value(root: &RegKey, path: &str, name: &str, expected: &str) -> io::Result<()> {
    if let Ok(key) = root.open_subkey_with_flags(path, KEY_READ | KEY_SET_VALUE | KEY_WOW64_64KEY) {
        if key
            .get_value::<String, _>(name)
            .is_ok_and(|value| value.eq_ignore_ascii_case(expected))
        {
            key.delete_value(name)?;
            let info = key.query_info()?;
            drop(key);
            if info.values == 0 && info.sub_keys == 0 && path != PREVIEW_LIST {
                root.delete_subkey_with_flags(path, KEY_WOW64_64KEY)?;
            }
        }
    }
    Ok(())
}

fn quoted(path: &Path) -> String {
    format!("\"{}\"", path.display())
}

fn remove_owned_link(path: &Path, target: &Path) {
    if !fs::symlink_metadata(path)
        .is_ok_and(|meta| meta.is_file() && meta.file_attributes() & REPARSE_POINT == 0)
    {
        return;
    }
    let wide: Vec<_> = path.as_os_str().encode_wide().chain([0]).collect();
    let matches = unsafe {
        if CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_err() {
            return;
        }
        let result = (|| {
            let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
            link.cast::<IPersistFile>()?
                .Load(PCWSTR(wide.as_ptr()), STGM_READ)?;
            let mut stored = [0u16; 32768];
            link.GetPath(&mut stored, std::ptr::null_mut(), SLGP_RAWPATH.0 as u32)?;
            let len = stored
                .iter()
                .position(|&word| word == 0)
                .unwrap_or(stored.len());
            Ok::<_, windows::core::Error>(
                String::from_utf16_lossy(&stored[..len])
                    .eq_ignore_ascii_case(&target.to_string_lossy()),
            )
        })();
        CoUninitialize();
        result.unwrap_or(false)
    };
    if matches {
        let _ = fs::remove_file(path);
    }
}

fn remove_known_file(path: &Path) -> io::Result<()> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.is_file() && meta.file_attributes() & REPARSE_POINT == 0 => {
            fs::remove_file(path)
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        _ => Err(io::Error::other("Unexpected legacy installer file")),
    }
}

fn retire_legacy_app(user: &RegKey, dir: &Path) -> io::Result<()> {
    let Some(version) = read(user, UNINSTALL, "DisplayVersion") else {
        return Ok(());
    };
    let valid_version = version.split('.').collect::<Vec<_>>();
    let older = match valid_version.as_slice() {
        ["2", minor, patch] => match (minor.parse::<u32>(), patch.parse::<u32>()) {
            (Ok(minor), Ok(patch)) => (minor, patch) < (7, 4),
            _ => false,
        },
        _ => false,
    };
    let binary = dir.join("markwriter.exe");
    let uninstaller = dir.join("uninstall.exe");
    let ownership = [
        ("DisplayName", "MarkWriter".into()),
        ("Publisher", "markwriter".into()),
        ("InstallLocation", quoted(dir)),
        ("MainBinaryName", "markwriter.exe".into()),
        ("UninstallString", quoted(&uninstaller)),
        ("DisplayIcon", quoted(&binary)),
    ];
    if !older
        || !read(user, LOCATION, "")
            .is_some_and(|value| value.eq_ignore_ascii_case(&dir.to_string_lossy()))
        || !ownership.iter().all(|(name, expected)| {
            read(user, UNINSTALL, name).is_some_and(|value| value.eq_ignore_ascii_case(expected))
        })
    {
        return Ok(());
    }
    if dir.exists()
        && !fs::symlink_metadata(dir)
            .is_ok_and(|meta| meta.is_dir() && meta.file_attributes() & REPARSE_POINT == 0)
    {
        return Err(io::Error::other(
            "Legacy installation directory is a reparse point",
        ));
    }
    // Never execute the old, user-writable uninstaller or recursively delete
    // the folder. Missing known files are safe on retry; extra files survive.
    remove_known_file(&binary)?;
    remove_known_file(&uninstaller)?;
    let _ = fs::remove_dir(dir);
    if let Some(desktop) = dirs::desktop_dir() {
        remove_owned_link(&desktop.join("MarkWriter.lnk"), &binary);
    }
    if let Some(roaming) = dirs::data_dir() {
        remove_owned_link(
            &roaming.join(r"Microsoft\Windows\Start Menu\Programs\MarkWriter.lnk"),
            &binary,
        );
    }
    let application = r"Software\Classes\Applications\markwriter.exe\shell\open\command";
    for args in ["\"%1\"", "%1"] {
        remove_value(
            user,
            application,
            "",
            &format!("{} {args}", quoted(&binary)),
        )?;
    }
    user.delete_subkey_with_flags(UNINSTALL, KEY_WOW64_64KEY)?;
    remove_value(user, LOCATION, "", &dir.to_string_lossy())?;
    Ok(())
}

fn retire_legacy_preview(user: &RegKey) -> io::Result<()> {
    let class = format!(r"Software\Classes\CLSID\{OLD_CLSID}");
    let server = format!(r"{class}\InprocServer32");
    let Some(dll) = read(user, &server, "") else {
        return Ok(());
    };
    let dll_path = Path::new(&dll);
    if !dll_path.is_absolute()
        || !dll_path
            .file_name()
            .is_some_and(|name| name.eq_ignore_ascii_case("MarkWriterPreview.dll"))
        || read(user, &class, "").is_some_and(|value| value != LABEL)
        || read(user, &class, "AppID").is_some_and(|value| value != PREVHOST)
        || read(user, &server, "ThreadingModel").is_some_and(|value| value != "Apartment")
    {
        return Ok(());
    }
    for ext in [".md", ".markdown"] {
        remove_value(
            user,
            &format!(r"Software\Classes\{ext}\shellex\{PREVIEW_IID}"),
            "",
            OLD_CLSID,
        )?;
    }
    remove_value(user, PREVIEW_LIST, OLD_CLSID, LABEL)?;
    remove_value(user, &class, "AppID", PREVHOST)?;
    remove_value(user, &class, "", LABEL)?;
    remove_value(user, &server, "ThreadingModel", "Apartment")?;
    remove_value(user, &server, "", &dll)?;
    if let Ok(key) = user.open_subkey(&class) {
        let info = key.query_info()?;
        if info.values == 0 && info.sub_keys == 0 {
            user.delete_subkey_with_flags(&class, KEY_WOW64_64KEY)?;
        }
    }
    Ok(())
}

// Older MarkWrite left this ProgID behind after its binary was removed.
fn retire_missing_markwrite_association(user: &RegKey, program_files: &Path) -> io::Result<()> {
    let binary = program_files.join(r"MarkWrite\MarkWrite.exe");
    if !fs::symlink_metadata(&binary).is_err_and(|error| error.kind() == io::ErrorKind::NotFound) {
        return Ok(());
    }
    let command_key = STALE_MARKWRITE_COMMAND;
    let command = format!("{} \"%1\"", quoted(&binary));
    if !read(user, command_key, "").is_some_and(|value| value.eq_ignore_ascii_case(&command)) {
        return Ok(());
    }
    for ext in [".md", ".markdown"] {
        remove_value(
            user,
            &format!(r"Software\Classes\{ext}"),
            "",
            "MarkWrite.Document",
        )?;
    }
    remove_value(user, command_key, "", &command)
}

fn installed_dir() -> io::Result<Option<PathBuf>> {
    let machine = RegKey::predef(HKEY_LOCAL_MACHINE);
    let Some(installed) = read(&machine, LOCATION, "").map(PathBuf::from) else {
        return Ok(None);
    };
    let running = std::env::current_exe()?;
    Ok(running
        .as_os_str()
        .eq_ignore_ascii_case(installed.join("markwriter.exe").as_os_str())
        .then_some(installed))
}

pub fn retry_legacy_cleanup() -> io::Result<()> {
    if unsafe { IsUserAnAdmin().as_bool() } {
        return Ok(());
    }
    if let Some(installed) = installed_dir()? {
        clean_user_install(&installed)?;
    }
    Ok(())
}

pub fn retire_legacy_install() -> io::Result<()> {
    if unsafe { IsUserAnAdmin().as_bool() } {
        return Err(io::Error::other(
            "Legacy cleanup requires ordinary user privilege",
        ));
    }
    let installed = installed_dir()?
        .ok_or_else(|| io::Error::other("Legacy cleanup requires the installed executable"))?;
    clean_user_install(&installed)
}

fn token_elevated(token: HANDLE) -> windows::core::Result<bool> {
    let mut elevation = TOKEN_ELEVATION::default();
    let mut length = 0;
    unsafe {
        GetTokenInformation(
            token,
            TokenElevation,
            Some((&mut elevation as *mut TOKEN_ELEVATION).cast()),
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut length,
        )?;
    }
    Ok(elevation.TokenIsElevated != 0)
}

// Setup is elevated and may have been started with another account's admin
// credentials. Only the interactive shell's ordinary token may touch HKCU
// or legacy files. Start our installed binary with that token and observe
// its exit before reporting the setup result.
pub fn run_installer_cleanup() -> io::Result<()> {
    let install = installed_dir()?
        .ok_or_else(|| io::Error::other("Legacy cleanup requires the installed executable"))?;
    if !unsafe { IsUserAnAdmin().as_bool() } {
        return clean_user_install(&install);
    }
    launch_user_cleanup(&install.join("markwriter.exe")).map_err(io::Error::other)
}

fn open_shell_token(pid: u32) -> windows::core::Result<OwnedHandle> {
    unsafe {
        let shell = OwnedHandle(OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid)?);
        let mut token = HANDLE::default();
        OpenProcessToken(shell.0, TOKEN_DUPLICATE | TOKEN_QUERY, &mut token)?;
        Ok(OwnedHandle(token))
    }
}

// Over-the-shoulder elevation can make the setup token belong to a different
// account from Explorer. Enable an already-assigned privilege only while
// opening that one shell token, then restore its prior state before launch.
fn open_cross_account_shell_token(pid: u32) -> windows::core::Result<OwnedHandle> {
    unsafe {
        let mut handle = HANDLE::default();
        OpenProcessToken(
            GetCurrentProcess(),
            TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY,
            &mut handle,
        )?;
        let own_token = OwnedHandle(handle);
        let mut luid = LUID::default();
        LookupPrivilegeValueW(PCWSTR::null(), SE_DEBUG_NAME, &mut luid)?;
        let enable = TOKEN_PRIVILEGES {
            PrivilegeCount: 1,
            Privileges: [LUID_AND_ATTRIBUTES {
                Luid: luid,
                Attributes: SE_PRIVILEGE_ENABLED,
            }],
        };
        let mut prior = TOKEN_PRIVILEGES::default();
        let mut needed = 0;
        AdjustTokenPrivileges(
            own_token.0,
            false,
            Some(&enable),
            std::mem::size_of::<TOKEN_PRIVILEGES>() as u32,
            Some(&mut prior),
            Some(&mut needed),
        )?;
        if GetLastError() == ERROR_NOT_ALL_ASSIGNED {
            return Err(windows::core::Error::new(
                E_ACCESSDENIED,
                "The administrator token cannot open the interactive shell token",
            ));
        }
        let user = open_shell_token(pid);
        AdjustTokenPrivileges(own_token.0, false, Some(&prior), 0, None, None)?;
        user
    }
}

fn launch_user_cleanup(binary: &Path) -> windows::core::Result<()> {
    let mut pid = 0;
    unsafe {
        GetWindowThreadProcessId(GetShellWindow(), Some(&mut pid));
        if pid == 0 {
            return Err(windows::core::Error::new(
                E_FAIL,
                "No interactive Explorer shell was available to setup",
            ));
        }
        let user = open_shell_token(pid).or_else(|error| {
            if error.code() == E_ACCESSDENIED {
                open_cross_account_shell_token(pid)
            } else {
                Err(error)
            }
        })?;
        let no_logon = ERROR_NO_SUCH_LOGON_SESSION.to_hresult();
        let ordinary = ordinary_shell_token(user.0)
            .and_then(|ordinary| start_user_cleanup(binary, ordinary.0, false));
        match ordinary {
            Err(error) if error.code() == no_logon => {
                let restricted = restrict_same_account(user.0).map_err(|failure| {
                    windows::core::Error::new(
                        failure.code(),
                        format!("Could not restrict the installer token after {error}: {failure}"),
                    )
                })?;
                start_user_cleanup(binary, restricted.0, true).map_err(|failure| {
                    windows::core::Error::new(
                        failure.code(),
                        format!("Restricted-token cleanup after {error} failed: {failure}"),
                    )
                })
            }
            result => result,
        }
    }
}

fn ordinary_shell_token(shell: HANDLE) -> windows::core::Result<OwnedHandle> {
    unsafe {
        let linked = if token_elevated(shell)? {
            let mut linked = TOKEN_LINKED_TOKEN::default();
            let mut size = 0;
            GetTokenInformation(
                shell,
                TokenLinkedToken,
                Some((&mut linked as *mut TOKEN_LINKED_TOKEN).cast()),
                std::mem::size_of::<TOKEN_LINKED_TOKEN>() as u32,
                &mut size,
            )?;
            Some(OwnedHandle(linked.LinkedToken))
        } else {
            None
        };
        let token = linked.as_ref().map_or(shell, |handle| handle.0);
        if token_elevated(token)? {
            return Err(windows::core::Error::new(
                E_ACCESSDENIED,
                "Could not obtain the ordinary shell token",
            ));
        }
        let mut handle = HANDLE::default();
        DuplicateTokenEx(
            token,
            TOKEN_ASSIGN_PRIMARY | TOKEN_DUPLICATE | TOKEN_QUERY,
            None,
            SecurityImpersonation,
            TokenPrimary,
            &mut handle,
        )?;
        Ok(OwnedHandle(handle))
    }
}

// With no split logon, only use a restricted version of setup's own token if
// the interactive Explorer account has the same SID. This also allows
// CreateProcessAsUserW without borrowing another account's logon session.
fn restrict_same_account(shell: HANDLE) -> windows::core::Result<OwnedHandle> {
    unsafe {
        let mut handle = HANDLE::default();
        OpenProcessToken(
            GetCurrentProcess(),
            TOKEN_ADJUST_DEFAULT | TOKEN_ASSIGN_PRIMARY | TOKEN_DUPLICATE | TOKEN_QUERY,
            &mut handle,
        )?;
        let own = OwnedHandle(handle);
        require_same_token_user(own.0, shell)?;
        let mut admins = [0usize; 16];
        let mut admins_size = std::mem::size_of_val(&admins) as u32;
        let admins_sid = PSID(admins.as_mut_ptr().cast());
        CreateWellKnownSid(
            WinBuiltinAdministratorsSid,
            None,
            Some(admins_sid),
            &mut admins_size,
        )?;
        CreateRestrictedToken(
            own.0,
            DISABLE_MAX_PRIVILEGE,
            Some(&[SID_AND_ATTRIBUTES {
                Sid: admins_sid,
                Attributes: 0,
            }]),
            None,
            None,
            &mut handle,
        )?;
        let token = OwnedHandle(handle);
        let mut medium = [0usize; 16];
        let mut medium_size = std::mem::size_of_val(&medium) as u32;
        let medium_sid = PSID(medium.as_mut_ptr().cast());
        CreateWellKnownSid(WinMediumLabelSid, None, Some(medium_sid), &mut medium_size)?;
        let label = TOKEN_MANDATORY_LABEL {
            Label: SID_AND_ATTRIBUTES {
                Sid: medium_sid,
                Attributes: 0x20,
            }, // SE_GROUP_INTEGRITY
        };
        SetTokenInformation(
            token.0,
            TokenIntegrityLevel,
            (&label as *const TOKEN_MANDATORY_LABEL).cast(),
            std::mem::size_of_val(&label) as u32 + medium_size,
        )?;
        Ok(token)
    }
}

fn start_user_cleanup(
    binary: &Path,
    primary: HANDLE,
    restricted: bool,
) -> windows::core::Result<()> {
    unsafe {
        let program: Vec<_> = binary.as_os_str().encode_wide().chain([0]).collect();
        let mut command: Vec<_> = format!("{} --retire-legacy-install --quiet", quoted(binary))
            .encode_utf16()
            .chain([0])
            .collect();
        let startup = STARTUPINFOW {
            cb: std::mem::size_of::<STARTUPINFOW>() as u32,
            ..Default::default()
        };
        let mut child = PROCESS_INFORMATION::default();
        if restricted {
            CreateProcessAsUserW(
                Some(primary),
                PCWSTR(program.as_ptr()),
                Some(PWSTR(command.as_mut_ptr())),
                None,
                None,
                false,
                CREATE_NO_WINDOW,
                None,
                PCWSTR::null(),
                &startup,
                &mut child,
            )?;
        } else {
            // The interactive shell already has its user hive loaded.
            CreateProcessWithTokenW(
                primary,
                CREATE_PROCESS_LOGON_FLAGS(0),
                PCWSTR(program.as_ptr()),
                Some(PWSTR(command.as_mut_ptr())),
                CREATE_NO_WINDOW,
                None,
                PCWSTR::null(),
                &startup,
                &mut child,
            )?;
        }
        let process = OwnedHandle(child.hProcess);
        let _thread = OwnedHandle(child.hThread);
        if WaitForSingleObject(process.0, 20_000) != WAIT_OBJECT_0 {
            return Err(windows::core::Error::new(
                windows::Win32::Foundation::E_FAIL,
                "User cleanup did not finish during setup",
            ));
        }
        let mut exit = 0;
        GetExitCodeProcess(process.0, &mut exit)?;
        if exit != 0 {
            return Err(windows::core::Error::new(
                windows::Win32::Foundation::E_FAIL,
                "User cleanup returned an error",
            ));
        }
    }
    Ok(())
}

fn clean_user_install(installed: &Path) -> io::Result<()> {
    let dir = dirs::data_local_dir()
        .ok_or_else(|| io::Error::other("Local AppData unavailable"))?
        .join("MarkWriter");
    let user = RegKey::predef(HKEY_CURRENT_USER);
    if read(&user, UNINSTALL, "DisplayVersion").is_none()
        && read(
            &user,
            &format!(r"Software\Classes\CLSID\{OLD_CLSID}\InprocServer32"),
            "",
        )
        .is_none()
        && read(&user, STALE_MARKWRITE_COMMAND, "").is_none()
    {
        return Ok(());
    }
    let app = retire_legacy_app(&user, &dir);
    let preview = retire_legacy_preview(&user);
    let association = installed.parent().map_or(Ok(()), |parent| {
        retire_missing_markwrite_association(&user, parent)
    });
    unsafe { SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, None, None) };
    app.and(preview).and(association)
}
