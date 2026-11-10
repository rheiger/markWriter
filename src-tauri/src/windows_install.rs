//! Per-user half of the NSIS migration. Run from the installed executable at
//! ordinary privilege, never from the old user-writable installer directory.
use std::{
    fs, io,
    os::windows::{ffi::OsStrExt, fs::MetadataExt},
    path::{Path, PathBuf},
};
use windows::{
    core::{Interface, PCWSTR},
    Win32::{
        System::Com::{
            CoCreateInstance, CoInitializeEx, CoUninitialize, IPersistFile, CLSCTX_INPROC_SERVER,
            COINIT_APARTMENTTHREADED, STGM_READ,
        },
        UI::Shell::{
            IShellLinkW, IsUserAnAdmin, SHChangeNotify, ShellLink, SHCNE_ASSOCCHANGED,
            SHCNF_IDLIST, SLGP_RAWPATH,
        },
    },
};
use winreg::{
    enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_SET_VALUE, KEY_WOW64_64KEY},
    RegKey,
};

const LOCATION: &str = r"Software\markwriter\MarkWriter";
const UNINSTALL: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\MarkWriter";
const PREVIEW_LIST: &str = r"Software\Microsoft\Windows\CurrentVersion\PreviewHandlers";
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
        || read(user, LOCATION, "").as_deref() != dir.to_str()
        || !ownership
            .iter()
            .all(|(name, expected)| read(user, UNINSTALL, name).as_ref() == Some(expected))
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
    let command_key = r"Software\Classes\MarkWrite.Document\shell\open\command";
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

fn clean_user_install(installed: &Path) -> io::Result<()> {
    let dir = dirs::data_local_dir()
        .ok_or_else(|| io::Error::other("Local AppData unavailable"))?
        .join("MarkWriter");
    let user = RegKey::predef(HKEY_CURRENT_USER);
    let app = retire_legacy_app(&user, &dir);
    let preview = retire_legacy_preview(&user);
    let association = installed.parent().map_or(Ok(()), |parent| {
        retire_missing_markwrite_association(&user, parent)
    });
    unsafe { SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, None, None) };
    app.and(preview).and(association)
}
