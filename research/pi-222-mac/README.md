# Mac qualification for the corrected PlantUML packages

## SSH and screenshot preflight

On 26 November 2026 aiger ran arm64 macOS 27.2.1 (26B131) with the SSH account logged into the local graphical console. The process created a 480 × 200 blue AppKit window headed MW-SYNTHETIC-SCREEN-PROBE, then attempted a capture with the system screencapture command and its exact window number. The command exited 1 with “could not create image from window”. Screen-capture, accessibility and event-posting preflights all returned false. A silent Finder Apple Event authorization check returned -1744 (interactive consent would be needed). The window exited after eight seconds. Test setup kept the Mac privacy settings and installed provider intact. The original provider was 2.19.3 at the normal installation path, registration UUID `758753AA-8BEB-409C-8D61-81244BEB17AF`.

The existing VNC session is available for operator observations. SSH can prepare packages, test the bundled renderer directly, capture request logs and verify rollback. The visual Mac Preview and Finder gates require a fresh observation after the corrected build.

## Preparation and direct checks

Use `python3 fixtures.py ABS_NEW_DIRECTORY FRESH_HEX_NONCE` to generate one synthetic Markdown file per case. Retain SHA256SUMS. Use the native QuickLookWebRenderer.swift from the exact product revision. Run the following over SSH with the helper files from this directory together:

```sh
./run-direct.sh /absolute/candidate.dmg EXPECTED_SHA /absolute/cases \
  /absolute/QuickLookWebRenderer.swift /absolute/new-direct-results
```

The runner verifies the mounted app and extension, records executable and resource hashes, compiles a direct WKWebView probe and checks PNG labels, sizes, preserved source text and visible fallback fences in its static HTML. Its per-case timing and RSS describe fresh probe processes and exclude their WebKit child processes. The separate package and actual Finder receipts carry their own scopes.

## Operator trial over the existing VNC connection

