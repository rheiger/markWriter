use super::*;
use ring::signature::{Ed25519KeyPair, KeyPair};
use serde_json::{json, Value};
use std::io::{Cursor, Read};
use std::time::Duration;

const CURRENT: &str = "2.13.3";
const SELECTED: &str = "2.14.3";
const DATA: &[u8] = b"abc";
const MAC: InstallerPlatform = InstallerPlatform::MacosArm64;
const NOW: u64 = 1_800_000_000;
const MAX_AGE: u64 = 7 * 24 * 60 * 60;
const SKEW: u64 = 5 * 60;

struct Fixture {
    key: Ed25519KeyPair,
    manifest: Value,
}

impl Fixture {
    fn new() -> Self {
        Self {
            key: Ed25519KeyPair::from_seed_unchecked(&[12; 32]).unwrap(),
            manifest: json!({
                "schema": 2,
                "application": "com.markwriter.app",
                "version": SELECTED,
                "platform": "macos-arm64",
                "issuedAt": NOW,
                "expiresAt": NOW + MAX_AGE,
                "artifact": {
                    "name": "MarkWriter-2.14.3-macos-arm64.dmg",
                    "size": 3,
                    "sha256": "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
                }
            }),
        }
    }

    fn verify(&self) -> Result<VerifiedManifest, VerifyError> {
        self.verify_at(UNIX_EPOCH + Duration::from_secs(NOW))
    }

    fn verify_at(&self, now: SystemTime) -> Result<VerifiedManifest, VerifyError> {
        let bytes = serde_json::to_vec(&self.manifest).unwrap();
        verify_manifest(
            self.key.public_key().as_ref().try_into().unwrap(),
            &bytes,
            self.key.sign(&bytes).as_ref(),
            CURRENT,
            SELECTED,
            MAC,
            now,
        )
    }

    fn verify_bytes(
        &self,
        bytes: &[u8],
        current: &str,
        selected: &str,
        platform: InstallerPlatform,
    ) -> Result<VerifiedManifest, VerifyError> {
        let signature = self.key.sign(bytes);
        verify_manifest(
            self.key.public_key().as_ref().try_into().unwrap(),
            bytes,
            signature.as_ref(),
            current,
            selected,
            platform,
            UNIX_EPOCH + Duration::from_secs(NOW),
        )
    }
}

#[test]
fn verifies_exact_bytes_and_stages_the_authenticated_artifact() {
    let manifest = Fixture::new().verify().unwrap();
    assert_eq!(manifest.version(), SELECTED);
    assert_eq!(manifest.name(), "MarkWriter-2.14.3-macos-arm64.dmg");

    let private = tempfile::tempdir().unwrap();
    let mut staged = manifest.stage(DATA, private.path()).unwrap();
    assert_eq!(staged.manifest().version(), SELECTED);
    assert_eq!(
        staged.manifest().name(),
        "MarkWriter-2.14.3-macos-arm64.dmg"
    );
    let mut result = Vec::new();
    staged.read_to_end(&mut result).unwrap();
    assert_eq!(result, DATA);
}

#[test]
fn rejects_legacy_schema_without_signed_freshness() {
    let mut fixture = Fixture::new();
    fixture.manifest["schema"] = json!(1);
    let fields = fixture.manifest.as_object_mut().unwrap();
    fields.remove("issuedAt");
    fields.remove("expiresAt");
    assert_eq!(fixture.verify().unwrap_err(), VerifyError::InvalidManifest);
}

#[test]
fn allows_at_most_five_minutes_of_future_issuance_and_expires_at_the_deadline() {
    let fixture = Fixture::new();
    let at = |seconds| fixture.verify_at(UNIX_EPOCH + Duration::from_secs(seconds));

    assert!(at(NOW - SKEW).is_ok());
    assert_eq!(
        at(NOW - SKEW - 1).unwrap_err(),
        VerifyError::InvalidFreshness
    );
    assert!(at(NOW + MAX_AGE - 1).is_ok());
    assert_eq!(
        at(NOW + MAX_AGE).unwrap_err(),
        VerifyError::InvalidFreshness
    );
    assert_eq!(
        at(NOW + MAX_AGE + 1).unwrap_err(),
        VerifyError::InvalidFreshness
    );
}

#[test]
fn rejects_zero_reversed_and_overlong_signed_lifetimes() {
    for expiration in [NOW, NOW - 1, NOW + MAX_AGE + 1, u64::MAX] {
        let mut fixture = Fixture::new();
        fixture.manifest["expiresAt"] = json!(expiration);
        assert_eq!(
            fixture.verify().unwrap_err(),
            VerifyError::InvalidFreshness,
            "{expiration}"
        );
    }
}

