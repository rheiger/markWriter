//! Stable release discovery and user-initiated browser handoff.
use serde::{Deserialize, Serialize};
use std::time::Duration;

const RELEASES: &str = "https://api.github.com/repos/rheiger/markWriter/releases?per_page=100";
const RELEASE_PAGES: &str = "https://github.com/rheiger/markWriter/releases";
const MAX_RESPONSE: usize = 1024 * 1024;

#[derive(Debug, Deserialize)]
struct Release {
    tag_name: String,
    draft: bool,
    prerelease: bool,
    #[serde(default)]
    assets: Vec<ReleaseAsset>,
}

#[derive(Debug, Deserialize)]
struct ReleaseAsset {
    name: String,
    state: Option<String>,
    browser_download_url: Option<String>,
}

#[derive(Clone, Copy)]
enum InstallerPlatform {
    MacosArm64,
    WindowsX64,
    Ubuntu2604X64,
    Unsupported,
}

impl InstallerPlatform {
    fn current() -> Self {
        match (std::env::consts::OS, std::env::consts::ARCH) {
            ("macos", "aarch64") => Self::MacosArm64,
            ("windows", "x86_64") => Self::WindowsX64,
            ("linux", "x86_64") if supported_linux_release() => Self::Ubuntu2604X64,
            _ => Self::Unsupported,
        }
    }

    fn asset_name(self, version: &str) -> Option<String> {
        let suffix = match self {
            Self::MacosArm64 => "macos-arm64.dmg",
            Self::WindowsX64 => "windows-x64.exe",
            Self::Ubuntu2604X64 => "ubuntu-26.04-x64.deb",
            Self::Unsupported => return None,
        };
        Some(format!("MarkWriter-{version}-{suffix}"))
    }
}

fn supported_linux_release() -> bool {
    use std::fs::File;
    use std::io::{ErrorKind, Read};

    const LIMIT: u64 = 16 * 1024;
    let file = File::open("/etc/os-release").or_else(|error| {
        if error.kind() == ErrorKind::NotFound {
            File::open("/usr/lib/os-release")
        } else {
            Err(error)
        }
    });
    let mut data = String::new();
    match file.and_then(|file| file.take(LIMIT + 1).read_to_string(&mut data)) {
        Ok(bytes) => bytes as u64 <= LIMIT && is_supported_ubuntu(&data),
        Err(_) => false,
    }
}

