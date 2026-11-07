# 2.6 findings
Current issues48/55/56/59/49 read live. No production updater or preview host. Quick Look/signing gate precedes provider delivery claims.

## Qualification distinctions
- Rendered Undo restores full model/meaningful content, may normalize terminal LF; native harness now asserts complete model plus explicit normalized fixture. Source Undo still exact bytes.
- macOS LaunchServices cold launch supports --env for per-process profile. External stdout/stderr launchd redirection produced10810/EPERM; omitting only redirects allows the exact unsigned app to cold-open two files. No signing or OS protection workaround.
- Macpackage is intentionally linker-only/unsealed because OS signing not authorized. Release helper and draft workflow disabled; release aggregate still requires seal, so candidate cannot be published through these tools.
- PR workflow checkouts are synthetic merge SHAs; exact-source qualification uses push runs/manifests, with PR checks supplementary.
- d0 wholeMac app payload equals UI-tested00 bytes despite changed test commits; DMGs have different container hashes.