#[test]
fn rejects_a_caller_clock_before_the_unix_epoch() {
    assert_eq!(
        Fixture::new()
            .verify_at(UNIX_EPOCH - Duration::from_secs(1))
            .unwrap_err(),
        VerifyError::InvalidClock
    );
}

#[test]
fn stages_an_artifact_across_multiple_reads() {
    let mut fixture = Fixture::new();
    let bytes = vec![b'x'; 128 * 1024];
    let sha256: String = digest::digest(&digest::SHA256, &bytes)
        .as_ref()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    fixture.manifest["artifact"]["size"] = json!(bytes.len());
    fixture.manifest["artifact"]["sha256"] = json!(sha256);

    let private = tempfile::tempdir().unwrap();
    let mut staged = fixture
        .verify()
        .unwrap()
        .stage(bytes.as_slice(), private.path())
        .unwrap();
    let mut result = Vec::new();
    staged.read_to_end(&mut result).unwrap();
    assert_eq!(result, bytes);
}

#[test]
fn rejects_changes_to_signed_bytes_and_untrusted_signing_keys() {
    let fixture = Fixture::new();
    let bytes = serde_json::to_vec(&fixture.manifest).unwrap();
    let signature = fixture.key.sign(&bytes);
    let mut changed = bytes.clone();
    changed.push(b'\n');
    let mut changed_time = fixture.manifest.clone();
    changed_time["expiresAt"] = json!(NOW + MAX_AGE - 1);
    let changed_time = serde_json::to_vec(&changed_time).unwrap();
    let different_key = Ed25519KeyPair::from_seed_unchecked(&[34; 32]).unwrap();
    for (manifest, public_key, sig) in [
        (
            changed_time.as_slice(),
            fixture.key.public_key().as_ref(),
            signature.as_ref(),
        ),
        (
            changed.as_slice(),
            fixture.key.public_key().as_ref(),
            signature.as_ref(),
        ),
        (
            bytes.as_slice(),
            different_key.public_key().as_ref(),
            signature.as_ref(),
        ),
        (
            bytes.as_slice(),
            fixture.key.public_key().as_ref(),
            &signature.as_ref()[..63],
        ),
    ] {
        assert_eq!(
            verify_manifest(
                public_key.try_into().unwrap(),
                manifest,
                sig,
                CURRENT,
                SELECTED,
                MAC,
                UNIX_EPOCH + Duration::from_secs(NOW)
            )
            .unwrap_err(),
            VerifyError::InvalidSignature
        );
    }
}

#[test]
fn rejects_invalid_selection_and_unsupported_platforms() {
    let fixture = Fixture::new();
    let bytes = serde_json::to_vec(&fixture.manifest).unwrap();
    for (current, selected, platform) in [
        (CURRENT, "2.14.2", MAC),
        (SELECTED, SELECTED, MAC),
        ("2.14.4", SELECTED, MAC),
        ("2.13.3-beta", SELECTED, MAC),
        (CURRENT, "2.14.3-beta", MAC),
        (CURRENT, "v2.14.3", MAC),
        (CURRENT, "2.14.03", MAC),
        (CURRENT, SELECTED, InstallerPlatform::WindowsX64),
        (CURRENT, SELECTED, InstallerPlatform::Unsupported),
    ] {
        assert_eq!(
            fixture
                .verify_bytes(&bytes, current, selected, platform)
                .unwrap_err(),
            VerifyError::InvalidSelection
        );
    }
}

#[test]
fn requires_a_supported_platform_and_its_exact_installer_filename() {
    for (platform, token, filename) in [
        (
            InstallerPlatform::WindowsX64,
            "windows-x64",
            "MarkWriter-2.14.3-windows-x64.exe",
        ),
        (
            InstallerPlatform::Ubuntu2604X64,
            "ubuntu-26.04-x64",
            "MarkWriter-2.14.3-ubuntu-26.04-x64.deb",
        ),
    ] {
        let mut fixture = Fixture::new();
        fixture.manifest["platform"] = json!(token);
        fixture.manifest["artifact"]["name"] = json!(filename);
        let bytes = serde_json::to_vec(&fixture.manifest).unwrap();
        assert_eq!(
            fixture
                .verify_bytes(&bytes, CURRENT, SELECTED, platform)
                .unwrap()
                .name(),
            filename
        );
    }
}

#[test]
fn rejects_signed_metadata_with_a_wrong_application_version_or_filename() {
    for (field, replacement) in [
        ("/application", json!("com.other.app")),
        ("/platform", json!("windows-x64")),
        ("/version", json!("2.14.2")),
        ("/version", json!("2.14.3-beta")),
        ("/version", json!("v2.14.3")),
        (
            "/artifact/name",
            json!("../MarkWriter-2.14.3-macos-arm64.dmg"),
        ),
        ("/artifact/name", json!("MarkWriter-2.14.2-macos-arm64.dmg")),
        ("/artifact/name", json!("https://example.org/example.dmg")),
    ] {
        let mut fixture = Fixture::new();
        *fixture.manifest.pointer_mut(field).unwrap() = replacement;
        assert_eq!(
            fixture.verify().unwrap_err(),
            VerifyError::InvalidSelection,
            "{field}"
        );
    }
}

