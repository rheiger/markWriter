# MarkWriter 2.6.3 shell previews

The Windows and Linux portions of #48 and #49 advance independently through [#63](https://github.com/rheiger/markWriter/issues/63) and [#64](https://github.com/rheiger/markWriter/issues/64). Use 2.6.3 as a preliminary GitHub release with `latest=false`. The macOS package carries forward the Finder extension from 2.6.2.

## Implementation and gates

1. **Windows x64.** Build a native COM preview handler around `IPreviewHandler` and `IInitializeWithStream`. Qualify selection in the actual Explorer Preview pane and verify low-integrity hosting, bounded reads, rapid selection and unload. Test current-user registration with ordinary privileges, existing handlers, removal and rollback. Keep the editor association independent. [Microsoft preview handler architecture](https://learn.microsoft.com/en-us/windows/win32/shell/preview-handlers) · [Registration](https://learn.microsoft.com/en-us/windows/win32/shell/how-to-register-a-preview-handler)
2. **GNOME.** Verify the Sushi renderer API and MIME lookup on the installed distribution. Package the compatible renderer for opt-in installation and test Nautilus Space in a desktop session using the installed asset. [Sushi upstream](https://github.com/GNOME/sushi)
3. **KDE.** Build a KF6 KIO thumbnail provider against the named distribution. Test selection and rendering in Dolphin with the plugin enabled and again after removal. Describe the thumbnail interaction separately from Sushi's Space preview. [KDE thumbnail worker](https://docs.kde.org/stable_kf6/en/kio-extras/kioworker6/thumbnail/index.html)
4. **Content and ownership.** Start with .md and .markdown. Keep previews read-only, offline and bounded. Check unsupported, oversized, malformed and Unicode inputs. Compare file hashes and timestamps and verify the editor remains independent. Qualify any additional MIME types individually. Document supported formatting and source fallbacks.
5. **Installed packaging.** Deliver separately enabled preview components so the ordinary editor remains usable without desktop plugins or COM registration. Test the exact release component bytes. Include package checksums and platform-specific enablement, removal and signing status. Preserve file defaults, installed apps and profiles. A blocked registration or unsupported desktop ABI is a failed platform gate.
6. **Integration and publication.** Use fresh independent review, exact-source native and package checks, and actual Explorer, Nautilus, Dolphin and Finder evidence. Seal and test the macOS app locally with ad hoc signatures if needed. Publish from the reviewed merged tree only when the requested shell gates pass. Verify all public assets and preserve historical release metadata. Keep umbrella issues qualified and open.

## Execution ownership

Windows owns `native/windows-preview/`. Linux owns `native/linux-preview/`. The orchestrator owns workflows, packaging, release metadata, docs and integrated validation. All builds use an isolated external checkout or disposable CI runners. Preserve the user's working tree, profiles and installed apps.
