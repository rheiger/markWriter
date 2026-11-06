# MarkWriter 2.5.0-alpha1 technical writing

## Released scope

This increment implements #46 inline-code whitespace fidelity, #50 explicitly fenced offline mathematics and #47 bundled searchable Help. The public experimental prerelease is qualified; see [final acceptance](technical-writing-2.5-release-acceptance.md) and attached QUALIFICATION.json. Existing alpha3 is complete; its evidence is historical.

Markdown remains canonical. View changes, themes, Help and source navigation preserve the original bytes. Real WYSIWYG edits use Markdown serialization: meaningful code spaces/tabs are preserved, while surrounding prose, delimiter choice and final line endings can normalize. Raw-source Undo preserves exact bytes; rendered Undo restores the document model and meaningful content. No broader lexical rendered-edit guarantee is claimed.

## Inline code

Turndown preformattedCode plus a narrowly scoped inline serializer preserve repeated/edge/all-space content, tabs and CommonMark code-span newline normalization. Whitespace-only code survives enclosing headings/lists/quotes/tables; GFM table pipes preserve literal preceding backslashes. The editor parser protects inline-code text in a detached DOM, restores it before insertion, and uses a clipboard-only adapter so live DOM selection/IME reconciliation retains native node identities. Ordinary prose whitespace policy is retained. Adversarial marker joins, every Unicode private-use code point and long whitespace runs are regression fixtures. Extremely pathological documents combining every PUA character repeatedly with many code nodes can still expand temporary parsing data.

## Math

Use Insert → Math block or exact lowercase `math` fences. No dollar interception, automatic language detection, numbering/references or arbitrary TeX packages are provided. Unknown/other fences retain normal code handling. Math is an opaque source-bearing node in WYSIWYG. Edit math source opens a literal textarea; typing edits the document immediately, participates in document Undo/Redo and recovery, and Done/Escape only closes the field. Save works while the field owns focus. Source fields preserve intentional Unicode/composition and reject automatic replacement input.

KaTeX 0.19.1 is an explicit pinned dependency. A fresh cancellable worker and macro object serve each block. Limits are16 KiB UTF-8 source/block,1 MiB output/block,64 blocks / 256 KiB source/4 MiB output per document generation,512 expansions,50 em explicit sizes,5 s startup / 2 s rendering bounded by a 15 s generation deadline. Only local scripts are allowed in math workers; no WASM or network capability is granted. Output is validated against a constrained HTML/MathML/SVG/style allowlist. Trust-bearing resource/HTML commands, numbering/reference commands and invalid/oversized inputs fail to readable source.

Preview keeps block-level correspondence and folds without pretending TeX symbols map exactly to source characters. WYSIWYG/Preview inherit rendered text settings; overflowing expressions scroll inside their block. Copy exact TeX from the source field or Markdown view. KaTeX includes MathML for accessibility. HTML exports include static math,20 unmodified WOFF2 fonts and their OFL notices, with no CDN/runtime script. Invalid math exports as escaped source while retaining surrounding work; all math rendering in one export has a 10 s deadline. App fonts remain local files under the existing CSP.

Upstream design sources: https://katex.org/docs/options , https://katex.org/docs/security , https://katex.org/docs/font and https://vite.dev/guide/assets.html . The font name tables declare OFL 1.1; the KaTeX library is MIT. Complete notices are bundled and font copyright/license text accompanies exported fonts.

## Help and scope

Help → User Guide provides searchable, navigable offline getting-started, editing/fence, recovery/font, navigation and actual-shortcut references. Its modal supports focused scrolling, Tab/ShiftTab, Escape and return focus; About and the exact Richie credit/artwork remain intact. It makes no PDF/Quick Look/standalone-parser claims.

Java/Perl/AWK/sed/CMake and broader autodetection #44 remain deferred unless separately qualified later. OS associations/previews #48/#49, PDF#41, DBML#33/DDL#42, PlantUML/draw.io, independent windows/plugins and other unrelated work are not implemented here.

## Qualification checkpoint

Local 315 frontend tests,10 Node checks,21 macOS Rust tests, lint/typecheck, production build and all 20 font-byte checks pass at the initial integrated checkpoint. New native journeys cover both editors, code/math preservation, malformed/adversarial/document budgets, offline fonts, static exports, Help themes/minimum size/keyboard, actual save/reopen/Undo and recovery. Final exact merged/tag native/package and public integrity results are recorded in the final release acceptance and attached qualification.
