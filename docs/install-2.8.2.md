# Install, upgrade and roll back MarkWriter 2.8.2

This guide accompanies the 2.8.2 candidate packages. Before installing, compare your package's SHA-256 digest with the corresponding entry in `SHA256SUMS`. Keep the previous installer and back up your MarkWriter profile before upgrading.

## macOS on Apple silicon

Mount `MarkWriter-2.8.2-macos-arm64.dmg` and copy `MarkWriter.app` to Applications. Eject the image and open the copied app. Verify the app and bundled Quick Look extension's integrity before replacing an installed copy.

Use the exact installed version and absolute app path when running the macOS removal tool. Keep its backup and transaction record for rollback. Quit the selected app and close its Finder previews before removing or restoring it. See the [macOS upgrade and rollback procedure](https://github.com/rheiger/markWriter/blob/v2.7.5/docs/install-2.7.5.md#macos-on-apple-silicon) for the exact-path workflow and Finder registration checks.

## Windows x64

Close MarkWriter and the Explorer Preview pane. Run the verified Windows x64 installer and approve elevation. The standard machine-wide installation uses `%ProgramFiles%\MarkWriter`.

### Manual rollback to the 2.7.5 machine-wide installation

1. Close MarkWriter and the File Explorer Preview pane. Open **Settings → Apps → Installed apps → MarkWriter → Uninstall**. Leave the application data deletion option unchecked. If the uninstaller reports that the preview DLL is still in use, sign out and back in before retrying.
2. If unrelated files remain in `%ProgramFiles%\MarkWriter`, move them to a safe location before reinstalling. Keep the originals of your Markdown files and your profile in place.
3. Download the [2.7.5 Windows x64 installer](https://github.com/rheiger/markWriter/releases/tag/v2.7.5), verify it against that release's `SHA256SUMS`, and run it. Launch MarkWriter from Start and confirm 2.7.5 in **About MarkWriter**. Open a known saved document and check that any recovery draft is available.
4. In File Explorer, choose **Open with → MarkWriter** or check the Preview pane if you use the bundled preview. Windows chooses the effective editor and preview provider from your existing associations.

The Windows packages and bundled preview DLL are unsigned.

## Ubuntu 26.04 x64

Run `sudo apt install ./MarkWriter-2.8.2-ubuntu-26.04-x64.deb`. Use `sudo apt remove mark-writer` for removal. Manage the optional Sushi and Dolphin preview providers separately and remove or disable them before replacing their files during rollback. See the [Ubuntu preview setup](https://github.com/rheiger/markWriter/blob/v2.7.5/docs/install-2.7.5.md#ubuntu-2604-x64) for enablement and removal commands. Reinstall the previous editor package to roll back.

The app's update check discovers available versions for manual installation.