The orchestrator stages the corrected DMG and verifies its SHA-256, seals and the original installed identity. Use the [atomic exchange controller](https://github.com/rheiger/markWriter/tree/1143ccdb23189da6cd1ff1d8cea9ee9c45932574/research/finder-exchange) with the saved editor closed. This revision expects research package metadata 2.21.1. For another candidate version, update the controller's expected candidate metadata consistently with the pinned build manifest before preflight. Start only for an attended trial. Its watchdog restores the original after 20 minutes or on owner loss. Keep each editor-open phase short, quit the isolated test editor while still attended and allow the original to restore between trial windows.

Arm a [Finder capture](https://github.com/rheiger/markWriter/tree/8bae8ab/research/pi-2.22-finder) with the **candidate's** extension CDHash and executable Mach-O UUID for each case, using the heading nonce to identify the observation. In Finder, hide the Preview pane, open the single case directory and press Space on its file. Inspect the full preview, scrolling as necessary. When finished, close Quick Look before ending the interval. Save any screenshot of the single synthetic preview or app window with its case receipt. The old case collector uses sequence/class for ordinary completed requests and rejected/oversized for source-fallback documents. Use timeout only for the preselected timeout case.

| Case | Target and expected visible detail |
| --- | --- |
| closed | Editor closed. Client sends NightRequest to Server and receives dashed NightReply. User and Order show their fields, owns and both 1 and * ends. Missing theme, local include and fifth valid block remain source. |
| app | Open the same-path candidate with a fresh profile, outbound IP denied and the synthetic app file. WYSIWYG should show both diagrams. Click the toolbar switch from WYSIWYG to Markdown (Split). Inspect the **rendered pane on the right** separately for arrows, association, cardinalities and readable missing-theme source. Capture each view and use File → Export as HTML on this document. Verify the saved file’s SVG geometry, link and fallback, and the original Markdown hash. |
| open | Leave the isolated candidate running behind Finder. In the new fixture's Quick Look, expect the class, the two-way sequence, a StartNode → FinishNode Mermaid diagram, and an InputNode → OutputNode DOT diagram. |
| legacy | Expect labeled Mermaid and DOT diagrams plus DBML rows and items tables joined via their key columns. |
| negative | The malformed class, unavailable theme, local include and loopback include remain readable through each closing delimiter. |
| oversized | Oversized source remains readable through its final @enduml. |
| timeout | Preselect the file with Quick Look closed, wait for selection activity to settle, arm the exact-candidate capture, then press Space once. Record the visible heading, TimeoutSentinel and @enduml. Require one matching start, native timeout and fallback for the same request and dynamically verified provider. |
| recovery | Open this as the **very next preview**. Verify the RecoveryRequest arrow and dashed NightReply, and successful request(s) in the separate interval from the same verified candidate. |

Time and memory receipts use native renderer events, mapped executable identity, observed PID and RSS sampling. Use the collector's ordinary interval replay for additional requests during normal selection. A timeout pass requires an unambiguous single request and visible fallback. At the end, verify the original bundle inode, hashes, strict seals, one registered path, registration UUID, fixture hashes and all association/default fingerprints. Record any UUID change. Remove the staged candidate after receipt retention.

## Corrected DMG receipt and morning handoff

[Package run 45878938169](https://github.com/rheiger/markWriter/actions/runs/45878938169) built the corrected candidate from `ce882d781441c8376f69f52da5b27bf3f3a5f83e` with 2.21.1 research metadata. On aiger, the 15,171,482-byte DMG matched its build manifest SHA-256 `e47013681a00f2ed08b3e36f37fdbab37fc0475175d60618f90a1c516e92b88d`. The host and extension passed strict ad-hoc seal verification. The corrected host CDHash is `7d3136a172f626f683434b1fa5c7d61cdd5ad7b8`. The extension CDHash `a06fb7915b27f1959c58c0f6a6f06c2f018bdf4e`, executable SHA-256 and renderer script SHA-256 match the [previous Finder trial](https://github.com/rheiger/markWriter/blob/5c66d6fa80ffd1df82d0045a86b4b83e53ad428b/docs/evidence/pi-2.22-integrated-macos/README.md). That earlier trial observed sequence/class, an exact request timeout and recovery over VNC. The corrected host has a different executable SHA-256.

The [single-block probe](results/candidate-single/direct-probe.json) passed all 11 checks on the corrected DMG. First/warm sequences took 620/393 ms, the representative class took 513 ms, and a fresh sequence after rejected cases took 403 ms. Probe-only high-water RSS reached 163,807,232 bytes. The only loopback server request was the positive control. Both synthetic canary hashes matched. The [multi-block output checks](results/candidate-direct) passed all seven case documents; they verified embedded PNG labels and dimensions for PlantUML, Mermaid, DOT and DBML, exact disclosed source for rendered diagrams, and visible source for unsupported and over-budget fences. These direct probes exercise the packaged script in WKWebView. The next corrected-package visual checks remain the separate Mac rendered Preview pane and the actual Finder cases with the editor open and closed.

The Mac staging directory is `/private/tmp/mw-night.XdKkgJ`. The fresh case nonce is `a831f905`. [Captured preparation state](results/staged-state.json) lists the candidate and original identities plus the 44 before-trial association fingerprints. The state is `prepared`. The original 2.19.3 app remains installed; its prior registration UUID is still the only entry. No exchange or watchdog is active. [Registration receipt](results/overnight-provider.txt)

For the attended trial, first check the operator is present on the open VNC connection and the original editor has been saved and quit. Hold `ssh -tt 192.168.200.172 'cd /private/tmp/mw-night.XdKkgJ && /usr/bin/python3 -u exchange.py start /private/tmp/mw-night.XdKkgJ/exchange'` open. After READY, the exact candidate arm64 Mach-O UUID is `25053F44-52CB-3F32-A138-8A3E9C49AE85`. Launch the capture script with the per-case fixture, extension identifier and fingerprint from the receipts. End the controller with a newline after closing the synthetic editor and Quick Look. Its journal and independent postflight, including all 44 associations, confirm restoration. A VM restart or cleanup of the stage requires fresh preparation against the same pinned DMG.