#[test]
fn rejects_signed_metadata_with_unknown_or_duplicate_fields_and_invalid_limits() {
    let fixture = Fixture::new();
    let bytes = serde_json::to_string(&fixture.manifest).unwrap();
    let positional_artifact = json!([
        fixture.manifest["artifact"]["name"],
        fixture.manifest["artifact"]["size"],
        fixture.manifest["artifact"]["sha256"],
    ]);
    for json in [
        json!([
            fixture.manifest["schema"],
            fixture.manifest["application"],
            fixture.manifest["version"],
            fixture.manifest["platform"],
            fixture.manifest["issuedAt"],
            fixture.manifest["expiresAt"],
            fixture.manifest["artifact"],
        ])
        .to_string(),
        bytes.replace(
            &fixture.manifest["artifact"].to_string(),
            &positional_artifact.to_string(),
        ),
        bytes.replacen('{', "{\"extra\":0,", 1),
        bytes.replacen('{', "{\"schema\":2,", 1),
        bytes.replacen('{', &format!("{{\"issuedAt\":{NOW},"), 1),
        bytes.replacen('{', &format!("{{\"expiresAt\":{},", NOW + MAX_AGE), 1),
        bytes.replace(&format!("\"issuedAt\":{NOW}"), "\"issuedAt\":-1"),
        bytes.replace(&format!("\"issuedAt\":{NOW}"), "\"issuedAt\":1.0"),
        bytes.replace(
            &format!("\"issuedAt\":{NOW}"),
            &format!("\"issuedAt\":\"{NOW}\""),
        ),
        bytes.replace(&format!(",\"expiresAt\":{}", NOW + MAX_AGE), ""),
        format!("{bytes} null"),
        bytes.replace("\"size\":3", "\"size\":3,\"size\":3"),
        bytes.replace("\"size\":3", "\"size\":0"),
        bytes.replace("\"size\":3", "\"size\":536870913"),
        bytes.replace("\"schema\":2", "\"schema\":1"),
        bytes.replace("\"schema\":2", "\"schema\":3"),
        bytes.replace("ba7816", "BA7816"),
        bytes.replace("ba7816", "ba78"),
        bytes.replace("ba7816", "za7816"),
    ] {
        assert_eq!(
            fixture
                .verify_bytes(json.as_bytes(), CURRENT, SELECTED, MAC)
                .unwrap_err(),
            VerifyError::InvalidManifest,
            "{json}"
        );
    }

    assert_eq!(
        fixture
            .verify_bytes(&vec![b' '; MAX_MANIFEST_BYTES + 1], CURRENT, SELECTED, MAC)
            .unwrap_err(),
        VerifyError::InvalidManifest
    );
}

#[test]
fn rejects_changed_truncated_and_overlong_artifacts() {
    let private = tempfile::tempdir().unwrap();
    for (data, error) in [
        (b"abd".as_slice(), StageError::Digest),
        (b"ab".as_slice(), StageError::Size),
        (b"abcd".as_slice(), StageError::Size),
    ] {
        assert_eq!(
            Fixture::new()
                .verify()
                .unwrap()
                .stage(data, private.path())
                .unwrap_err(),
            error
        );
        assert_eq!(std::fs::read_dir(private.path()).unwrap().count(), 0);
    }
}

#[test]
fn refuses_an_incomplete_stream_and_limits_reads_to_the_signed_size_plus_one_byte() {
    let private = tempfile::tempdir().unwrap();
    let interrupted = (&DATA[..1]).chain(BrokenStream);
    assert_eq!(
        Fixture::new()
            .verify()
            .unwrap()
            .stage(interrupted, private.path())
            .unwrap_err(),
        StageError::Io(std::io::ErrorKind::ConnectionReset)
    );
    let mut oversized = Cursor::new([b'x'; 100]);
    assert_eq!(
        Fixture::new()
            .verify()
            .unwrap()
            .stage(&mut oversized, private.path())
            .unwrap_err(),
        StageError::Size
    );
    assert_eq!(oversized.position(), 4);
    assert_eq!(std::fs::read_dir(private.path()).unwrap().count(), 0);
}

struct BrokenStream;

impl Read for BrokenStream {
    fn read(&mut self, _: &mut [u8]) -> std::io::Result<usize> {
        Err(std::io::ErrorKind::ConnectionReset.into())
    }
}
