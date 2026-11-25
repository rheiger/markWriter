# Install, upgrade and roll back MarkWriter 2.16.3

These installation instructions apply to the MarkWriter 2.16.3 GitHub Release packages. Download the package for your system from that release. Before installing, compare your package's SHA-256 digest with the corresponding entry in `SHA256SUMS`. Keep the previous installer and back up your MarkWriter profile before upgrading.

## macOS on Apple silicon

Mount `MarkWriter-2.16.3-macos-arm64.dmg` and copy `MarkWriter.app` to a staging folder. Eject the image, then run `codesign --verify --deep --strict` with the path to the staged app. The released app and bundled Quick Look extension carry ad hoc integrity seals. See the release manifest for their trust and notarization status. For a fresh install, move the verified app to Applications and open it. When replacing an older copy, use the upgrade and rollback procedure below before moving the verified app into place.

Gatekeeper may block the first launch of the downloaded app because the ad-hoc seal
carries no Apple developer identity or notarization. After verifying the download,
see [Apple's guidance on opening apps from unidentified developers](https://support.apple.com/en-us/102445).

Use the `uninstall-markwriter-macos.py` helper from the 2.16.3 release and verify it against that release’s `SHA256SUMS`. Pass the exact installed version and absolute app path. Keep its backup and transaction record for rollback. Quit the selected app and close its Finder previews before removing or restoring it. See the [macOS upgrade and rollback procedure](https://github.com/rheiger/markWriter/blob/v2.7.5/docs/install-2.7.5.md#macos-on-apple-silicon) for the exact-path workflow and Finder registration checks.

## Windows x64

Close MarkWriter and the Explorer Preview pane. Run the verified Windows x64 installer and approve elevation. The standard machine-wide installation uses `%ProgramFiles%\MarkWriter`.

### Manual rollback to the previous machine-wide installation

1. Close MarkWriter and the File Explorer Preview pane. Open **Settings → Apps → Installed apps → MarkWriter → Uninstall**. Leave the application data deletion option unchecked. If the uninstaller reports that the preview DLL is still in use, sign out and back in before retrying.
2. If unrelated files remain in `%ProgramFiles%\MarkWriter`, move them to a safe location before reinstalling. Keep the originals of your Markdown files and your profile in place.
3. Download the [previous Windows x64 installer](https://github.com/rheiger/markWriter/releases/tag/v2.15.4), verify it against that release's `SHA256SUMS`, and run it. Launch MarkWriter from Start and confirm its version in **About MarkWriter**. Open a known saved document and check that any recovery draft is available.
4. In File Explorer, choose **Open with → MarkWriter** or check the Preview pane if you use the bundled preview. Windows chooses the effective editor and preview provider from your existing associations.

The Windows installer, editor and Explorer preview DLL are unsigned. Check the installer against the release’s `SHA256SUMS`.

## Ubuntu 26.04 x64

Run `sudo apt install ./MarkWriter-2.16.3-ubuntu-26.04-x64.deb`. Use `sudo apt remove mark-writer` for removal. Manage the optional Sushi and Dolphin preview providers separately and remove or disable them before replacing their files during rollback. See the [Ubuntu preview setup](https://github.com/rheiger/markWriter/blob/v2.7.5/docs/install-2.7.5.md#ubuntu-2604-x64) for enablement and removal commands. Reinstall the previous editor package to roll back.

MarkWriter can check for stable updates at startup and every 24 hours while it is running. Automatic checks can be turned off in Settings. Choose **Skip This Release** to suppress automatic notices for that version, or **Remind Me Later** to defer the next notice for 24 hours. **Help → Check for Updates** can still show the release. When a matching installer is available, the download opens in your default browser for manual installation.