fn is_supported_ubuntu(data: &str) -> bool {
    let records = data.lines().rev().filter_map(|line| line.split_once('='));
    let value = |field| {
        records
            .clone()
            .find(|(key, _)| *key == field)
            .map(|(_, value)| {
                value
                    .strip_prefix('"')
                    .and_then(|value| value.strip_suffix('"'))
                    .or_else(|| {
                        value
                            .strip_prefix('\'')
                            .and_then(|value| value.strip_suffix('\''))
                    })
                    .unwrap_or(value)
            })
    };
    value("ID") == Some("ubuntu") && value("VERSION_ID") == Some("26.04")
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum InstallerUnavailableReason {
    UnsupportedPlatform,
    MissingInstaller,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Installer {
    Available { url: String },
    Unavailable { reason: InstallerUnavailableReason },
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum UpdateCheckResult {
    Current {
        version: String,
    },
    Available {
        current_version: String,
        version: String,
        release_page_url: String,
        installer: Installer,
    },
    NetworkUnavailable,
}

// Deliberately accept only canonical stable numeric versions; no guessed ordering.
fn stable_version(value: &str) -> Option<[u64; 3]> {
    let raw = value.strip_prefix('v').unwrap_or(value);
    let mut result = [0; 3];
    let mut parts = raw.split('.');
    for n in &mut result {
        let part = parts.next()?;
        if part.is_empty()
            || !part.bytes().all(|c| c.is_ascii_digit())
            || (part.len() > 1 && part.starts_with('0'))
        {
            return None;
        }
        *n = part.parse().ok()?;
    }
    if parts.next().is_some() {
        return None;
    }
    Some(result)
}

fn release_page_url(tag: &str) -> String {
    format!("{RELEASE_PAGES}/tag/{tag}")
}

fn asset_url(tag: &str, name: &str) -> String {
    format!("{RELEASE_PAGES}/download/{tag}/{name}")
}

fn installer_for(platform: InstallerPlatform, release: &Release, version: &str) -> Installer {
    let Some(name) = platform.asset_name(version) else {
        return Installer::Unavailable {
            reason: InstallerUnavailableReason::UnsupportedPlatform,
        };
    };
    let expected_url = asset_url(&release.tag_name, &name);
    let mut matches = release.assets.iter().filter(|asset| asset.name == name);
    match (matches.next(), matches.next()) {
        (Some(asset), None)
            if asset.state.as_deref() == Some("uploaded")
                && asset.browser_download_url.as_deref() == Some(expected_url.as_str()) =>
        {
            Installer::Available { url: expected_url }
        }
        _ => Installer::Unavailable {
            reason: InstallerUnavailableReason::MissingInstaller,
        },
    }
}

fn decide(
    current: &str,
    platform: InstallerPlatform,
    releases: &[Release],
) -> Result<UpdateCheckResult, &'static str> {
    let current_number = stable_version(current).ok_or("Unsupported application version")?;
    // GitHub returns at most the requested count; avoid a false 'up to date' if truncated.
    if releases.len() >= 100 {
        return Err("Release list is incomplete");
    }
    let (latest_number, latest) = releases
        .iter()
        .filter(|r| !r.draft && !r.prerelease)
        .filter_map(|r| stable_version(&r.tag_name).map(|v| (v, r)))
        .max_by_key(|(v, _)| *v)
        .ok_or("No stable releases found")?;
    if latest_number > current_number {
        let version = latest.tag_name.trim_start_matches('v');
        Ok(UpdateCheckResult::Available {
            current_version: current.to_owned(),
            version: version.to_owned(),
            release_page_url: release_page_url(&latest.tag_name),
            installer: installer_for(platform, latest, version),
        })
    } else {
        Ok(UpdateCheckResult::Current {
            version: current.to_owned(),
        })
    }
}

fn decide_response(
    current: &str,
    platform: InstallerPlatform,
    bytes: &[u8],
) -> Result<UpdateCheckResult, &'static str> {
    let releases: Vec<Release> =
        serde_json::from_slice(bytes).map_err(|_| "Invalid release response")?;
    decide(current, platform, &releases)
}

#[tauri::command]
pub async fn check_updates() -> Result<UpdateCheckResult, String> {
    let client = reqwest::Client::builder()
        .user_agent(concat!("MarkWriter/", env!("CARGO_PKG_VERSION")))
        .timeout(Duration::from_secs(10))
        .connect_timeout(Duration::from_secs(5))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "Could not initialize update check".to_string())?;
    let mut response = match client
        .get(RELEASES)
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) if error.is_connect() || error.is_timeout() => {
            return Ok(UpdateCheckResult::NetworkUnavailable)
        }
        Err(_) => return Err("Could not check releases".to_string()),
    };
    if !response.status().is_success() {
        return Err("Release service returned an error".to_string());
    }
    if response
        .content_length()
        .is_some_and(|n| n > MAX_RESPONSE as u64)
    {
        return Err("Release response is too large".to_string());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Could not read releases".to_string())?
    {
        if chunk.len() > MAX_RESPONSE.saturating_sub(bytes.len()) {
            return Err("Release response is too large".to_string());
        }
        bytes.extend_from_slice(&chunk);
    }
    decide_response(
        env!("CARGO_PKG_VERSION"),
        InstallerPlatform::current(),
        &bytes,
    )
    .map_err(str::to_owned)
}

fn is_update_link(platform: InstallerPlatform, version: &str, url: &str) -> bool {
    if version.starts_with('v') || stable_version(version).is_none() {
        return false;
    }
    let name = platform.asset_name(version);
    [version, &format!("v{version}")].into_iter().any(|tag| {
        url == release_page_url(tag)
            || name
                .as_deref()
                .is_some_and(|name| url == asset_url(tag, name))
    })
}

#[tauri::command]
pub async fn open_update_link(version: String, url: String) -> Result<(), String> {
    if !is_update_link(InstallerPlatform::current(), &version, &url) {
        return Err("Invalid MarkWriter release link".to_owned());
    }
    match tauri::async_runtime::spawn_blocking(move || open_in_default_browser(&url)).await {
        Ok(true) => Ok(()),
        _ => Err("Could not open the default browser".to_owned()),
    }
}

#[cfg(target_os = "macos")]
fn open_in_default_browser(url: &str) -> bool {
    use std::process::{Command, Stdio};

    Command::new("/usr/bin/open")
        .arg(url)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|status| status.success())
}

#[cfg(target_os = "linux")]
fn open_in_default_browser(url: &str) -> bool {
    use gio::prelude::AppInfoExt;

    gio::AppInfo::default_for_uri_scheme("https").is_some_and(|browser| {
        browser
            .launch_uris(&[url], None::<&gio::AppLaunchContext>)
            .is_ok()
    })
}

