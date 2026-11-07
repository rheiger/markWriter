# Linux: DEB distribution and repository trust

## Current release

The v2.5.1 target is an Ubuntu 26.04 x64 DEB downloaded directly from the release, not an authenticated APT repository. Other distributions and versions are not qualified by that result. Download the intended release package, check its published checksum and version, and install only when you trust the source. A checksum next to the download is not an independent publisher identity; see the [trust limitation](README.md).

For a trusted local package, the normal package-manager path resolves dependencies from configured repositories:

```sh
sha256sum /path/to/markwriter.deb
sudo apt install /path/to/markwriter.deb
```

Compare the hash with the correct release manifest before installation. Installing a local DEB executes package installation scripts with elevated privileges and does not make it authenticated by Ubuntu's archive. No global APT security setting needs to be disabled. Ubuntu explains the [limitations of direct DEB downloads](https://documentation.ubuntu.com/security/common-mistakes/deb-download-archive/); without a configured MarkWriter repository, updates must be obtained and verified separately.

## Future authenticated distribution

The usual APT trust model signs **repository Release metadata**, which binds package-index hashes and then package hashes; it is not an automatic per-DEB signature check. See [Ubuntu archive verification](https://documentation.ubuntu.com/security/software-integrity/archive-verification/) and [apt-secure](https://manpages.ubuntu.com/manpages/resolute/man8/apt-secure.8.html). A separately signed checksum manifest may help authenticate a direct download only if the verification key fingerprint has been obtained through a trusted independent channel. Neither approach proves that the package is safe.

A future repository requires a deliberate hosting, support and key-lifecycle decision:

1. Generate and protect a dedicated archive signing key, preferably offline or hardware-backed, with a documented recovery, expiry, rotation and revocation process. Publish the public key fingerprint through an independently authenticated channel. Never put a private key or passphrase in the repository, CI logs, or release artifacts.
2. Publish versioned DEBs and package indexes, then generate and sign current Release metadata as `InRelease` or `Release` plus `Release.gpg`. Protect the signing job and restrict publication to reviewed releases. Provide a repository-specific keyring and a `Signed-By` entry; avoid globally trusting third-party keys and never use `trusted=yes` or disable signature checks. The exact repository layout and bootstrap commands must be designed and tested for supported Ubuntu releases before publication; no MarkWriter APT repository is currently promised.
3. On a clean Ubuntu 26.04 x64 system, verify key fingerprint and authenticated metadata, install and upgrade through APT, and test expired, missing, modified and wrong-key metadata fail closed. Test launch, editing, save, export, uninstall and rollback with the exact packages. Capture repository metadata, final artifact hashes, OS version and results as release evidence. Recheck after publication from the actual download endpoint.

Keep a previous known-good DEB and independent document/profile backups. A rollback may require an explicit package downgrade and compatibility review of newer profile data; do not delete recovery evidence. If a repository key is compromised, stop publication, revoke or rotate the key, communicate a trusted replacement path, and verify the affected distribution history before resuming.
