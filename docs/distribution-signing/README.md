# Distribution trust and signing

These guides describe the current distribution and a **future, unimplemented** path to trusted distribution. They do not authorize issuing certificates, changing CI, or publishing a release. Validate current vendor requirements before implementing them.

| Platform | v2.5.1 qualification | Guide |
| --- | --- | --- |
| macOS Apple Silicon | Whole app ad-hoc sealed; no Developer ID or notarization | [macOS](macos.md) |
| Windows x64 | Unsigned current-user NSIS installer | [Windows](windows.md) |
| Ubuntu 26.04 x64 | Direct DEB; not an authenticated APT repository | [Linux](linux.md) |

The exact release artifacts and their limitations are documented in [installation](../install-2.5.1.md) and [acceptance](../2.5.1-release-acceptance.md). Checksums detect accidental changes only if the expected checksum itself comes from a trusted independent channel; a checksum published beside an artifact does not independently establish the publisher's identity.

Tauri's optional [updater signatures](https://v2.tauri.app/plugin/updater/) authenticate update artifacts against a public key embedded in the application. They are distinct from Developer ID, notarization, Authenticode, and APT archive authentication, and do not replace those mechanisms. MarkWriter v2.5.1 has no automatic updater. Introducing one needs a separate design, key recovery and rotation plan, and end-to-end qualification.

## Common release discipline

1. Decide the supported OS versions and architectures, select the exact reviewed source commit and build dependencies, and preserve the previous installer and a user-data backup.
2. Protect signing keys separately from source and build artifacts. Restrict signing to reviewed release jobs with least privilege and protected environments. Never print keys, passwords, tokens, or encoded key material; base64 is not encryption. Do not expose secrets to untrusted pull requests or store them in logs, artifacts, or commits. Prefer short-lived credentials or hardware/cloud-backed keys where supported.
3. Build and sign the final distributable, verify identity, signatures, timestamps and any notarization or repository metadata, then test the **downloaded** bytes on clean representative systems, including install, normal launch, upgrade and rollback. Record commands, OS versions, artifact hashes and results without secrets. Test offline behavior where relevant.
4. Publish only if every platform gate passes. Do not overwrite historical release assets. On failed validation stop publication; retain evidence, repair the cause and produce a newly qualified candidate. If a key is compromised, revoke it through the issuer, disable signing access, assess affected releases, communicate the incident and qualify a replacement identity. Retain recovery material securely and rehearse restoration and rotation.

No signing mechanism by itself proves that software is safe or that an app and all its extensions work correctly. User data, recovery state, and previous installers must be protected during upgrade and rollback testing.
