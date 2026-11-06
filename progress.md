# Progress

## 2026-11-05
- Created active goal and inspected editor/store/test boundaries.
- Archived all pre-existing modified/untracked files outside the repository.
- Created codex/editor-stabilization and checkpointed existing code/docs; sample and test-result files remain untouched.
- Next: replace obsolete editor tests with real editor integration coverage and prove fidelity defects.

- Replaced parser/editor mocks with real implementations; first 10 frontend tests pass.
- Extracted shared Markdown conversion, preserved empty Mermaid atoms, escaped source, retained table inline formatting/pipes, and mapped task nodes explicitly.
- Removed duplicate preview diagram rendering; Markdown parser handles fenced blocks; stale preview completions are ignored.
- cargo check passes. Added missing tempfile dev dependency to enable existing Rust tests.
- Added save-race and image-fidelity tests before addressing those failures.

- Added save-race regression coverage and fixed stale Save As/dirty-state updates.
- Added image schema support after a real-editor regression proved images were dropped during surrounding edits.
- Unified HTML export with Preview and rendered Mermaid to inline SVG; removed production regex Markdown renderer.
- Native writes use a same-directory temporary file and replace after flush; New/Open/Quit/window close protect unsaved content.
- Repaired existing Rust test prerequisites and incorrect word-count expectation (input has eight whitespace-delimited tokens).
- Native app compiled/launched; dialog automation timeout prevents full native workflow acceptance.
- Review in progress; clean-install validation and final documentation remain.

- Review found and fixed cross-document undo contamination; added passing regression.
- Final checks: 26 frontend tests, production frontend build, 14 Rust tests, clean npm install, and rebuilt macOS app bundle pass. Browser actual UI cycle verification is clean.
- Remaining acceptance gates are explicit in QUICK_STATUS.md and docs/stabilization-2026-11-05.md.

- Local commits: 7ebfd6a preserves pre-existing editor code; f5b11fd stabilizes mode/document conversion; 11dd31b protects saves and unifies export. No remote push.
- Native UI acceptance and release qualification remain open; broad goal is intentionally not marked complete.

## Continuation: native acceptance and expanded fidelity
- Native macOS Open, five mode cycles, Save As byte comparison, WYSIWYG editing, Save, HTML export and reopening passed through actual UI.
- New/Quit/native Cmd-W prompts showed unsaved warnings; Keep editing retained text, and a subsequent Save succeeded.
- Exported file contains one table, one SVG, two checkboxes and no script.
- Expanded real-editor suite now has 29 passing tests; added table alignment preservation using installed TextAlign extension.
- ESLint baseline restored; auditing exhaustive hook dependencies before enabling the gate.

- Dependency remediation: coherent Tiptap update, modern Markdown/Mermaid/lowlight, Vite/Vitest and TypeScript ESLint; removed unused router. Two scoped overrides passed direct compatibility checks.
- Ordinary npm ci, 29 tests, lint, build and zero-advisory audit pass. Actual upgraded browser renders flowchart/sequence/state diagrams and exports three SVGs with table alignment preserved and no console issues.
- Rebuilding the native bundle with upgraded assets before finalizing this increment.

- Upgraded native bundle rebuilt successfully. Actual browser rendering/export with three diagram types and aligned table passed without console issues.
- Added a pinned prebuilt Tauri CLI dev dependency for reproducible CI builds; package audit remains a required gate.

- Committed dependency remediation as 8a91148 and v2 CI as 2ccbf9b.
- Pushed only codex/editor-stabilization to GitHub to execute qualification. Run 42083988171 is live at 2ccbf9b; watching it to completion. No merge or release.

- CI run 42083988171 completed: frontend, Linux native and macOS native succeeded; Windows compilation failed on missing icons/icon.ico.
- Generated/tracked ICO from existing PNG (21a257a), added real-sample round-trip and native error regression, and preserved Tauri string errors (fbd2910). Local suite: 31 tests pass; lint/build pass.
- Pushed fbd2910; qualification rerun 42085196968 is live. Watching with exec process handle 59524; do not treat earlier failure as the current result.
- Exact upgraded macOS bundle was reopened and exercised with three Mermaid types, editing/save and actual native HTML export. File inspection confirms three SVGs, one aligned table, two checkboxes and no scripts.

