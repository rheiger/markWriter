# Large PowerShell previews in Finder

Use an isolated Apple silicon macOS account or VM and the published DMG. Verify its SHA-256 against that release’s `SHA256SUMS`. After mounting it read-only, check the app with `codesign --verify --deep --strict` and the bundled `MarkWriterQuickLook.appex` with `codesign --verify --strict`. Record the macOS version and build, appearance, app version, extension executable hash and registered path. Compare the Launch Services type and default Open With app for `.ps1` before registration, after registration and after cleanup.

Generate synthetic inputs from the repository root in a new directory. The command prints a receipt with sizes, SHA-256 hashes and modification times.

```sh
qa=$(mktemp -d)
python3 native/quicklook/tests/powershell-fixtures.py "$qa/fixtures" > "$qa/before.json"
```

| File | Bytes | Expected Finder result with MarkWriter selected |
| --- | ---: | --- |
| `highlighted.ps1` | 115,920 | PowerShell syntax color through the final `Write-Output "final_sentinel"` line. |
| `long-line.ps1` | 132,309 | A comment exceeds the 16,384-character per-line highlighting limit. The preview shows literal text, including the final `Write-Output "literal_sentinel"` line. |
| `over-file-limit.ps1` | 1,048,611 | Finder shows the provider’s `File exceeds the 1 MiB preview limit.` notice. |

Select each file in Finder and press Space. For the first two cases, scroll to the end of the preview and capture the final line. Record time to the Quick Look window and the displayed result separately. For files admitted to the syntax renderer, record its start/completion events and executable path using the `com.markwriter.app.quicklook` subsystem and `renderer` category. The file-size notice takes a static path. Use the actual preview text and registration evidence for that case. Close each preview before selecting the next file.

Verify the fixtures’ SHA-256 hashes, sizes and modification times. Restore the original provider registration and check editor defaults again.

```sh
python3 native/quicklook/tests/powershell-fixtures.py --inspect "$qa/fixtures" > "$qa/after.json"
cmp "$qa/before.json" "$qa/after.json"
```

## Published v2.18.5 result

Finder Space opened the three fixtures in Dark appearance on an isolated Apple silicon VM running macOS 27.2.1 (26B131), with the editor closed. The published DMG matched SHA-256 `762c26a3afb21cf52f1c862ddb990d90f1d887abc584431c5f5d525e38ca602f`. The staged app and extension passed strict ad-hoc seal checks. The selected `com.markwriter.app.quicklook` executable matched SHA-256 `62524d11f67922c09444888dc9551f0952055e6497da570a36d8ef7b6b3aa415`. [Published package](https://github.com/rheiger/markWriter/releases/tag/v2.18.5)

| File | Space to Quick Look window | Runtime and visible evidence |
| --- | ---: | --- |
| `highlighted.ps1` | 978 ms | The staged provider completed its first local rendering pass in 362 ms. The last line showed a blue command and a green sentinel. |
| `long-line.ps1` | 969 ms | The same provider completed its first local rendering pass in 295 ms. The entire last line appeared in plain white text. |
| `over-file-limit.ps1` | 662 ms | The static 1 MiB limit notice appeared in an earlier capture. It uses the path that skips syntax enrichment. |

The window times come from one run per case. Final-line captures completed about 4.1 seconds after Space, including scripted settling and scrolling. All three inputs retained their original hashes, sizes and modification times.

Before registration, Launch Services resolved the fixture suffix to a dynamic type without a default app. With the release registered, the type was `com.microsoft.powershell-script` and Finder offered TextEdit. After cleanup, the original provider registration, `.ps1` type and default-app result were restored.
