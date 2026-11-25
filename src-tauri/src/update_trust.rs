//! Verify a signed update manifest and stage the exact authenticated artifact bytes.

use crate::update_policy::{stable_version, InstallerPlatform};
use ring::{digest, signature};
use serde::{de, Deserialize, Deserializer};
use std::fmt;
use std::fs::File;
use std::io::{self, Read, Seek, Write};
use std::marker::PhantomData;
use std::path::Path;

const APPLICATION: &str = "com.markwriter.app";
const SCHEMA: u32 = 1;
const MAX_MANIFEST_BYTES: usize = 4096;
const MAX_ARTIFACT_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Manifest {
    schema: u32,
    application: String,
    version: String,
    platform: String,
    #[serde(deserialize_with = "object_only")]
    artifact: Artifact,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Artifact {
    name: String,
    size: u64,
    sha256: String,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum VerifyError {
    InvalidSignature,
    InvalidManifest,
    InvalidSelection,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum StageError {
    Io(io::ErrorKind),
    Size,
    Digest,
}

impl From<io::Error> for StageError {
    fn from(error: io::Error) -> Self {
        Self::Io(error.kind())
    }
}

#[derive(Debug)]
pub(crate) struct VerifiedManifest {
    version: String,
    name: String,
    size: u64,
    sha256: [u8; 32],
}

// Derived structs also accept positional arrays. The format requires JSON objects.
fn object_only<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    struct Object<T>(PhantomData<T>);

    impl<'de, T: Deserialize<'de>> de::Visitor<'de> for Object<T> {
        type Value = T;

        fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            formatter.write_str("a JSON object")
        }

        fn visit_map<M: de::MapAccess<'de>>(self, map: M) -> Result<T, M::Error> {
            T::deserialize(de::value::MapAccessDeserializer::new(map))
        }
    }

    deserializer.deserialize_map(Object(PhantomData))
}

fn parse_sha256(value: &str) -> Option<[u8; 32]> {
    let mut digest = [0; 32];
    if value.len() != 2 * digest.len() {
        return None;
    }
    let nibble = |byte| match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        _ => None,
    };
    for (output, hex) in digest.iter_mut().zip(value.as_bytes().chunks_exact(2)) {
        *output = (nibble(hex[0])? << 4) | nibble(hex[1])?;
    }
    Some(digest)
}

fn canonical_version(value: &str) -> Option<[u64; 3]> {
    stable_version(value).filter(|_| !value.starts_with('v'))
}

/// The caller supplies a native trust root and a selection from native stable discovery.
pub(crate) fn verify_manifest(
    pinned_public_key: &[u8; 32],
    bytes: &[u8],
    signature: &[u8],
    current_version: &str,
    selected_version: &str,
    platform: InstallerPlatform,
) -> Result<VerifiedManifest, VerifyError> {
    if bytes.is_empty() || bytes.len() > MAX_MANIFEST_BYTES {
        return Err(VerifyError::InvalidManifest);
    }
    signature::UnparsedPublicKey::new(&signature::ED25519, pinned_public_key)
        .verify(bytes, signature)
        .map_err(|_| VerifyError::InvalidSignature)?;

    let mut parser = serde_json::Deserializer::from_slice(bytes);
    let manifest: Manifest = object_only(&mut parser).map_err(|_| VerifyError::InvalidManifest)?;
    parser.end().map_err(|_| VerifyError::InvalidManifest)?;
    if manifest.schema != SCHEMA || !(1..=MAX_ARTIFACT_BYTES).contains(&manifest.artifact.size) {
        return Err(VerifyError::InvalidManifest);
    }

    let current = canonical_version(current_version).ok_or(VerifyError::InvalidSelection)?;
    let selected = canonical_version(selected_version).ok_or(VerifyError::InvalidSelection)?;
    let platform_id = match platform {
        InstallerPlatform::MacosArm64 => "macos-arm64",
        InstallerPlatform::WindowsX64 => "windows-x64",
        InstallerPlatform::Ubuntu2604X64 => "ubuntu-26.04-x64",
        InstallerPlatform::Unsupported => return Err(VerifyError::InvalidSelection),
    };
    let name = platform
        .asset_name(selected_version)
        .ok_or(VerifyError::InvalidSelection)?;
    if selected <= current
        || manifest.application != APPLICATION
        || manifest.version != selected_version
        || manifest.platform != platform_id
        || manifest.artifact.name != name
    {
        return Err(VerifyError::InvalidSelection);
    }

    let sha256 = parse_sha256(&manifest.artifact.sha256).ok_or(VerifyError::InvalidManifest)?;
    Ok(VerifiedManifest {
        version: manifest.version,
        name,
        size: manifest.artifact.size,
        sha256,
    })
}

impl VerifiedManifest {
    pub(crate) fn version(&self) -> &str {
        &self.version
    }

    pub(crate) fn name(&self) -> &str {
        &self.name
    }

    /// Stage from the download stream in a caller-controlled temporary directory.
    /// The returned handle is the original file and exposes only reads.
    pub(crate) fn stage(
        self,
        source: impl Read,
        directory: &Path,
    ) -> Result<VerifiedArtifact, StageError> {
        let mut file = tempfile::tempfile_in(directory)?;
        let mut digest = digest::Context::new(&digest::SHA256);
        let mut source = source.take(self.size + 1);
        let mut buffer = [0; 64 * 1024];
        let mut received = 0;
        loop {
            let count = source.read(&mut buffer)?;
            if count == 0 {
                break;
            }
            received += count as u64;
            if received > self.size {
                return Err(StageError::Size);
            }
            let bytes = &buffer[..count];
            digest.update(bytes);
            file.write_all(bytes)?;
        }

        if received != self.size {
            return Err(StageError::Size);
        }
        if digest.finish().as_ref() != self.sha256 {
            return Err(StageError::Digest);
        }

        file.rewind()?;
        Ok(VerifiedArtifact {
            manifest: self,
            file,
        })
    }
}

/// Keeps the verified file alive through consumption without exposing a path reopen.
#[derive(Debug)]
pub(crate) struct VerifiedArtifact {
    manifest: VerifiedManifest,
    file: File,
}

impl VerifiedArtifact {
    pub(crate) fn manifest(&self) -> &VerifiedManifest {
        &self.manifest
    }
}

impl Read for VerifiedArtifact {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        self.file.read(buffer)
    }
}

#[cfg(test)]
mod tests;
