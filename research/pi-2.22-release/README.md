# Qualify the release installers

The Ubuntu and Windows PlantUML workflows run when an evidence commit changes `research/pi-2.22-release/request.json` on `codex/pi-222-release-installer-qa`. Keep this evidence branch separate from the product. After the release commit and successful package run exist, set these three string fields in the request.

| Field | Required value |
| --- | --- |
| `version` | Allocated 2.22 patch, without the leading v |
| `source` | Full, lowercase 40-character release commit |
| `buildRun` | GitHub Actions run ID for the successful Tauri production packages workflow on that commit |

Both jobs verify that the version tag resolves to the expected commit, the original package run succeeded on that commit in this repository, and the downloaded ZIP matches the GitHub artifact digest and byte count. They check the manifest and installer before installation and validate the installed binary identity and native version. The app serves its own worker and corrected notice bytes to each test. The fixtures cover WYSIWYG, Preview, native HTML export and source fallbacks.

The qualification downloads the completed producer's packages. Each workflow uploads the GUI receipts, exported synthetic HTML, and `release-package-identity.json` containing the package version, tag, commit, producer run and attempt, archive digest, installer digest, binary identity and harness revision. Stage the separately downloaded installer whose SHA-256 equals the qualified receipt.
