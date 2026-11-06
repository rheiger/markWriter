# MarkWriter 2.5.0-alpha1 installation and rollback

Experimental prerelease; install only from the same qualified v2.5.0-alpha1 release assets, manifests and checksums. Targets: Apple Silicon macOS DMG, Windows x64 current-user NSIS, Ubuntu 26.04 x64 DEB. Actual tested OS/WebView baselines are in the platform manifests.

Back up documents and profile before trying the alpha. Keep the previous installer for rollback. Install using the ordinary OS workflow and verify About reports 2.5.0-alpha1. Keep OS protections enabled; report any normal launch block. macOS ad-hoc sealing verifies integrity but is not Developer ID trust or notarization; Windows is unsigned. Browser-quarantine and other OS baselines require separate acceptance.

For an isolated trial set MARKWRITER_PROFILE_DIR to a new absolute directory before launch. This isolates preferences.json and workspace.json; it does not change document destinations. Undo survives open-tab switches, not process restart. Recovery snapshots are local copies and may miss final unflushed keystrokes after abrupt termination.

Use Help → User Guide for editing conventions, shortcuts and supported code/math/diagram fences. Math uses explicit math fences, with no inline dollar syntax, equation numbering or arbitrary TeX packages. HTML export is self-contained. PDF export remains deferred.

To roll back, quit normally, retain newer recovery/profile data, reinstall the prior package and restore a separately backed-up profile if needed. Uninstall through the ordinary OS/package manager without deleting documents or recovery evidence. There is no automatic updater or required server.
