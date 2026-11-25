# Authenticated update artifacts

The verifier for [app-controlled updates](https://github.com/rheiger/markWriter/issues/59) runs in native test builds. The app currently discovers stable releases and opens the matching installer in the default browser.

## Manifest and signature

Each manifest describes one artifact. The signer signs the exact UTF-8 JSON bytes with Ed25519 and distributes a detached 64-byte signature. The verifier uses a 32-byte public key supplied by the trusted native caller, authenticates the original bytes, then decodes the two JSON objects. The manifest is limited to 4 KiB. The verifier rejects unknown and duplicate fields, unsupported schemas and unexpected field types.

This test manifest describes three synthetic bytes.

```json
{
  "schema": 1,
  "application": "com.markwriter.app",
  "version": "2.14.3",
  "platform": "macos-arm64",
  "artifact": {
    "name": "MarkWriter-2.14.3-macos-arm64.dmg",
    "size": 3,
    "sha256": "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  }
}
```

- The native caller supplies the running app version from compiled metadata and the platform from the existing native OS and architecture check. Ubuntu asset matching also checks the distribution and version. The selected version comes from native stable release discovery for the offer the user accepted. A future installer command should resolve an app-owned selection and recheck its eligibility before use. Renderer input has no authority to set the public key, expected platform, or installed version.
- The manifest version must exactly match the selection and be strictly newer than the running version. Both inputs use canonical numeric `major.minor.patch` with no prefix, leading zeroes or suffix. The supported platform IDs are `macos-arm64`, `windows-x64`, and `ubuntu-26.04-x64`. Each uses the same exact installer basename as release discovery. The manifest contains no URL or filesystem path.
- The signed byte count is a positive integer up to 512 MiB. SHA-256 is 64 lowercase hexadecimal characters. Download staging hashes and copies the stream in one pass, reads at most one byte past the signed count, and releases a read-only interface to the same temporary file only after size and hash verification. Dropping the staged handle cleans up its temporary file.

The transport will need a fixed HTTPS origin and validated redirect policy, bounded manifest and signature reads, timeouts and cancellation, and a private staging directory. Use the native selection to derive the official release and asset location. Map transport, manifest and artifact failures to recoverable UI states. Do not accept a signature key supplied by an update response. The verifier also requires release freshness policy before activation. Comparing against the installed version blocks downgrades, while a replay of an old signed release newer than the installation can still pass.

## macOS staging and handoff

Use the verified disk image as the start of the installation transaction. For a native tool that requires a pathname, create the image inside a fresh, owner-only staging directory with exclusive creation and no symlink following. Copy from the verified handle, verify the named copy against the authenticated size and digest through a newly opened file, and retain exclusive control of the directory. Bind any exit/restart handoff to that same verified selection. If a separate helper cannot inherit the verified handle and trust the private directory, it must re-verify the original manifest, signature and image before staging the candidate. A stored path or success flag is insufficient.

Mount the image read-only and non-browsable at a private mount point. Require the expected bundle at a fixed path and copy only that bundle into private same-volume staging for the replacement transaction. Reject ambiguous layouts, unexpected file types and symlinks that resolve outside the candidate. Verify the staged app and bundled Quick Look provider with strict code-signature checks. Check the expected app and provider identities, Apple silicon architecture, and candidate version against the verified manifest. Ad hoc code-signature checks contribute bundle integrity. The manifest key authenticates the release.

The replacement helper needs to take ownership of the private staged bundle without a writable gap across exit and relaunch. Preserve the prior bundle through successful relaunch and recovery validation. Installed A→B trials need to exercise failures before and after replacement and confirm that MarkWriter recovers a previously dirty document and the preview registration. See the [replacement and rollback work](https://github.com/rheiger/markWriter/issues/78).

## Production activation

Before activation, approve the production signing key custody, distribution origin and release freshness policy. Sign the final bytes after packaging and any platform signing or sealing. Pin the public key in the native app. For key rotation, ship the new pin in a release authenticated by the previous key or through separately verified manual distribution. If the previous key is compromised, use the independently verified manual path for recovery and revoke the old key in the new app. Establish the version and key transition policy before offering app-controlled installation. The tests use disposable Ed25519 keys and synthetic artifact bytes.
