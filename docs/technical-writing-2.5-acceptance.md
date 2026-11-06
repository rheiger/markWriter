# Technical-writing acceptance — 6 November 2026

This is a dated candidate checkpoint for PR #51, not a release assertion. Final source, merged/tag runs, asset IDs and anonymous downloads belong to the eventual release QUALIFICATION.json.

## Source and automated checks

Application implementation `33620c4d496824783ee4d253e6600dbe768b76b6` passed315 frontend tests,10 Node checks,21 macOS Rust tests, lint/typecheck, build/audit and20 emitted WOFF2 byte checks locally. Subsequent738d4e2 changes scope acceptance selectors to the active WYSIWYG node and permit the exact notices directory in the loopback Vite development server. Independent review approved both implementation and those deltas.

Quality push42284466091 passes frontend and all three native targets at738d4e2. PR package42284475248 passes all three platforms; its GitHub test merge97464bc7e624fbbf44a1dc764bb8c5f272b0bb1c has the exact738d4e2 tree. Windows and Ubuntu ordinary installed artifacts each record22 groups, including8 technical-writing groups,26 code cases and20 loaded math fonts. Mac records6 bundle/startup checks. New source must pass its own gates.

Separate push package42284466052 failed on Windows in the existing DOT starter sequence, waiting for an empty file after Undo/Save. Its screenshot showed an empty modified editor. File appearance did not establish completion of the preceding Save As; the harness now waits for the adopted path/clean idle UI, then one completed Undo, then issues one Save and retains the strict empty-file assertion. This diagnosis is supported by the asynchronous path-adoption code, but the failed artifact does not establish timing conclusively. It remains a failed dated run, and final reruns are mandatory.

## Downloaded Mac native acceptance

The ordinary downloaded33620c4 arm64 DMG was checked against its manifest and copied into external task scratch. Strict whole-bundle ad-hoc verification passes. Every file in the passing738d4e2 PR app is byte-identical to this UI-tested app: Info.plist, Mach-O, CodeResources seal and icon. This binds the native observations to that payload; final merged/tag package equivalence must still be verified.

- Native About reports2.5.0-alpha1 and retains the exact Richie sentence/artwork.
- OS Open and Save As load the five-expression/code/Mermaid/DOT fixture. View-only source switching and Save As preserve its SHA256 `075726aad9cae977d61346c9ef7b8138531d81de3d2e12e0f73c7c485907d6d0`.
- Fractions, Greek/scripts, matrices, aligned equations, Unicode and long math render in WKWebView. A live source-field edit saves while focused; physical Cmd-Z/Shift-Cmd-Z restores/reapplies it. Reopen shows the saved expression and code spaces/tabs/all-space/backtick content.
- Help search filters to Mathematics, keyboard Escape returns focus, and Light/Dark native screenshots are retained. The800×600 four-way editor/theme keyboard matrix is separately verified in the built-in browser and ordinary Windows/Linux installed journeys.
- Native HTML export has five static math blocks,20 embedded WOFF2 fonts and zero scripts; source-navigation attributes are absent. A separate built-in-browser context renders the real export offline with all20 font faces loaded.
- Empty, malformed, denied-link, recursive-macro and17,000-character expressions produce five readable fallbacks in both native editors and Save As preserves exact source. A65-block native document renders64 expressions plus one limit fallback in both modes; saved source remains exact.
- An unsaved Unicode/math/code draft survives abrupt termination of only the isolated test process. Separate recovered Save As equals the original81-character draft exactly, while the prior saved file stays unchanged. Independent source/rendered text sizes and Light preference survive restart.
- Native preformatted rich HTML clipboard code preserves leading/trailing/repeated/all spaces and tabs through Save and Undo. Unstyled HTML passed through the CUA rich-text paste service produced a normalized pasted result; the incoming pasteboard HTML was not captured, so the normalization point is unknown. Arbitrary OS clipboard/text-service fidelity is not claimed. The actual browser clipboard-event parser path preserves exact incoming HTML code text.

The app/profile and heavy outputs live under the task-owned external volume. A post-quit CUA inspection unexpectedly relaunched the copied app without its profile environment. It was stopped without editing; preferences retained their pre-run modification time, all23 user-file hashes match, and retained session document contents/paths/dirty states are unchanged. Only source/Preview scroll state changed on startup; it was restored from the retained previous workspace snapshot. No installed app replacement or OS protection change occurred. Private profile recovery snapshots stay local and are excluded from public qualification.

## Limits and deferred scope

Ad-hoc sealing is not Developer ID/notarization. Windows is unsigned. Browser quarantine, arbitrary OS text services, broader shell/cache/upgrade visuals and unrecorded OS baselines are unqualified. Optional Java/Perl/AWK/sed/CMake and broad detection #44, OS previews #48/#49, PDF, DBML/DDL, PlantUML/draw.io and windows/plugins remain deferred. Real rendered editing preserves semantics and code text; it may normalize Markdown delimiter/prose/final-newline spelling. No failed or queued gate permits publication.
