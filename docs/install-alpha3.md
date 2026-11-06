# MarkWriter 2.1.0-alpha3 installation and rollback

This is the experimental Rust/Tauri editor. Alpha3 includes shared code highlighting, literal technical input, theme controls and the illustrated paper-and-brass-nib icon with expanded About. Use the packages, manifests, checksums and QUALIFICATION.json from the same v2.1.0-alpha3 prerelease. Read `docs/alpha3-release-acceptance.md`; the older f54b444 and 15f25d1 reports are dated checkpoints rather than proof of final package bytes. Historical Python/Qt packages and alpha2 releases remain unchanged.

Package targets are Apple Silicon macOS DMG/app, Windows x64 current-user NSIS and Ubuntu26.04x64 DEB. Check each manifest for actual tested OS/WebView/source SHA. Windows runner evidence does not imply Windows10/11 acceptance; other architectures and Linux distributions need separate qualification.

macOS must pass whole-bundle ad-hoc sealing and `codesign --verify --deep --strict`. Ad-hoc integrity is not DeveloperID trust or notarization; browser-quarantine acceptance is separate. Windows is unsigned. Keep OS protections enabled. If normal installation/launch is blocked, report the exact message.

1. Obtain package, SHA256SUMS, manifests, notices and this guide from the same qualified source. Compare the version, source SHA, architecture and asset bytes.
2. Back up documents and the existing profile. Retain the previous installer/app for rollback.
3. macOS: open the DMG and copy MarkWriter.app to an application location. Windows: run the current-user installer. Ubuntu: install the DEB with the normal package manager. System WebView dependencies must be available; offline Windows packages do not download WebView2.
4. Verify About shows `2.1.0-alpha3`. Test a document copy, SaveAs/export, code highlighting and diagrams. View→Theme provides Auto/Light/Dark; View→Syntax highlighting and the `{ }` toolbar button share one saved preference. Oversized or uncertain code stays plain; see the acceptance report for limits.

CSS, Swift, Makefile and Objective-C `m` are included. Broader unlabeled detection and Java/Perl/AWK/sed/CMake remain #44 backlog. Code blocks, inline code and blockquotes request literal input; arbitrary OS text-expansion dictionaries are not individually qualified. Genuine WYSIWYG edits still have the separate inline-code whitespace serialization limitation in #46. Use raw Markdown editing when exact whitespace matters.

Default preferences/workspace files use the app-specific config/local-data locations for `com.markwriter.app`. For an isolated trial, launch with `MARKWRITER_PROFILE_DIR` set to a new absolute directory. Both preferences.json and workspace.json live there; file dialogs still use actual chosen paths. This override is supported since alpha2; alpha1/older binaries ignore it. Do not use it to infer isolation with older binaries.

View changes never write document files. Explicit Save/SaveAs captures the document and revision. Recovery snapshots are local copies; abrupt termination can lose final unflushed keystrokes. Undo survives tab switches, not process restart. To roll back, quit normally, retain the new profile/recovery data, reinstall the previous package and use a separately backed-up profile if necessary. Do not overwrite newer recovery evidence.

Uninstall through the OS application manager, package manager or Trash; preserve documents and profiles. There is no automatic updater, server, Graphviz/Java install or infrastructure rollout.
