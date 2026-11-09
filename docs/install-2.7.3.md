# Install MarkWriter 2.7.3

Download the package for your system and verify its SHA-256 against `SHA256SUMS`. Keep the previous installer and a backup of your MarkWriter profile if you are upgrading.

## macOS on Apple silicon

Mount `MarkWriter-2.7.3-macos-arm64.dmg`, copy `MarkWriter.app` to Applications, eject the image, and open the copied app once. The app and Quick Look extension have ad hoc integrity signatures. The package has no Developer ID or Apple notarization. macOS may restrict launch of a downloaded copy. Review Apple's app safety guidance and your organization's policy before making a per-app exception. [Apple app safety guidance](https://support.apple.com/en-us/102445)

Select a supported file in Finder and press Space. To inspect or enable the extension, open **System Settings → General → Login Items & Extensions → Quick Look**. If Finder still falls back, close the preview and run the commands below with the path to your actual copied app. The commands target only that app and its extension. [Apple extension settings](https://support.apple.com/guide/mac-help/mtusr003/mac)

```sh
app="/Applications/MarkWriter.app"
extension="$app/Contents/PlugIns/MarkWriterQuickLook.appex"
lsregister="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
codesign --verify --deep --strict "$app" &&
  "$lsregister" -f "$app" &&
  pluginkit -a "$extension" &&
  pluginkit -m -ADv -i com.markwriter.app.quicklook
```

Reopen Quick Look on a fresh file. See the [format and platform matrix](https://github.com/rheiger/markWriter/blob/v2.7.3/docs/shell-preview-matrix.md) for registered file types, grammar mappings and fallback behavior. macOS selects among eligible providers. The **Open with** button identifies the editor association.

The extension reads source files without writing to them. It uses a disposable WebKit view and blocks remote document resources. Its App Sandbox client entitlement allows WebKit to start and grants outgoing capability at the process level. [Apple App Sandbox entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.network.client) · [WebKit content blocking](https://webkit.org/blog/3476/content-blockers-first-look/)

### Remove or restore one Mac copy

Download `uninstall-markwriter-macos.py` from the v2.7.3 release and check its SHA-256 against `SHA256SUMS`. Use Python 3 from a regular account. Specify the absolute path to the app you want to remove and its exact installed version.

```sh
app="/Applications/MarkWriter.app"
version="2.7.3"
python3 uninstall-markwriter-macos.py --app "$app" --version "$version"
python3 uninstall-markwriter-macos.py --app "$app" --version "$version" --apply
```

The first command is a dry run. Review the version and paths, quit the selected app, and close its Quick Look previews before applying. The tool checks the app and nested extension IDs, versions and seals, deregisters those paths and moves the copy to the reported backup path. The ad hoc seal checks integrity. Establish provenance using the package checksum before installation. The operation leaves documents, preferences and recovery data in place. Keep the backup while you may need to restore it.

Preview a restore by omitting `--apply`. Restore returns the bundle to its original path and registers it again. If an interruption leaves the bundle at the original path with incomplete registration, use `--register --apply` with that same path and version. If an interruption leaves the bundle in the backup, rerun the same removal to check its state or restore it.

```sh
python3 uninstall-markwriter-macos.py --app "$app" --version "$version" --restore --apply
```

### Manual upgrade and rollback

1. Verify the new DMG and stage the new copy. Verify its bundle seal, version and nested extension before switching copies. Save your work, quit the running app and close its Finder previews. Keep the old installer and back up the profile.
2. Use the removal tool with the old version and exact app path. Retain its reported backup. Copy the verified candidate to the vacated path and open it. Check **About**, a saved document, a recovery draft and Finder Quick Look.
3. To roll back, quit the candidate and close previews. Verify it, unregister its exact extension and app paths using `pluginkit -r "$extension"` and `"$lsregister" -u "$app"`, then move that copy to a separate holding path. Run the restore command with the old version and original path. Check launch, documents, recovery and Quick Look again.

Each removal target has a single backup slot. Keep the candidate and old backup at separate paths during rollback. The in-app update check points to the official downloads for manual installation.

## Windows File Explorer

Install the Windows x64 editor with the current-user NSIS installer. For previews, verify the SHA-256 of the separate Explorer ZIP and extract it to a permanent local folder under your user profile. The installer and preview DLL are unsigned. Windows or organization policy may restrict them. Use the downloaded files only if you trust their source and your policy permits them.

If PowerShell uses `RemoteSigned` and blocks the downloaded script, verify the ZIP, review `install.ps1`, and check your policy before using `Unblock-File -LiteralPath .\install.ps1` on that one script. An organization can require a signed component. [Microsoft PowerShell guidance](https://learn.microsoft.com/powershell/module/microsoft.powershell.utility/unblock-file)

From an ordinary PowerShell window in that folder, enable the handler.

```powershell
$dll = Join-Path $PWD 'MarkWriterPreview.dll'
.\install.ps1 -Action Enable -DllPath $dll
```

Open File Explorer, enable the **Preview pane** from **View → Show**, and select a local Markdown file. For a fresh test, create a `.md` file locally. Windows may block previewing files marked as originating from the Internet. [Microsoft Preview pane security](https://support.microsoft.com/en-us/servicing/os/windows/docs/2025/10/file-explorer-automatically-disables-the-preview-feature-for-files-downloaded-from-the-internet)

To remove the editor, use **Settings → Apps → Installed apps → MarkWriter → Uninstall**. Disable the separate Explorer add-on using its own installer.

The handler previews `.md` and `.markdown` with basic headings, bold and inline code. The tested Explorer baseline is Windows Server 2025 x64. Keep the DLL in the folder while enabled. To remove it or replace it with another version, close the Preview pane and run `.\install.ps1 -Action Disable -DllPath $dll` from the original folder first.

## Ubuntu 26.04 x64

Install the editor with `sudo apt install ./MarkWriter-2.7.3-ubuntu-26.04-x64.deb`. Verify the GitHub download against `SHA256SUMS`. The separate preview components use the same checksums. They have no distribution repository signature. To remove the editor package, run `sudo apt remove mark-writer`. Remove each preview component through its own mechanism.

### GNOME Files with Ubuntu Sushi

Install Ubuntu's `gnome-sushi` package. The add-on is qualified with `50.0-0ubuntu0.1` and checks that version at enablement. Use `dpkg-query -W gnome-sushi` to check yours. Verify and extract the Sushi ZIP to a local folder. In the extracted folder, run `sh ./install.sh enable` as your own user. The installer uses your Sushi data directory and refuses to replace existing user viewers. Start a fresh login session to pick up the viewer, select a Markdown file in Files, and press **Space**. To disable it, use the same extracted folder and run `sh ./install.sh disable`, then start a fresh login session. The viewer formats a bounded subset of Markdown and displays document content as text.

### KDE Dolphin with KDE Frameworks 6

Install the separate verified DEB with `sudo apt install ./MarkWriter-2.7.3-ubuntu-26.04-x64-dolphin-preview.deb`. In Dolphin, enable **MarkWriter Markdown** in the preview settings and turn on **Show Previews**. Dolphin displays a rendered thumbnail. The tested baseline is Dolphin 25.12.3 with KF6 KIO 6.24 on Ubuntu 26.04.1 x64. Installation makes the provider available to other KF6 KIO applications, which may use different defaults. To remove the add-on, run `sudo apt remove markwriter-dolphin-preview` and reopen Dolphin.

The Windows and Linux add-ons cover Markdown. The Mac package bundles its Finder Quick Look extension.

## Windows and Ubuntu rollback

Disable a preview component before moving its files or reinstalling an older version. Close MarkWriter, remove the editor through the same platform's install mechanism and reinstall the prior installer. Restore the backed-up profile if needed. Update discovery remains manual.

See the [changelog](https://github.com/rheiger/markWriter/blob/v2.7.3/CHANGELOG.md) for the feature and issue history.
