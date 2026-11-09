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

Reopen Quick Look on a fresh file. Finder selection was tested on Apple silicon macOS 27.2 with `.md`, `.markdown`, `.json`, `.ndjson`, `.yaml`, `.yml` and `.xml`. The bundle also handles `.jsonl` through the same record formatter as `.ndjson`. Select a `.toml` file to preview highlighted literal source. This adds no Open With association. macOS can choose another installed provider. Some tools declare additional extensions for the same TOML content type; MarkWriter highlights standalone source only for the `.toml` suffix. Legacy MarkWrite may still appear in Finder's **Open with** button, which controls the editor association.

Markdown previews render tables, emphasis, inline code, inert link labels, and supported Mermaid and DOT diagrams. Finder can highlight supported code fences, including explicit TOML, and standalone Bash, Python, SQL and Makefile source. XML outside the formatting subset can still receive syntax colors. Unsupported diagram source remains readable. YAML formatting covers a subset of block maps and lists. The extension uses a disposable WebKit view and blocks remote document resources. Its App Sandbox client entitlement allows WebKit to start and grants outgoing capability at the process level. [Apple App Sandbox entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.network.client) · [WebKit content blocking](https://webkit.org/blog/3476/content-blockers-first-look/)

To remove the manual registration before moving this copy to Trash or restoring a previous app, use the same `app`, `extension`, and `lsregister` values:

```sh
pluginkit -r "$extension"
"$lsregister" -u "$app"
```

## Windows File Explorer

Install the Windows x64 editor with the current-user NSIS installer. For previews, verify the SHA-256 of the separate Explorer ZIP and extract it to a permanent local folder under your user profile. The installer and preview DLL are unsigned. Windows or organization policy may restrict them. Use the downloaded files only if you trust their source and your policy permits them.

If PowerShell uses `RemoteSigned` and blocks the downloaded script, verify the ZIP, review `install.ps1`, and check your policy before using `Unblock-File -LiteralPath .\install.ps1` on that one script. An organization can require a signed component. [Microsoft PowerShell guidance](https://learn.microsoft.com/powershell/module/microsoft.powershell.utility/unblock-file)

From an ordinary PowerShell window in that folder, enable the handler.

```powershell
$dll = Join-Path $PWD 'MarkWriterPreview.dll'
.\install.ps1 -Action Enable -DllPath $dll
```

Open File Explorer, enable the **Preview pane** from **View → Show**, and select a local Markdown file. For a fresh test, create a `.md` file locally. Windows may block previewing files marked as originating from the Internet. [Microsoft Preview pane security](https://support.microsoft.com/en-us/servicing/os/windows/docs/2025/10/file-explorer-automatically-disables-the-preview-feature-for-files-downloaded-from-the-internet)

The handler previews `.md` and `.markdown` with basic headings, bold and inline code. The tested Explorer baseline is Windows Server 2025 x64. Keep the DLL in the folder while enabled. To remove it or replace it with another version, close the Preview pane and run `.\install.ps1 -Action Disable -DllPath $dll` from the original folder first.

## Ubuntu 26.04 x64

Install the editor with `sudo apt install ./MarkWriter-2.7.3-ubuntu-26.04-x64.deb`. Verify the GitHub download against `SHA256SUMS`. The separate preview components use the same checksums. They have no distribution repository signature.

### GNOME Files with Ubuntu Sushi

Install Ubuntu's `gnome-sushi` package. The add-on is qualified with `50.0-0ubuntu0.1` and checks that version at enablement. Use `dpkg-query -W gnome-sushi` to check yours. Verify and extract the Sushi ZIP to a local folder. In the extracted folder, run `sh ./install.sh enable` as your own user. The installer uses your Sushi data directory and refuses to replace existing user viewers. Start a fresh login session to pick up the viewer, select a Markdown file in Files, and press **Space**. To disable it, use the same extracted folder and run `sh ./install.sh disable`, then start a fresh login session. The viewer formats a bounded subset of Markdown and displays document content as text.

### KDE Dolphin with KDE Frameworks 6

Install the separate verified DEB with `sudo apt install ./MarkWriter-2.7.3-ubuntu-26.04-x64-dolphin-preview.deb`. In Dolphin, enable **MarkWriter Markdown** in the preview settings and turn on **Show Previews**. Dolphin displays a rendered thumbnail. The tested baseline is Dolphin 25.12.3 with KF6 KIO 6.24 on Ubuntu 26.04.1 x64. Installation makes the provider available to other KF6 KIO applications, which may use different defaults. To remove the add-on, run `sudo apt remove markwriter-dolphin-preview` and reopen Dolphin.

The Windows and Linux add-ons cover Markdown. On Linux, the installed desktop checks used `.md` fixtures and isolated X11 sessions. The Mac package carries forward its broader Quick Look formats and rich Markdown rendering.

## Rollback

Disable a preview component before moving its files or reinstalling an older version. Close MarkWriter, remove the editor through the same platform's install mechanism and reinstall the prior installer. Restore the backed-up profile if needed. Update discovery remains manual.

See the [changelog](../CHANGELOG.md) for the feature and issue history.
