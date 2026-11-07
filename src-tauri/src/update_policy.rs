//! Read-only release discovery; this is not an updater or an authenticated feed.
use serde::{Deserialize, Serialize};
use std::time::Duration;

const RELEASES: &str = "https://api.github.com/repos/rheiger/markWriter/releases?per_page=100";
const MAX_RESPONSE: usize = 1024 * 1024;

#[derive(Debug, Deserialize)]
struct Release {
    tag_name: String,
    draft: bool,
    prerelease: bool,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum UpdateCheckResult {
    Current {
        version: String,
    },
    Available {
        #[serde(rename = "currentVersion")]
        current_version: String,
        version: String,
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

fn decide(current: &str, releases: &[Release]) -> Result<UpdateCheckResult, &'static str> {
    let current_number = stable_version(current).ok_or("Unsupported application version")?;
    // GitHub returns at most the requested count; avoid a false 'up to date' if truncated.
    if releases.len() >= 100 {
        return Err("Release list is incomplete");
    }
    let latest = releases
        .iter()
        .filter(|r| !r.draft && !r.prerelease)
        .filter_map(|r| stable_version(&r.tag_name).map(|v| (v, &r.tag_name)))
        .max_by_key(|(v, _)| *v)
        .ok_or("No stable releases found")?;
    if latest.0 > current_number {
        Ok(UpdateCheckResult::Available {
            current_version: current.to_owned(),
            version: latest.1.trim_start_matches('v').to_owned(),
        })
    } else {
        Ok(UpdateCheckResult::Current {
            version: current.to_owned(),
        })
    }
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
    let releases: Vec<Release> =
        serde_json::from_slice(&bytes).map_err(|_| "Invalid release response".to_string())?;
    decide(env!("CARGO_PKG_VERSION"), &releases).map_err(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn release(tag: &str, draft: bool, prerelease: bool) -> Release {
        Release {
            tag_name: tag.into(),
            draft,
            prerelease,
        }
    }
    #[test]
    fn chooses_highest_stable_not_latest_or_prerelease() {
        let releases = [
            release("v2.4.9", false, false),
            release("v2.10.0", false, false),
            release("v3.0.0", false, true),
            release("v9.0.0", true, false),
        ];
        assert_eq!(
            decide("2.5.1", &releases).unwrap(),
            UpdateCheckResult::Available {
                current_version: "2.5.1".into(),
                version: "2.10.0".into()
            }
        );
        assert_eq!(
            decide("2.11.0", &releases).unwrap(),
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
        assert!(decide("2.5.1", &[]).is_err());
        assert!(decide("2.5.1-alpha", &[release("v2.5.1", false, false)]).is_err());
        assert!(decide(
            "2.5.1",
            &(0..100)
                .map(|_| release("v2.6.0", false, false))
                .collect::<Vec<_>>()
        )
        .is_err());
    }
}
