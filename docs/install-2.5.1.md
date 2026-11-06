# MarkWriter 2.5.1 installation and rollback

Regular release; published with latest=false. Use only the same v2.5.1 release’s packages, manifests and checksums. Targets: Apple Silicon macOS DMG, Windows x64 current-user NSIS and Ubuntu 26.04 x64 DEB. Exact tested OS/WebView baselines are in the platform manifests and QUALIFICATION.json.

Back up documents and profile before upgrading. Keep the previous installer for rollback. Install through the ordinary OS workflow and verify About reports 2.5.1. Keep OS protections enabled and report normal launch blocks. macOS has a strict whole-bundle ad-hoc seal, but no Developer ID signing or notarization. Windows is unsigned. Regular release classification does not imply trusted signing, notarization or qualified browser-quarantine behavior.

For an isolated trial, set MARKWRITER_PROFILE_DIR to a new absolute directory before launch. This isolates preferences.json and workspace.json; it does not change document destinations. Undo survives open-tab switches, not process restart. Local recovery may miss the final unflushed keystrokes after abrupt termination.

Help → User Guide explains editing, recovery, font controls and code/math/diagram fences. Explicit Python/JSON highlighting accepts 16 Ki UTF-16 units per block and a separate 32 Ki document budget; other explicit grammars retain 4 Ki/16 Ki, and all lines remain limited to 2 Ki. Oversized or failed highlighting stays readable plain text with all source preserved. Math uses explicit math fences; PDF export remains deferred.

To roll back, quit normally, retain newer recovery/profile data, reinstall the prior package and restore a separately backed-up profile if needed. Uninstall through the ordinary OS/package manager without deleting documents or recovery evidence. No automatic updater or required server is included.
