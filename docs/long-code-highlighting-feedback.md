# Long Python/JSON highlighting feedback — 6 November 2026

Local follow-up to published 2.5.0-alpha1. The published release, tag and acceptance records remain immutable; this follow-up has not been packaged or released.

## Cause and change

The reported document contains a 4,588-character Python block and 11,246/8,355-character JSON blocks. All exceed the shared renderer’s former 4,096 UTF-16-unit block cap. Its 16 Ki document budget also prevents simply raising the block cap from fixing the whole document.

Explicit Python (including `py`) and JSON now accept 16 Ki UTF-16 units per block, sharing a separate 32 Ki document budget. Other grammars retain 4 Ki per block and their original 16 Ki document budget; this preserves the earlier C++ performance boundary. Automatic detection remains limited to 2 Ki per block / four blocks. All paths retain the 2 Ki line limit, 64-block document limit, 4,096 token-span limit and bounded cache. Individually ineligible blocks no longer consume the document character budget. Exhausted, unknown or failed highlighting remains escaped plain text with the complete source retained.

The budgets include cache hits and apply consistently in both editors, Preview and HTML export. No document mutation or editor lifecycle change is introduced. These are work/input bounds, not hard real-time lexer guarantees.

## Verification

- Four new regression tests first failed against the previous implementation, then passed with the fix. They cover an ordered six-block technical document, CodeMirror and Tiptap decoration adapters, Preview/export text equality, disabled highlighting, aliases, exact/over-limit blocks, cache-hit budget consumption and separate general-language budgets. Fixtures are synthetic; user document contents are not committed.
- Full frontend suite: 31 files / 319 tests pass. Lint, TypeScript checking and production build pass. Build retains its existing large-chunk warning.
- Real Chromium test harness loaded the exact reported document through the production highlighting modules and both editor engines. All six blocks receive tokens in CodeMirror/Tiptap/Preview/export, respectively: 67, 109, 117, 49, 1,279 and 950. Original Markdown and code text compare equal; Light/Dark token colors are visible, and the completed harness has no console errors or warnings.
- The exact-document highlighting pass measured 4.2 ms in the browser observation. Separate cold Node observations measured about 10 ms for the reported Python block and 2.4/1.0 ms for the large JSON blocks. Bounded repeated-token stress inputs were also inspected; these observations are not universal timing guarantees.
- The reported document’s SHA-256 remains `8787352658e12c1395f40ef6982e1ee6d57b64f5d2d1719d4f5e531e0c372fcc`.
- Browser evidence and private harness: `~/.codex/artifacts/markwriter-long-code-feedback`. No native app or user profile was launched for this follow-up. The temporary localhost server was stopped.

## Documentation

`README.md` is now the maintained project entry point, describing the real editors, features, explicit prerelease downloads, current build commands and acceptance limits. `README-v2.md` is a compatibility pointer. The former Python/Qt and early-rewrite texts remain accessible through immutable Git history links. Bundled Help now states the highlighting sizes.

Native three-platform package acceptance remains required before publishing this application change. The already completed 2.5.0-alpha1 release is not reopened by this follow-up.
