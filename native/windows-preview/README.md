# Windows Explorer preview

The Windows x64 installer bundles this read-only handler for `.md` and `.markdown`. The installer build uses `-DMARKWRITER_BUNDLED=ON` and registers the machine preview class for low-integrity Prevhost. See the current [installation guide](../../docs/install-2.7.4.md).

On x64 Windows with Visual Studio C++ and CMake:

```powershell
cmake -S native/windows-preview -B <build-dir> -A x64
cmake --build <build-dir> --config Release
ctest --test-dir <build-dir> -C Release --output-on-failure
```

For regression testing the legacy standalone class in a disposable, non-elevated user session, `install.ps1 -Action Enable -DllPath <absolute-path-to-MarkWriterPreview.dll>` opts in. `install.ps1 -Action Disable -DllPath <same-absolute-path>` removes its associations and class if still owned. The DLL must remain at that path while enabled. Any existing per-user extension preview key, preview class, or matching preview-list entry causes enable to fail; re-enable requires disable first. A machine-registered class with the same CLSID is also rejected; machine-level extension providers remain intact but may be shadowed while enabled, depending on Explorer association resolution. Disable removes only unchanged owned values and retains third-party additions. Default application associations are not touched. Do not remove or move the DLL before disabling. Registration uses HKCU and the default x64 Prevhost AppID; it never disables low-integrity isolation. Windows may reject per-user COM registrations in a low-integrity host: this must be tested rather than assumed.

The renderer reads at most 1 MiB plus one byte from the supplied stream, decodes UTF-8 with replacement, displays a truncation notice, and treats HTML and links as text. It supports basic headings, bold, and inline-code emphasis only; diagrams, images, syntax highlighting, full CommonMark and active content are not supported. Rich Edit displays inert generated RTF, not source HTML. The source stream is only read.

Qualification must exercise an actual File Explorer preview pane with the app closed and open, `.md` and `.markdown`, Unicode names/content, malformed UTF-8, oversized content, selection changes, resizing/unloading, source hash and timestamp preservation, and inert links/HTML. Verify Prevhost architecture, process integrity, and loaded DLL independently. Test a competing handler and a change made by another application after enable; verify disable preserves it and does not alter the default editor. Test package upgrade, uninstall, rollback and low-integrity access to the actual installed location. Do not treat unit tests or a direct COM activation as Explorer acceptance.

References: [Preview handler architecture](https://learn.microsoft.com/en-us/windows/win32/shell/preview-handlers), [registration](https://learn.microsoft.com/en-us/windows/win32/shell/how-to-register-a-preview-handler).

A disposable Windows runner can run the registration-only check at medium integrity after `tools/setup-windows-acceptance.ps1` using `& $env:MARKWRITER_GSUDO --integrity Medium pwsh -NoProfile -File native/windows-preview/registration-test.ps1 -DllPath <absolute-dll-path>`. This check is not Explorer acceptance. The test refuses pre-existing user preview keys or this CLSID and simulates a provider change.

Experimental Explorer test interface (run after setup at medium integrity with an interactive desktop): `& $env:MARKWRITER_GSUDO --integrity Medium pwsh -NoProfile -File native/windows-preview/explorer-acceptance.ps1 -DllPath <absolute-dll-path> -AppPath <installed-markwriter-exe> -ResultPath <absolute-json-path> -ExpectedSha256 <packaged-dll-sha256>`. It requires a clean disposable user profile. It drives Explorer and requires UI Automation text plus a loaded DLL in low-integrity Prevhost; its JSON is written only after successful checks and cleanup. This script itself has not yet been exercised on Windows; it covers only the cases recorded in the result and is not a substitute for the remaining qualification above.
