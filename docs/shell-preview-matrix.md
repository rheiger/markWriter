# Shell preview format and registration matrix

This matrix distinguishes source inventory from observed shell selection. Finder's extension declares preview types in [Info.plist](../native/quicklook/Info.plist); it does not change default editors. The provider dispatches by file extension or exact filename in [PreviewRenderer.swift](../native/quicklook/PreviewRenderer.swift). Type resolution and the selected provider depend on the host and other installed applications. A declared type does not guarantee that Finder selects this provider, and a dispatched grammar does not guarantee colored output.

The type observations below were made with `UTType(filenameExtension:)` on macOS 27.2 (26B123), arm64. They describe that host, not all macOS installations. The registrations shown include the 2.7.3 candidate change. The historical VM observations below cover only the specified cases; final release bytes and the remaining combinations require separate qualification.

| Filename or extension | Observed type; Finder registration | MarkWriter Finder renderer if selected | Installed candidate result |
| --- | --- | --- | --- |
| `.md`, `.markdown` | `net.daringfireball.markdown`; declared | Markdown fallback; optional bundled Markdown enrichment | `.md` observed in VM; `.markdown` pending |
| `.mdown`, `.mkd` | Dynamic types on this host; no matching declared Markdown conformance observed | Markdown if explicitly dispatched | Registration/selection pending; not claimed |
| `.json` | `public.json`; declared | Bounded JSON formatting; invalid/over-limit literal | Pending |
| `.jsonl`, `.ndjson` | `com.markwriter.json-lines`, `public.ndjson`; declared | Per-record JSON formatting; literal errors/limits | Pending |
| `.xml` | `public.xml`; declared | Limited element-only formatting, otherwise literal XML | Pending |
| `.yml`, `.yaml` | `public.yaml`; declared | Limited block formatting, otherwise escaped literal YAML; both request YAML highlighting | Literal fallback color observed for both in VM |
| `.sh`, `.bash` | `public.shell-script`, `public.bash-script` respectively; shell type declared, bash conforms on this host | Literal source, Bash grammar | Pending |
| `.py`, `.sql`, `.toml` | `public.python-script`, `org.iso.sql`, `public.toml`; declared | Literal source, Python / SQL / TOML grammar | Pending |
| `.mk`, `.mak` | `public.make-source`; declared | Literal source, Makefile grammar | Pending |
| `Makefile`, `GNUmakefile` | Extensionless; host association not established | Exact case-insensitive filename dispatch to Makefile grammar | Registration/selection pending; not claimed |
| `.h` | `public.c-header`; declared in candidate | Literal source, C grammar. Headers are ambiguous and are not inferred as C++ | Color observed in VM; see record below |
| `.cpp` | `public.c-plus-plus-source`; declared in candidate | Literal source, C++ grammar | Color observed in VM; see record below |
| `.js` | `com.netscape.javascript-source`; declared in candidate | Literal source, JavaScript grammar | Color observed in VM; see record below |
| `.mjs` | `com.netscape.javascript-source` on macOS 27.2.1 (26B131), arm64; shared with `.js` | Literal source, JavaScript grammar | Syntax color in Finder Space on macOS 27.2.1 |
| `.tsx` | `com.microsoft.typescript` on macOS 27.2.1 (26B131), arm64; preview extension only | Literal source, TypeScript grammar | Syntax color in Finder Space on macOS 27.2.1 |
| `.ts` | `public.mpeg-2-transport-stream` on macOS 27.2.1 (26B131), arm64; movie type omitted | Declined before reading even if another type declaration routes it here | macOS movie preview and existing Open With handler preserved |
| `.css` | `public.css`; declared in candidate | Literal source, CSS grammar | Color observed in VM; see record below |
| Other extensions sharing a declared type | Depends on host | Unsupported extension yields escaped literal text; `.cfg` and `.config` are declined | Not claimed |

The Swift fallback escapes document text and applies a 1 MiB UTF-8 input limit. The optional local WebKit enrichment is separate: it requires a language marker or Markdown, has its own size, concurrency and eight-second limits, and returns the Swift fallback on failure ([provider](../native/quicklook/PreviewProvider.swift), [WebKit renderer](../native/quicklook/QuickLookWebRenderer.swift)). YAML fallback does not parse or resolve anchors or aliases. Highlighting is presentation, not syntax validation. A different provider or a fallback without color is not proof of a formatter failure.

