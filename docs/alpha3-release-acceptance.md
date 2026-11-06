# Alpha3 release closeout — 6 November 2026

Richard accepts the increment and explicitly authorizes a more artistic icon, slightly expanded About, completed-issue reconciliation, integration and release. The target is `v2.1.0-alpha3`, an experimental prerelease with `make_latest=false`. This supersedes the earlier alpha3 publication boundary. Historical releases, assets, tags and the existing latest release remain immutable.

The final package source, workflow runs, byte hashes and completed acceptance are recorded in the release's attached `QUALIFICATION.json` and platform manifests. The earlier [f54b444 report](highlighting-theme-alpha3.md) and [15f25d1 feedback report](alpha3-feedback-acceptance.md) remain dated checkpoints; their packages do not contain this final icon/About polish.

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

#38/#39/#40/#45 are the completed alpha3 scope after final acceptance/integration. #39's broader shell cache/upgrade observations remain unqualified and must not be checked off as passed. Broader detection and Java/Perl/AWK/sed/CMake remain #44; pre-existing repeated-space loss in inline-code WYSIWYG serialization remains #46. Expanded Help #47 and native Quick View #48/#49 remain open. PDF/DBML/SQL import and other deferred formats remain independent work.

Mac ad-hoc sealing establishes integrity, without Developer ID trust, notarization or browser-quarantine acceptance. Windows remains unsigned. Native smart-punctuation prevention is qualified on the recorded Mac baseline; arbitrary spelling/text-expansion configurations and broader OS baselines remain unverified. Genuine rendered edits can normalize Markdown through the existing serializer; view-only operations retain exact source. No acceptance gate or historical limit is weakened by the visual polish.
