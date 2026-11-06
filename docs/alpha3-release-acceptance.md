# Alpha3 release closeout — 6 November 2026

Richard accepts the increment and explicitly authorizes a more artistic icon, slightly expanded About, completed-issue reconciliation, integration and release. The target is `v2.1.0-alpha3`, an experimental prerelease with `make_latest=false`. This supersedes the earlier alpha3 publication boundary. Historical releases, assets, tags and the existing latest release remain immutable.

The final package source, workflow runs, byte hashes and completed acceptance are recorded in the release's attached `QUALIFICATION.json` and platform manifests. The earlier [f54b444 report](highlighting-theme-alpha3.md) and [15f25d1 feedback report](alpha3-feedback-acceptance.md) remain dated checkpoints; their packages do not contain this final icon/About polish.

## Released result

[v2.1.0-alpha3](https://github.com/rheiger/markWriter/releases/tag/v2.1.0-alpha3) is public as an experimental prerelease, `latest=false`, from merged source `b40d45bd586c0c127bb696748101ded4276fce52` through [PR #43](https://github.com/rheiger/markWriter/pull/43). The immutable annotated tag object is `bace67ba8d318898f83bc6965c9b6a717496f0d9`; its tree equals the UI-tested PR and final polish source.

| Gate | Completed evidence |
| --- | --- |
| Exact merged source | [Quality/native 42258942347](https://github.com/rheiger/markWriter/actions/runs/42258942347) and [production packages 42258942121](https://github.com/rheiger/markWriter/actions/runs/42258942121), all three targets passed |
| Immutable tag | [Packages/draft publisher 42261579347](https://github.com/rheiger/markWriter/actions/runs/42261579347), all three targets and publisher passed |
| Tests/application acceptance | 235 frontend/9 Node checks; Rust 20 macOS/Linux, 25 Windows; Windows/Linux each 40 actual native and 14 ordinary installed groups, 26 code cases and six installed theme checks |
| Downloaded Mac app | Strict ad-hoc seal, arm64, version, icon and every installed app file verified; final tag payload equals the native UI-tested PR app byte-for-byte |
| Native Mac journeys | About artwork/credit in Light/Dark, native Open/SaveAs, both editors, exact 2245-byte view/source Undo preservation, all 26 code texts in script-free highlighted/plain exports (182/0 token spans), technical literal input, prose smart-punctuation control and normal restart |
| Publication | Same draft/release ID `436799275`; all 12 public assets downloaded without authentication and matched accepted draft IDs, sizes and SHA256; original ten asset identities retained when qualification was added |

The attached [QUALIFICATION.json](https://github.com/rheiger/markWriter/releases/download/v2.1.0-alpha3/QUALIFICATION.json), original `SHA256SUMS` and supplemental `QUALIFICATION-SHA256SUMS` cover the final packages and evidence. [Recorded public verification](alpha3-release-verification.json) retains the release/asset identities. Negative controls reject a changed release ID or asset ID even when file hashes remain valid. Independent postpublication comparison confirms all nine historical releases (including bodies/metadata), 28 old asset IDs/sizes/digests, 14 old tag refs and latest release ID `243493855` are unchanged, ignoring only download counters. Historical asset payloads were not downloaded again. All 21 inventoried user-file hashes remain unchanged. #38/#39/#40/#45 are closed against their qualified scope; #44/#46 and new Help/Quick View/math requests remain open.

## Artistic polish

The editable SVG depicts warm folded paper, a sculpted brass fountain-pen nib and one flowing ink stroke on a deep teal/indigo tile. It generates the seven native desktop resources and appears in About. Actual 16/24/32/48/64/128-pixel renders were inspected on light/dark backgrounds; macOS decodes all ten ICNS image representations with identical pixels to the generated references. PNG/ICO generation repeats byte-for-byte. ICNS layer payloads repeat, while container order can vary; the untouched CLI output is tracked and packages compare its exact committed bytes. See [icon generation](../src-tauri/icons/README.md).

About adds product context and open-source acknowledgments while retaining the exact sentence: “This program was completely built using vibe coding under the direction of 'Richie'.” It keeps native dialog semantics, theme tokens, focus containment, Close and Escape behavior, and bounded scrolling for small windows. The SVG is decorative for assistive technology and has no external/executable content.

Local acceptance: 235 frontend tests, lint/typecheck, production build/bridge exclusion and 9 Node checks pass. The built-in browser verifies the revised About in Light/Dark at the 800×600 minimum window, loaded icon, exact attribution, Tab/ShiftTab/Escape and no console warnings/errors. Independent review finds no blocker. These local results do not substitute for final package acceptance.

## Final-source gates

1. Require all three quality/native and production-package targets. Windows/Linux actual applications retain 40 native and 14 installed groups, 26 code fixtures, native/theme/view/fidelity/ownership checks and offline installed workflows.
2. Download the final Mac package, verify source/version/arm64/icon bytes/strict whole-bundle ad-hoc seal and exercise ordinary About, dialogs, both editors and exact-source preservation in an isolated profile. Verify the visible native artwork and preserve the user's app/session and 21 inventoried files.
3. Merge only the reviewed, passing PR head. Requalify the exact merged source before creating the one immutable annotated tag. The existing Tauri tag workflow produces a draft prerelease only after all package gates pass.
4. Download every draft asset afresh. Check manifests, source/version/architecture, SHA256SUMS, GitHub asset digests and Mac payload identity. Add final acceptance qualification before publishing the same draft as prerelease/latest=false; never replace failed/existing releases or assets.
5. Verify every public download without authentication and compare the nine historical releases, 28 assets, 14 existing tag refs and latest identity against the captured baseline. Record final user-file preservation and issue states.

## Scope and limits

#38/#39/#40/#45 are the completed alpha3 scope. #39's broader shell cache/upgrade observations remain unqualified and must not be checked off as passed. Optional Finder automation was inconclusive, and original Finder view restoration was not verified. Broader detection and Java/Perl/AWK/sed/CMake remain #44; pre-existing repeated-space loss in inline-code WYSIWYG serialization remains #46. Expanded Help #47, native Quick View #48/#49 and mathematical notation #50 remain open. PDF/DBML/SQL import and other deferred formats remain independent work.

Mac ad-hoc sealing establishes integrity, without Developer ID trust, notarization or browser-quarantine acceptance. Windows remains unsigned. Native smart-punctuation prevention is qualified on the recorded Mac baseline; arbitrary spelling/text-expansion configurations and broader OS baselines remain unverified. Genuine rendered edits can normalize Markdown through the existing serializer; view-only operations retain exact source. No acceptance gate or historical limit is weakened by the visual polish.
