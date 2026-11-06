# MarkWriter 2.1.0-alpha2 installation, profiles and rollback

This experimental prerelease is the Rust/Tauri desktop editor, distinct from the historical Python/Qt MarkWrite packages. Do not overwrite an older Python installation. There is no automatic updater or infrastructure rollout.

Supported package targets are macOS Apple Silicon DMG/app, Windows x64 current-user NSIS and Ubuntu 26.04x64 DEB. Consult each platform manifest for the **actual tested OS/WebView/build**; Windows Server runner evidence does not imply Windows 10/11 acceptance, and no other architecture/distribution is qualified. The macOS package additionally needs the separately recorded ordinary UI acceptance on downloaded final bytes.

These assets are unsigned experimental builds. A macOS ad-hoc signature is not a Developer ID signature or notarization; Windows Authenticode is absent. No trusted-distribution claim is made. The macOS app has only a linker ad-hoc signature: Info.plist is unbound, resources are unsealed, and strict bundle verification fails. Normal CLI-download/DMG-copy/LaunchServices launch is verified; browser-quarantine launch is unqualified. See the release qualification record for the exact result. Use normal OS installation/launch and retain OS protections. If an OS refuses the package, stop and report its exact message; do not disable Gatekeeper, SmartScreen, sandboxing or certificate checks. Download method/quarantine policy can affect macOS launch; only the recorded tested path is established.

1. Download the package, SHA256SUMS, release-manifest.json, platform manifest, notices and this guide from the same prerelease.
2. Verify its SHA-256 (`shasum -a256 filename` on macOS, `sha256sum filename` on Ubuntu, or `Get-FileHash filename -Algorithm SHA256` in PowerShell). Compare the asset name, version, architecture and source/build URL with the manifest.
3. On macOS open the DMG, copy MarkWriter.app to a normal application location, then launch the copied app. On Windows run the NSIS installer for the current user. On Ubuntu use `sudo apt install ./MarkWriter-2.1.0-alpha2-ubuntu-26.04-x64.deb`, then launch MarkWriter from the application menu or `/usr/bin/markwriter`. Native system WebView dependencies must already be available (the offline NSIS package skips WebView2 installation); no renderer/runtime is downloaded for DOT or Mermaid.
4. Check About shows exactly2.1.0-alpha2 and the Richie credit. Open a **copy** of a Markdown document; verify normal Save As/export, Mermaid and DOT before adopting the experimental editor for important work.

## Existing files and upgrade

Back up Markdown files and the profile before installing. Explicit Save/Save As writes the captured document revision; a pending dialog cannot save a different active tab. View navigation, folds, Settings and diagram completion do not save or rewrite the original. Recovery snapshots are local copies, not original-file autosave. Undo history survives tab switches but not process restarts. Abrupt termination can lose final unflushed keystrokes.

Default profiles use the platform's application config/local-data paths for `com.markwriter.app`; preferences.json and workspace.json are separate versioned files. Normal Linux locations are `~/.config/com.markwriter.app/preferences.json` and `~/.local/share/com.markwriter.app/workspace.json`; macOS uses the corresponding user Library/Application Support location. Windows uses the app-specific user config/local-data locations. Inspect the actual directories before copying; do not infer that another product identity uses the same files.

For an isolated trial/portable profile, set **MARKWRITER_PROFILE_DIR** to a new absolute directory when launching the ordinary installed executable. Both preferences.json and workspace.json live there; native file dialogs and documents still use real chosen paths. Example macOS/Linux shell: `MARKWRITER_PROFILE_DIR=/absolute/new/profile /path/to/installed/executable`. PowerShell: `$env:MARKWRITER_PROFILE_DIR='C:\absolute\new-profile'; & 'C:\path\MarkWriter.exe'`. An invalid relative profile fails visibly rather than falling back into another profile. This is an optional storage location, not an acceptance bridge. It was introduced in alpha2; alpha1 and older binaries ignore it. Isolate older versions through their existing profile mechanism, or keep their original installation/profile untouched while testing alpha2 on copies.

The profile contains document/recovery text; store and back it up as private user data. Copy it only while the app is closed. External changes/deletions are compared on recovery and must be reviewed. Rejected/corrupt storage is retained; do not delete it as a routine troubleshooting step. Explicit Discard removes that draft's recovery ownership.

## Rollback and removal

Close the app after saving needed files, preserve the current profile and install the previously verified package separately or restore its backed-up app. Restore a **copy** of the pre-upgrade profile when necessary; do not overwrite newer recovery evidence. Markdown/DOT fences remain textual and can be opened with another editor even when that editor cannot render DOT. The old Python package is a different editor with different supported semantics.

Windows uninstall removes the current-user application through Installed Apps; Ubuntu uses `sudo apt remove mark-writer`; macOS moves only the installed app to Trash. Preserve documents and profile/recovery data. No server, plugin, user-installed Graphviz/Java, renderer service or updater requires removal.