| Shell | Registration / format | Renderer and current qualification |
| --- | --- | --- |
| Windows Explorer | The Windows x64 installer registers a machine preview handler for \`.md\` and \`.markdown\`. Explorer selects the effective provider. | Bounded basic Markdown to inert RTF. See [Windows installation and rollback](install-2.7.5.md) and the [preview README](../native/windows-preview/README.md). |
| Ubuntu GNOME Sushi `50.0-0ubuntu0.1` | Optional user-local `text/markdown` handler ([source](../native/linux-preview/sushi-46/markwriterMarkdown.js)); enablement checks this package version | Limited Gtk text rendering, 256 KiB and 4,000 lines; no syntax highlighting. The extracted component was exercised in Nautilus on an isolated X11 session at this baseline; broader desktop/provider selection remains a separate gate. |
| KDE Dolphin | Optional `text/markdown` thumbnail plugin ([metadata](../native/linux-preview/kde/markwriterthumbnail.json)) | Markdown thumbnail, not a general source-file preview; actual Dolphin/plugin selection is a separate gate. |

## Finder candidate observations

On macOS 26.6.2 (25G83), arm64, in a disposable VM, Finder Space selected the bundled `com.markwriter.app.quicklook` provider at `/Applications/MarkWriter.app/Contents/PlugIns/MarkWriterQuickLook.appex` (registration UUID `B52A07C4-4EF4-42F7-BB53-2C2540E59F76`) in the ordinary ad hoc sealed app staged at source head `4835d9de66348a5279590b153134a43d8f79291a`. Finder displayed syntax color for `.h`, `.cpp`, `.css` and a fresh `.js` file. The `.cpp` and `.css` tests ran with the app open, and the fresh `.js` test ran with it closed. A quoted nested block `.yml` and flow/anchor/alias `.yaml` showed colored literal text. A 113,464-byte `.md` fixture showed its final SQL `SELECT 37` styled. Renderer process completion logs matched the test timing and omit filenames. An invalid UTF-8 YAML sample and a 1,100,016-byte file showed the expected notices with the app closed. Finder showed a generic card for an unknown `.mwfixture`.

During rapid selection, JavaScript and CSS previews appeared plain and the extension logged a `renderer busy` fallback. The log omits the filename for that event. A fresh isolated JavaScript preview showed colors.

After upgrading to the sealed app at source head `c902f0f8a7fb40327a3150ea52447cbed39b19b5`, Finder selected a separately sealed test provider cloned from v2.7.2 with a distinct ID and a narrow `public.yaml` registration. The selected process ran from the test bundle and showed plain literal YAML. After exact-path removal of that test provider, the candidate stayed registered and showed the same YAML with syntax colors in light and dark appearances. A simple block/list sample took the formatted route with colors in dark appearance. After restoring v2.7.2 at the original path, Finder again showed plain literal YAML. The input fixture checksums matched throughout.

## Finder TSX and JavaScript modules

On macOS 27.2.1 (26B131), arm64, XCTest exercised Finder Space on synthetic files from an isolated test folder. The installed test DMG used the published 2.8.2 editor host and the rebuilt 2.9.1 Quick Look extension. The app and extension passed strict ad hoc seal checks after extraction. The editor's Mach-O code section matched the published app. The extension was built from the #90 runtime changes against main at `27c661fab45cb6e3efcfa310a86db91adef00ad9`. The test DMG SHA-256 was `46de8ca6a8062af3997db8bd56717208b2ae3ee0b65fa84ef010c592da7e4c14`, and the extension executable SHA-256 was `a8b92f0382b0af10ef2f0ee284e6969991425ce06322231f1a54264ffa4cb450`.

Finder showed TypeScript and JavaScript syntax color for `.tsx` and `.mjs` in Light and Dark, with literal markup, Unicode and a unique final comment visible. The Dark checks passed with the editor both open and closed. Renderer completion events came from the installed `com.markwriter.app.quicklook` extension executable under the isolated app path. Rapid selection ended on the correct third file. Invalid UTF-8 and a 1,140,000-byte file displayed the expected notices. Finder showed its generic card for the unknown suffix. Dark appearance was restored.

The competing fixture extension served `.tsx` while MarkWriter served `.mjs`; each reply matched the exact executable path in the logs. The competing provider also served `.tsx` after the candidate was removed. Same-path replacement of the published 2.8.2 app with the candidate enabled both highlighted previews. Rolling back to 2.8.2 restored plain `.tsx` and the literal-text notice for `.mjs`. Both test extensions were unregistered during cleanup. All 25 fixture checksums matched.

The default Open With application stayed the same for `.tsx`, `.mjs` and `.ts` through registration, coexistence, replacement, rollback and removal. Finder kept macOS movie preview for a synthetic MPEG transport stream. `.tsx` coverage is established on this host, where LaunchServices already declares `com.microsoft.typescript`. Hosts with a different type mapping and the final PI package remain to be qualified.

## Remaining Finder acceptance

Use an isolated test account or VM and the ordinary staged, ad hoc sealed candidate, then a separate coexistence setup with a competing provider. Do not reset global Quick Look services or change an existing user's preferences. Record OS/build/architecture, candidate app and extension paths, versions, hashes and seal verification, plus the registered and selected provider identity/path for each type. Test Finder Space with the app both closed and open. Observe selection separately from MarkWriter's own rendering when another provider wins.

Use synthetic `.h`, `.cpp`, `.js`, `.css`, `.yml`, `.yaml` fixtures with distinctive keywords, a final sentinel, Unicode and escaped `<`, `>` and `&`; include YAML block and flow/anchor/alias forms. Record formatter notice, exact visible content, syntax color and light/dark appearance separately. Include an unknown extension, invalid UTF-8, a file over 1 MiB, selection changes and before/after source hashes. Check actual WebKit enrichment and fallback independently; record timeouts/errors without treating absence of color as proof of provider selection. Repeat after isolated upgrade and rollback, and retain evidence for provider coexistence and the exact candidate bytes. The Swift unit suite and metadata lint are not Finder acceptance.

## PI 2.13 Finder qualification

Finder Space was exercised on an isolated UTM VM running macOS 27.2.1 (26B131), arm64. The staged QA DMG combines the host from the integrated [#119 packaging run](https://github.com/rheiger/markWriter/actions/runs/45386138603) with the Quick Look extension rebuilt from the same source tree, `5413349980258e4978ef19130157ce76bdff7a25`. Both the app and extension passed strict ad hoc seal verification. The app's Mach-O text section matched the hosted artifact. The QA DMG SHA-256 was `9db526b978238093990da1157ef9ae00d917944da0a2ebdb02f96f14103bd370`. The test bundle reports 2.12.2. Qualification of the final 2.13 release bytes is separate. [#115](https://github.com/rheiger/markWriter/issues/115)

| Fixture | Observed in the floating Finder Quick Look window |
| --- | --- |
| Compact JSON | Indented nested object, syntax colors, and final Unicode value with literal angle brackets and ampersand |
| JSONL and NDJSON | Separate records, an invalid second-record notice, and a colored final valid record |
| Element-only XML | Indented elements, formatter notice, syntax colors, and final value |
| Mixed-content XML | Colored literal source with the fallback notice, final value, and literal entity spelling |
| Block YAML and YML | Formatted mapping and list, syntax colors, and final value |
| Flow YAML and YML with anchors and aliases | Colored literal source, fallback notice, preserved anchors and aliases, and final value |
| Markdown | Rendered heading and table with the final value |
| JSON over 1 MiB | Preview limit notice |

Light appearance covered all eleven fixtures with MarkWriter closed. Dark appearance covered compact JSON, NDJSON, mixed-content XML, and both formatted and literal YAML cases for each YAML suffix while the staged MarkWriter process ran with an isolated profile. Renderer completion logs identified the exact staged extension executable for the rendered cases. The oversized file showed the native limit notice.

With the separate YAML-only competitor registered, Finder selected the MarkWriter QA extension for fresh block YAML and flow YML fixtures. Both effective editor lists matched. The supplemental competitor-only checks continued to report the baseline MarkWriter executable after its test registration was removed. Selection of the competing provider itself remains unverified on this VM.

The published v2.12.2 baseline was restored at the same path and passed strict verification. Its restored extension hash matched the original. Finder then rendered fresh compact JSON and Markdown fixtures through that baseline. After cleanup, the two test registrations were absent and the original Light appearance and effective editor list were restored. All eleven original fixtures kept their SHA-256 digests, byte sizes, and nanosecond modification times.

## Extended format registration and hosted probe

The extension declares Apple's narrow `com.apple.xml-property-list` preview type. Apple defines it as conforming to both XML and property list. The bundle leaves the generic property-list and binary-property-list types to the operating system and existing providers. It adds no Open With associations for these formats. The [Apple Quick Look extension documentation](https://developer.apple.com/documentation/quicklookui/) describes type-based selection, and the [XML property-list identifier](https://developer.apple.com/documentation/uniformtypeidentifiers/uttype-swift.struct/xmlpropertylist) describes this specific declaration.

| Fixture | Renderer dispatch if selected | Preview registration and Finder evidence |
| --- | --- | --- |
| XML `.plist` | Escaped XML with syntax highlighting | Apple XML property-list type declared. Finder selection depends on the item's resolved type. Interactive candidate result pending. |
| Binary `.plist` | Unsupported format notice if routed to MarkWriter | No explicit binary or generic plist registration. |
| `Dockerfile`, `.dockerignore`, `.gitignore` | Exact-name matches | No exact-name registration established. |
| `.ps1`, `.bat` | PowerShell and batch syntax respectively | No matching declared type established. |
| `.jsonb` | Valid JSON text only | No specific type declared. PostgreSQL binary JSON is outside the text renderer's support. |
| `uv.lock`, `flake.lock` | Known TOML and JSON variants respectively | No generic lock-file registration. |
| Other `.lock` files, `.spec` | Literal fallback | No registration specific to these formats. |

The production macOS package job captures resolved content types, all extension-tag types and effective Open With defaults for synthetic files before and after registering the exact installed app. It reports which of the extension's declared types match the observed content type and captures the exact installed extension path from PlugInKit. The check preserves existing source-file defaults, rejects any new source-file default for MarkWriter, verifies the ambiguous `.ts` type remains stable and compares the fixture bytes. The raw files `quicklook-types-before.json`, `quicklook-types-after.json` and `quicklook-plugins.txt` are retained with installed-app evidence.

A matching declaration and a registered extension establish hosted eligibility. A desktop pass must open the fixture with Finder Space, identify the rendering extension executable, and compare rendered content and source hashes. Run the desktop checks on the published DMG bytes in an isolated Apple silicon session, including app-open and app-closed, coexistence, fresh install, same-path upgrade, removal and rollback. The existing Windows, Sushi and Dolphin Markdown scope is listed above.
