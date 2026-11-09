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
| `.css` | `public.css`; declared in candidate | Literal source, CSS grammar | Color observed in VM; see record below |
| Other extensions sharing a declared type | Depends on host | Unsupported extension yields escaped literal text; `.cfg` and `.config` are declined | Not claimed |

The Swift fallback escapes document text and applies a 1 MiB UTF-8 input limit. The optional local WebKit enrichment is separate: it requires a language marker or Markdown, has its own size, concurrency and eight-second limits, and returns the Swift fallback on failure ([provider](../native/quicklook/PreviewProvider.swift), [WebKit renderer](../native/quicklook/QuickLookWebRenderer.swift)). YAML fallback does not parse or resolve anchors or aliases. Highlighting is presentation, not syntax validation. A different provider or a fallback without color is not proof of a formatter failure.

| Shell | Registration / format | Renderer and current qualification |
| --- | --- | --- |
| Windows Explorer | Optional per-user handler for `.md` and `.markdown` only ([installer](../native/windows-preview/install.ps1)) | Bounded basic Markdown to inert RTF; no syntax highlighting. Installed Explorer, low-integrity and coexistence qualification is required; see [Windows preview README](../native/windows-preview/README.md). |
| GNOME Sushi 46 | Optional user-local `text/markdown` handler ([source](../native/linux-preview/sushi-46/markwriterMarkdown.js)) | Limited Gtk text rendering, 256 KiB and 4,000 lines; no syntax highlighting. Actual desktop/provider selection is a separate gate. |
| KDE Dolphin | Optional `text/markdown` thumbnail plugin ([metadata](../native/linux-preview/kde/markwriterthumbnail.json)) | Markdown thumbnail, not a general source-file preview; actual Dolphin/plugin selection is a separate gate. |

## Finder candidate observations

On macOS 26.6.2 (25G83), arm64, in a disposable VM, Finder Space selected the bundled `com.markwriter.app.quicklook` provider at `/Applications/MarkWriter.app/Contents/PlugIns/MarkWriterQuickLook.appex` (registration UUID `B52A07C4-4EF4-42F7-BB53-2C2540E59F76`) in the ordinary ad hoc sealed app staged at source head `4835d9de66348a5279590b153134a43d8f79291a`. This is evidence for those candidate bytes, not final release bytes. The isolated tests observed syntax color for `.h`, `.cpp`, `.css` and a fresh `.js` file; `.cpp` and `.css` were tested with the app open, and the fresh `.js` with it closed. A quoted nested block `.yml` and flow/anchor/alias `.yaml` showed literal fallback with color, and a 113,464-byte `.md` fixture showed its final SQL `SELECT 37` styled. Renderer process completion logs matched the test timing but do not identify individual filenames. An invalid UTF-8 YAML sample and a 1,100,016-byte oversized file showed the expected notices with the app closed; an unknown `.mwfixture` showed a generic Finder card. These observations do not establish every suffix or app state in the table.

During a rapid selection sequence, JavaScript and CSS previews appeared plain and the extension logged a `renderer busy` fallback in the same window. The log did not correlate a particular filename to that fallback. A fresh isolated JavaScript preview was colored. This is a bounded fallback, and the observations do not establish that all rapid selections are colored or explain each plain preview.

## Remaining Finder acceptance

Use an isolated test account or VM and the ordinary staged, ad hoc sealed candidate, then a separate coexistence setup with a competing provider. Do not reset global Quick Look services or change an existing user's preferences. Record OS/build/architecture, candidate app and extension paths, versions, hashes and seal verification, plus the registered and selected provider identity/path for each type. Test Finder Space with the app both closed and open. Observe selection separately from MarkWriter's own rendering when another provider wins.

Use synthetic `.h`, `.cpp`, `.js`, `.css`, `.yml`, `.yaml` fixtures with distinctive keywords, a final sentinel, Unicode and escaped `<`, `>` and `&`; include YAML block and flow/anchor/alias forms. Record formatter notice, exact visible content, syntax color and light/dark appearance separately. Include an unknown extension, invalid UTF-8, a file over 1 MiB, selection changes and before/after source hashes. Check actual WebKit enrichment and fallback independently; record timeouts/errors without treating absence of color as proof of provider selection. Repeat after isolated upgrade and rollback, and retain evidence for provider coexistence and the exact candidate bytes. The Swift unit suite and metadata lint are not Finder acceptance.