- Completion audit found Markdown table insertion and task/strike controls were no-ops, and WYSIWYG plain-text multiline paste lost line breaks. Fixed, including mixed completed tasks; 37 tests, lint/build and real browser toolbar/menu checks pass. Clipboard read was stubbed only in the browser test.
- Run 42086481685 passed frontend/macOS. Windows diagnostics identify comctl32 v5 missing TaskDialogIndirect. Build script now embeds the same Controls v6 dependency in all MSVC executables, including the library test harness (2397fba). Run 42087625830 is pending; do not infer its result.

- Final macOS bundle verified copied/pasted multiline text and Markdown table insertion through actual UI. Additional malformed Mermaid check exposed orphan error SVGs; documented suppression fixes all three render paths, verified in a fresh-cache browser. 37 tests/lint/build still pass.

- CI 42087625830 completed successfully at 2397fba: frontend and native tests/builds on Linux, macOS and Windows all pass. Windows manifest fix is verified. Preparing final source CI for c112b2e's Mermaid error rendering fix.

- Final source run 42088770234 targets c2b5696. Frontend and Linux tests/build pass; Windows tests pass and build is running; macOS is queued. Watch handle 23734. Broad goal remains active for application-interaction qualification beyond macOS.

- Added real-native application acceptance harness and Windows/Linux CI steps: unchanged/edited mode cycles, actual Save As/Save/reopen, three-diagram export and Markdown table insertion. Builds have separate app identity/frontend output. Normal production assets exclude the test bridge; this check, 37 tests, lint and both frontend builds pass. Desktop test execution is not yet claimed.

- Application-acceptance CI run 42090781282 at 6038c20 is active. Frontend passed; Linux stopped during apt setup before any app tests (renamed package). Windows production tests passed and build is running; macOS is queued. Local fixes prepared, not pushed yet so Windows can report its independent result.

- Pushed 4c18dda with Linux package selection, native driver readiness/progress diagnostics, and checksum-pinned gsudo Medium-integrity Windows execution. Run 42092300007 is current. Prior run 42090781282 failed setup/session startup before editor tests; no desktop pass inferred. Current production macOS bundle rebuild is running separately.

- FINAL ACCEPTANCE: CI 42092300007 completed success at 4c18dda. Frontend, all three native tests/builds, and seven actual application cases each on Windows/Linux passed. Both result artifacts inspected. Current ordinary macOS bundle rebuilt/reopened via native Open with saved three-diagram fixture. Closing documentation only; goal may be marked complete after closeout push/state check.

- UI follow-up requested by user: removed floating mode buttons; added toolbar switch and View choices via one editor transition API; made static “66” Font Size placeholder functional (10–32px display size), synchronized zoom with config, and implemented About with app-version lookup/fallback and modal keyboard/focus behavior.
- ba99ae9 pushed. 41 tests, lint, production/acceptance builds and bridge isolation pass locally. Browser checks cover source fidelity, fonts/zoom, modal Tab/Escape/focus, no console issues and supported desktop widths. Rebuilt macOS app verified natively; original clean document reopened, unchanged counts and Ready state. CI 42121100607 running; native harness now uses toolbar switch and checks About version.

- UI follow-up acceptance complete: CI 42121100607 succeeded at ba99ae9. Frontend/41 tests, all three native tests/builds, and eight application cases each on Windows/Linux pass. Both result artifacts confirm About-version and relocated-switch workflows. Native macOS controls verified and user's clean original document restored. Documentation-only closeout; no merge/release.

## New increment — 6 November 2026
- Read supplied task and agreed plan. Verified starting HEAD and prior green CI directly. Created codex/productivity-increment. Existing user files untouched; baseline frontend/Rust checks running.

- Slice f9eca17: 44 frontend tests and native tests/lint/build pass. Tab sessions retain engine histories; save ownership/collision/close/quit tests added.
- Preferences schema, native atomic config/data storage and Settings Apply/Cancel/Reset implemented; migration/corruption/write-failure tests pass. Recovery restores drafts separately on disk conflict and exposes Open disk / Keep copy. 52 frontend tests currently pass, pending browser/native/restart qualification.

- Settings/recovery checkpoint committed 7ae2457; table checkpoint 0e01212. 58 frontend tests pass with folds added, lint/build pass. Native storage now has 4 command/storage tests plus 12 library tests.
- Playwright connector cannot launch because its browser profile is already in use. Use an isolated local browser runner; do not terminate the existing browser. Vite test server runs at 127.0.0.1:5175.

