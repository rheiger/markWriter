# Install MarkWriter 2.6.2 preliminary

Download the package for your system and verify its SHA-256 against `SHA256SUMS`. Keep the previous installer and a backup of your MarkWriter profile if you are upgrading.

## macOS on Apple silicon

Mount `MarkWriter-2.6.2-macos-arm64.dmg`, copy `MarkWriter.app` to Applications, eject the image, and open the copied app once. The app and Quick Look extension have ad hoc integrity signatures. The preliminary package has no Developer ID or Apple notarization. macOS may restrict launch of a downloaded copy. Review Apple's app safety guidance and your organization's policy before making a per-app exception. [Apple app safety guidance](https://support.apple.com/en-us/102445)

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

Reopen Quick Look on a fresh file. macOS can choose another installed provider. Legacy MarkWrite may still appear in Finder's **Open with** button, which concerns the editor association. Keep it installed if you use it.

To remove the manual registration before moving this copy to Trash or restoring a previous app, use the same `app`, `extension`, and `lsregister` values:

```sh
pluginkit -r "$extension"
"$lsregister" -u "$app"
```

## Windows and Linux

On Windows x64, run the current-user NSIS installer. It is unsigned. Use the artifact from this release and check the SHA-256 before running it. On Ubuntu 26.04 x64, install the DEB with `sudo apt install ./MarkWriter-2.6.2-ubuntu-26.04-x64.deb`. Finder integration is macOS-specific.

To roll back, close MarkWriter, remove the preliminary app through the same platform's install mechanism, and reinstall the prior installer. Restore the backed-up profile if needed. Update discovery is manual and does not install packages.