#[cfg(target_os = "windows")]
fn open_in_default_browser(url: &str) -> bool {
    use windows::{
        core::{w, PCWSTR},
        Win32::{
            System::Com::{
                CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE,
            },
            UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL},
        },
    };

    let uri: Vec<u16> = url.encode_utf16().chain(std::iter::once(0)).collect();
    // SAFETY: The URI is NUL-terminated and lives through the call. COM is
    // initialized and uninitialized on the same blocking worker.
    unsafe {
        if CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE).is_err() {
            return false;
        }
        let result = ShellExecuteW(
            None,
            w!("open"),
            PCWSTR(uri.as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        );
        CoUninitialize();
        result.0 as isize > 32
    }
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
fn open_in_default_browser(_url: &str) -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    fn release(tag: &str, draft: bool, prerelease: bool) -> Release {
        Release {
            tag_name: tag.into(),
            draft,
            prerelease,
            assets: Vec::new(),
        }
    }
    #[test]
    fn available_response_matches_the_installer_for_each_supported_platform() {
        let releases = r#"[{
            "tag_name":"v2.13.2","draft":false,"prerelease":false,
            "assets":[
                {"name":"MarkWriter-2.13.2-macos-arm64.dmg","state":"uploaded","browser_download_url":"https://github.com/rheiger/markWriter/releases/download/v2.13.2/MarkWriter-2.13.2-macos-arm64.dmg"},
                {"name":"MarkWriter-2.13.2-windows-x64.exe","state":"uploaded","browser_download_url":"https://github.com/rheiger/markWriter/releases/download/v2.13.2/MarkWriter-2.13.2-windows-x64.exe"},
                {"name":"MarkWriter-2.13.2-ubuntu-26.04-x64-dolphin-preview.deb","state":"uploaded","browser_download_url":"https://github.com/rheiger/markWriter/releases/download/v2.13.2/MarkWriter-2.13.2-ubuntu-26.04-x64-dolphin-preview.deb"},
                {"name":"MarkWriter-2.13.2-ubuntu-26.04-x64.deb","state":"uploaded","browser_download_url":"https://github.com/rheiger/markWriter/releases/download/v2.13.2/MarkWriter-2.13.2-ubuntu-26.04-x64.deb"}
            ]
        }]"#;
        for (platform, filename) in [
            (
                InstallerPlatform::MacosArm64,
                "MarkWriter-2.13.2-macos-arm64.dmg",
            ),
            (
                InstallerPlatform::WindowsX64,
                "MarkWriter-2.13.2-windows-x64.exe",
            ),
            (
                InstallerPlatform::Ubuntu2604X64,
                "MarkWriter-2.13.2-ubuntu-26.04-x64.deb",
            ),
        ] {
            let response = decide_response("2.12.2", platform, releases.as_bytes()).unwrap();
            assert_eq!(
                serde_json::to_value(response).unwrap(),
                serde_json::json!({
                    "kind": "available",
                    "currentVersion": "2.12.2",
                    "version": "2.13.2",
                    "releasePageUrl": "https://github.com/rheiger/markWriter/releases/tag/v2.13.2",
                    "installer": {
                        "kind": "available",
                        "url": format!("https://github.com/rheiger/markWriter/releases/download/v2.13.2/{filename}")
                    }
                })
            );
        }
    }

    #[test]
    fn unavailable_installers_have_distinct_reasons_and_keep_the_release_page() {
        let asset = serde_json::json!({
            "name": "MarkWriter-2.13.2-windows-x64.exe",
            "state": "uploaded",
            "browser_download_url": "https://github.com/rheiger/markWriter/releases/download/v2.13.2/MarkWriter-2.13.2-windows-x64.exe"
        });
        let mut incomplete_asset = asset.clone();
        incomplete_asset["state"] = serde_json::json!("starter");
        let candidates = [
            vec![],
            vec![
                serde_json::json!({"name":"MarkWriter-2.13.2-windows-arm64.exe","state":"uploaded"}),
            ],
            vec![
                serde_json::json!({"name":"MarkWriter-2.13.1-windows-x64.exe","state":"uploaded"}),
            ],
            vec![incomplete_asset],
            vec![
                serde_json::json!({"name":"MarkWriter-2.13.2-windows-x64.exe","state":"uploaded","browser_download_url":"https://github.com.example.test/rheiger/markWriter/releases/download/v2.13.2/MarkWriter-2.13.2-windows-x64.exe"}),
            ],
            vec![
                serde_json::json!({"name":"MarkWriter-2.13.2-windows-x64.exe","state":"uploaded","browser_download_url":"https://github.com/rheiger/markWriter/releases/download/v2.13.1/MarkWriter-2.13.2-windows-x64.exe"}),
            ],
            vec![asset.clone(), asset.clone()],
        ];
        for (platform, reason, assets) in candidates
            .into_iter()
            .map(|assets| (InstallerPlatform::WindowsX64, "missingInstaller", assets))
            .chain([(
                InstallerPlatform::Unsupported,
                "unsupportedPlatform",
                vec![asset],
            )])
        {
            let releases = serde_json::json!([{
                "tag_name":"v2.13.2","draft":false,"prerelease":false,"assets":assets
            }]);
            let response =
                decide_response("2.12.2", platform, releases.to_string().as_bytes()).unwrap();
            let value = serde_json::to_value(response).unwrap();
            assert_eq!(
                value["releasePageUrl"],
                "https://github.com/rheiger/markWriter/releases/tag/v2.13.2"
            );
            assert_eq!(
                value["installer"],
                serde_json::json!({"kind":"unavailable","reason":reason})
            );
        }
    }

    #[test]
    fn malformed_release_response_is_an_error() {
        for data in ["[", "{}", r#"[{"tag_name":"v2.13.2","draft":false}]"#] {
            assert_eq!(
                decide_response("2.12.2", InstallerPlatform::Unsupported, data.as_bytes()),
                Err("Invalid release response")
            );
        }
    }

    #[test]
    fn installer_open_is_constrained_to_official_links_for_the_selected_platform_and_version() {
        let version = "2.13.2";
        let platform = InstallerPlatform::WindowsX64;
        let official = "https://github.com/rheiger/markWriter/releases";
        let page = format!("{official}/tag/v{version}");
        let download =
            format!("{official}/download/v{version}/MarkWriter-{version}-windows-x64.exe");
        assert!(is_update_link(platform, version, &page));
        assert!(is_update_link(platform, version, &download));
        assert!(is_update_link(
            InstallerPlatform::Unsupported,
            version,
            &page
        ));
        assert!(!is_update_link(
            InstallerPlatform::Unsupported,
            version,
            &download
        ));
        assert!(!is_update_link(
            InstallerPlatform::MacosArm64,
            version,
            &download
        ));
        assert!(!is_update_link(platform, "2.13.1", &download));
        assert!(!is_update_link(platform, "v2.13.2", &download));
        assert!(!is_update_link(
            platform,
            version,
            &format!("{page}?redirect=other")
        ));
        assert!(!is_update_link(
            platform,
            version,
            &format!("{download}#extra")
        ));
        assert!(!is_update_link(
            platform,
            version,
            &page.replace("github.com", "github.com.example.test")
        ));
    }

    #[test]
    fn only_the_supported_ubuntu_baseline_matches_a_linux_package() {
        assert!(is_supported_ubuntu(
            r#"NAME="Ubuntu"
ID=ubuntu
VERSION_ID="26.04"
"#
        ));
        assert!(is_supported_ubuntu("ID='ubuntu'\nVERSION_ID=26.04\n"));
        assert!(!is_supported_ubuntu("ID=ubuntu\nVERSION_ID=24.04\n"));
        assert!(!is_supported_ubuntu(
            "ID=ubuntu\nVERSION_ID=26.04\nVERSION_ID=24.04\n"
        ));
        assert!(!is_supported_ubuntu(
            "ID=debian\nID_LIKE=ubuntu\nVERSION_ID=26.04\n"
        ));
        assert!(!is_supported_ubuntu("ID=ubuntu\n"));
    }

    #[test]
    fn chooses_highest_stable_not_latest_or_prerelease() {
        let releases = [
            release("v2.10.0", false, false),
            release("v2.4.9", false, false),
            release("v3.0.0", false, true),
            release("v9.0.0", true, false),
        ];
        assert_eq!(
            decide("2.5.1", InstallerPlatform::Unsupported, &releases).unwrap(),
            UpdateCheckResult::Available {
                current_version: "2.5.1".into(),
                version: "2.10.0".into(),
                release_page_url: "https://github.com/rheiger/markWriter/releases/tag/v2.10.0"
                    .into(),
                installer: Installer::Unavailable {
                    reason: InstallerUnavailableReason::UnsupportedPlatform,
                },
            }
        );
        assert_eq!(
            decide("2.11.0", InstallerPlatform::Unsupported, &releases).unwrap(),
            UpdateCheckResult::Current {
                version: "2.11.0".into()
            }
        );
    }
    #[test]
    fn invalid_versions_and_truncated_results_fail_closed() {
        for v in [
            "2.6",
            "2.6.0-alpha",
            "2.06.0",
            "2.6.0+build",
            "999999999999999999999.0.0",
        ] {
            assert!(stable_version(v).is_none());
        }
        assert!(decide("2.5.1", InstallerPlatform::Unsupported, &[]).is_err());
        assert!(decide(
            "2.5.1-alpha",
            InstallerPlatform::Unsupported,
            &[release("v2.5.1", false, false)]
        )
        .is_err());
        assert!(decide(
            "2.5.1",
            InstallerPlatform::Unsupported,
            &(0..100)
                .map(|_| release("v2.6.0", false, false))
                .collect::<Vec<_>>()
        )
        .is_err());
    }
}