- Independent read-only review found/fixed startup overwrite race, immutable retention of rejected v1 schemas, Open/SaveAs ownership race, queued preference Quit flush, stale preview callbacks and pre-existing base64 image loss. Added regressions: 61 frontend tests.
- Browser exercises folds/mode bytes, table boundary/selection and settings. ERD insertion from a table cell reproduced a loss of diagram semantics; fixed insertion to follow its enclosing top-level block, regression added.
- macOS ordinary app actual Open/duplicate basenames/fold toggles pass. Dirty Cmd-W Cancel and Quit with inactive dirty tab both prompt correctly; Save As native dialog wrote the captured tab to a generated file. Earlier close test had not inserted text; no dirty-buffer loss observed. Native Settings source18/rendered22 Apply synchronized toolbar. Restart/recovery next.
- CI42130138476 frontend passed; Linux native app harness failed; inspect current logs/artifact before claiming native acceptance.

- Browser acceptance passes with zero console errors: 10 tabs; 800/1024/1440 footer/overflow; real Mermaid ERD in both views/export; native IPC stubbed only for browser.
- Actual macOS native review: Settings18/22 persisted; SIGTERM after confirmed native snapshot restored unnamed draft; deliberately discarded draft did not return. Second SIGTERM with edited table plus externally changed generated file restored detached recovery copy and retained exact newer disk text. Open disk choice works. Native ERD export contains one SVG, entities/PK/FK/cardinalities and no scripts. All generated dirty copies discarded through Quit prompts; app closed for final rebuild.
- Native table caret/column-width normalization exposed source whitespace dirtying without Markdown semantic change. Added failing real-engine regression and semantic-baseline filter; canonical bytes remain untouched for view-only attributes. Source/image-fold scanner now covers URL-encoded data and 1MB payloads. Ctrl+Tab navigation fixed for macOS as well as Ctrl platforms.

- Alpha.2 metadata synchronized and local Rust17 tests/build passed; final ordinary macOS app About confirms2.0.0-alpha.2. Clean table selection plus Save preserves exact73-byte fixture; CtrlTab/ShiftCtrlTab and last-tab Welcome pass. Temporary review tabs closed; original /Users/rheiger/SampleWithMermaid.md reopened clean (7996 characters).
- Final I/O audit added explicit Close Save cancellation/failure and queued Save-after-SaveAs tests. The latter reproduced normal Save reverting a newer SaveAs path; completion now leaves newer destination ownership intact. Await its verified source CI before closure.

- CI42132006395 (323aec8) Linux16-case native acceptance and macOS build/tests pass; Linux artifact inspected. Windows still running. Subsequent queued-save ownership fix and active-size independent settings fix pass68 tests/lint/build locally, awaiting final source qualification.

- CI42132006395 completed success at323aec8; both Windows/Linux result artifacts confirm16 cases. Final source6c6eb56 (68 tests and final ownership/active-font fixes) is running as42132949169. Current ordinary macOS bundle rebuilt from6c6eb56 and native source18/rendered22 control switching verified; original clean7996-character document retained.
- Draw.io isolated spike: official32.6.10 local offline iframe boots under unchanged CSP and echoes safe dummy entity XML; no remote requests/errors.49.7MB archive/120.2MB runtime with separate asset license notices. Native packaging, attribution inventory and safe editable-XML/SVG codec/ApplyCancel/offline save/export remain unqualified; defer product integration without controls/assets. Details in dedicated spike report.

- FINAL: CI42132949169 succeeded at6c6eb56.68 frontend tests, lint/build/audit/isolation, native tests/builds on all3 platforms,16 actual application cases each Windows/Linux. Both final artifacts downloaded and independently checked. Version metadata/lockfiles all2.0.0-alpha.2. Current ordinary macOS app rebuilt and native active source18/rendered22 size synchronization verified with clean7996-character original. Four-core acceptance complete; draw.io spike documented and product integration deferred. Documentation closeout only, no merge/release/issue actions.


## Next-session handoff preparation — 6 November 2026

- Prepared the agreed 2.1.0-alpha1 plan and launch prompt; core versus notation stretch versus backlog explicit. No new feature implementation in this preparation task.
- Created GitHub #30 scroll/caret/selection sync, #31 PlantUML, #32 Graphviz/DOT, #33 DBML; updated nine existing issue scopes. Snapshot 19 open / 14 closed.
- Isolated metadata/docs changes on codex/editing-navigation-plan from 3c100db. Root/frontend manifests and lock fields, Cargo manifest/lock, Tauri version all agree on 2.1.0-alpha1. Root package-lock remains ignored but synchronized locally.
- Current status/README/AGENTS/changelog/native evidence pointers updated; historical feature reports retain their original version/source evidence. Local checks and preservation/commit/push verification in progress.

- Preparation verification complete at metadata53598fa:68 frontend tests,17 locked Rust tests,lint,production/acceptance builds,bridge isolation,audit zero,9 version fields,Markdown render/local links/fences and20 user-file hashes pass. Corrected the standalone docs-render check to use the installed package resolver rather than a nonexistent old markdown-it/index.mjs path; no application change. Existing chunk-size and unused test-import warnings retained.
- Final handoff deliverables are docs/next-increment-2.1.0-alpha1-plan.md, docs/next-increment-2.1.0-alpha1-prompt.md and docs/issue-status-2026-11-06.md. No new feature implementation, merge/tag/release or ordinary native review-app rebuild. Final branch publication is verified through Git remote refs.

## 2.1 implementation — 6 November 2026
- Read current user attachment/plan and ownership/acceptance docs. Verified local and remote planning tips ed40277 agree. Preserved user-file inventory captured before any edits.
- Mapping slice: ownership ADR plus opt-in parser sidecar; UTF-16/CRLF/entities/escapes/repeated cells/lists/diagram fallbacks tested. 70 existing+mapping tests pass; lint/build pass after two TS strictness fixes. Ordinary renderer/export remains separate.
- Search integration: 72 tests passed before UI regressions; lint caught an engine-revision dependency annotation and was corrected. Added real editor source/fold/ReplaceAll/undo/tab and rendered/table/atom regressions. Initial dev-server port 5173 was occupied; own server starts on 5176 without stopping prior server. Playwright MCP shared profile is already in use; switching to an isolated CLI browser session.
- Real browser Find keyboard/menu flow passed: four rendered hits excluded diagram internals; Next selected correct engine range; Replace All retained table and atom. Browser revealed marks at a boundary were inherited from preceding plain text. A failing real-engine regression reproduced it; using the starting text node's marks fixes it. Search regressions now cover source folds, tab-local queries and one-step undo.
- Shared Playwright MCP profile is occupied; bundled wrapper points at a removed CLI binary. Isolated @playwright/cli session markwriter21 succeeds. Browser favicon 404 is harness noise to filter in the clean acceptance setup.
- Remaining editing regressions reproduced fresh source caret-at-end and one code block per selected paragraph. Both fixed with explicit safe-fence/sibling-block transactions; reverse source selections and code toggle undo pass. Literal input rules/paste transforms/autolink disabled; extension delimiter escaping added. Removed inert CB toolbar button and decorative Preview percentage line; widened WYSIWYG selection margin.
- Adaptive 5×5 picker has pointer growth/shrink, keyboard sizing and viewport cap with numeric controls to 40×40; continuation cues use public CodeMirror layers and exact visual wrap boundaries. Tests/lint/build currently pass (77 before additional literal regression). Browser fixture state resets during hot module changes, so acceptance seeds a fresh fixture after the final reload.
- Sync connected to actual lazy sourceView lifecycle and parser owner/revision/generation; all old percentage handlers removed. Source/Preview selection maps exact spans or local dashed block fallbacks; native selection remains independent. Browser geometry exposed a real ancestor-height bug: .cm-scroller expanded to full4597px, so the wrong ancestor scrolled. Fixed CodeMirror root height and source flex/min-height constraint before accepting synchronization.
- Native harness extended for2.1 source/rendered search scope, ReplaceAll undo followed by real native Save, fresh caret, anchored content scrolling, sync-off independence and mapping-free native HTML export. Existing picker selector migrated to accessible dimensions. Native results remain pending final-source CI.
- Actual browser1.067MB valid embedded SVG payload:266,676 source matches counted in62.4ms; fold remained intact while searching, one visible highlight. No worker/dependency added without a measured need. Native Preview reverse selection/copy validation is in progress.
- Browser source→Preview overlays and actual reverse Preview mouse drag pass (anchor29/head25); native Preview selection text and Cmd-C clipboard both remain "same", focus stays in Preview, no console issues. One browser harness race awaited SVG before100ms lazy source creation; corrected to wait for the actual source engine.
- Ordinary pre-upgrade macOS review app was observed clean on the original7996-character SampleWithMermaid.md, then quit normally. Captured source hash and copies of native workspace/preferences in /tmp for preservation. Rebuilding ordinary2.1 review bundle now.
- Native ordinary Settings persisted syncPreview=false/wrapContinuation=false across a normal quit/restart; saved EOF caret/source scroll restored. Restoring both to enabled retained fonts18/22. The native workspace confirmed a WebKit focus-return scroll jump (head5625 retained, sourceScroll reset4180→0) after Settings closed. Modal focus now uses preventScroll; final rebuilt native verification remains required.
- Unequal-font geometry fixture (source12/rendered28) passes at800/1024/1440 with1.20/2.87/2.55px anchor error; reverse22nd paragraph0.23px, no oscillation, footer visible, sync-off independent, source clean and no console errors. An initial harness sampled virtual line estimates during resize; changed explicit navigation to the public CM scrollIntoView measurement API instead of guessing a scroll offset. Native acceptance bridge uses that API too.
- Final #28 disposition audit reproduced a retained-owner bug in source toolbar formatting: source selection inside **bold** still reported rendered H1/bold=false. Added a failing real-engine regression; source formatting now uses its own CodeMirror syntax tree (GFM base) plus the underline extension cue. No canonical edits or new dependency.
- Ordinary macOS keyboard picker inserts2×2; native Undo removes it, literal "# literal heading" stays Body and serializes as \\#; dirty Close Cancel/Discard protects and then removes only the generated draft. Native Save As bytes match exactly; native exported HTML contains real SVG/table with no mapping attributes/scripts; original7996-character file hash remains unchanged.
- Real browser physical keyboard/Enter, native clipboard paste, and Chromium IME composition pass for literal #/>/-/1./fences/emphasis/underline/strike/links plus漢字; no formatting nodes introduced and saved escapes correct, no console issues.
- Bulk source application now assembles disjoint changes once rather than repeated whole-string splices. One unfold effect per edited block; explicit ReplaceAll preserves closed payloads. Actual1,066,804-character embedded-image fixture expanded to2,133,468 characters by266k safe whitespace replacements in737.9ms; fold stayedclosed, native single Undo restored exact source, no console errors. Added disjoint-change/fold regressions.
- Candidate af41e78 passed CI42143262113 on all three native platforms and frontend. This precedes the final formatting/focus/bulk fixes, so it is interim evidence only. Await final-source CI before issue closure/core acceptance.
- Final integration audit tightened link-label selection to reject an unchanged previous native range. Chromium reserves active-anchor drags for URLs even with draggable=false; mapped Preview now keeps destination tooltips and selectable labels, while ordinary rendering/export retain active links. Actual link/table/entity/Unicode drag, diagram fence fallback and queued scroll→switch→close ownership pass with no console issues. Expanded1.05MB line:22 viewport cues,755ms fixture flow, no horizontal overflow/dirtying.
- #28 historical audit reproduced the original source bullet/numbered deletion/below-line bug. Fixed selected-line transforms and end caret, task caret placement and Body unwrapping for safe/indented code;93 frontend tests pass. Actual browser and final ordinary macOS source toolbar formatting plus one Undo pass. Final source2895d1c pushed, final CI42145312950 running. Native app rebuilt at this exact source; generated draft discarded, original7996-char file remains clean/open. All20 user-file hashes and original sample hash still match.
- Required core gate complete at2895d1c: final CI42145312950 succeeded on frontend and macOS/Windows/Linux; downloaded and inspected both22-case native application artifacts. Final-source browser rerun data retained in docs/evidence. Release/OS-dialog/native-IME limits stay explicit.
- After core acceptance, isolated pinned actual DOT3.31.0/Graphviz16.1.0, DBML11.0.1 dbmlv2+real DOT adapter, and PlantUML1.2026.9 sequence/class/SANDBOX experiments ran. All three independently deferred: unsafe raw SVG + worker CSP gate, incomplete schema/layout semantics, and unbundled host-Java/process packaging respectively. No product notation dependency/control/CSP change. Repro sources/pins, runtime results and gates are recorded in docs/notation-offline-spike-2026-11-06.md and docs/evidence.

- Qualified #21/#26/#28/#30 closed with exact source/CI/native evidence and original historical requirements preserved. #10 updated but remains partial/open; #31/#32/#33 updated with actual failed spike gates and remain open; #5/#29 untouched backlog. Final GitHub snapshot15 open/18 closed. Final1.067MB native source clipboard/expanded-image cue check also passes (26 cues, exact copy, clean/range retained). Temporary browser, own5176 dev server and8106 spike server stopped; ordinary macOS review app remains open on unchanged original.

- Richard manually tested 2.1.0-alpha1 and explicitly authorized commit/push/merge. Verified all application source still matches qualified2895d1c and all20 local user-file hashes are unchanged. Main is the default integration target and an ancestor of the accepted feature state; no merge conflict or competing remote change exists. Acceptance/integration authority and current README pointer recorded; open issues remain deferred.
