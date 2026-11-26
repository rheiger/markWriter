# Integrated PlantUML candidate on Apple silicon

The [package run](https://github.com/rheiger/markWriter/actions/runs/45873114289) built the app and Finder extension together from `dc921c26388ca59a8ecb913bc6c6090f3d9d9bd3`. The DMG carries research metadata 2.21.1. Its SHA-256 is `b7c0cff6ecb7257c8c7ffec853a6569b60bedada10bb5f9164f3f21be0b5e97a`. It is 15,161,436 bytes, an increase of 2,049,504 bytes over the published v2.21.1 DMG. The [exact-revision quality checks](https://github.com/rheiger/markWriter/actions/runs/45873049411) passed on all three platforms.

## Package identity

| Item | Observed value |
| --- | --- |
| Host executable SHA-256 | `ceba10c1c043dbf191b9cc4aea4d1061d82e8f19439af254f7cde8c62aff9569` |
| Host CDHash | `9f729dd3f3d3ee4454913bea16fa91a25b16db73` |
| Extension | `com.markwriter.app.quicklook` |
| Extension executable SHA-256 | `401eeecb1117048961103518a0ffa0720766457109c5566dcdde6e0bc950d7ab` |
| Extension CDHash | `a06fb7915b27f1959c58c0f6a6f06c2f018bdf4e` |
| Extension arm64 Mach-O UUID | `25053F44-52CB-3F32-A138-8A3E9C49AE85` |
| Finder script | 9,830,059 bytes, SHA-256 `ddb435c53c82e376588cad4f2e0a68b9f76f9bb858c708c669da8816613e96e3` |

Strict ad-hoc signature verification passed for the app and extension on the QA Mac. The sealed resource and executable hashes from the mounted DMG matched the staged copy. The hosted macOS installed-package smoke launched the production editor with outbound IP denied and verified a clean synthetic document open.

## Direct WKWebView on aiger

On arm64 macOS 27.2.1 build 26B131, the [direct runner](https://github.com/rheiger/markWriter/tree/84ba913/research/pi-2.22-finder) used the Swift renderer source from the integrated revision and the script from the mounted DMG. All 11 synthetic cases matched their expected image and source outcome. The first sequence took 713 ms, the next sequence 391 ms, the class 414 ms and the private-field class 399 ms. After malformed input, missing theme, external references and oversized input, the final sequence rendered in 382 ms. The probe process reported a high-water RSS of 163,758,080 bytes. These observations exclude WebKit child memory. The first sample has no verified cold-cache condition. Only the positive loopback control reached the listener. The local synthetic canary hash matched before and after. [Case receipts](direct-probe.json)

In a separate hosted direct native probe, bounded fallback and recovery passed for CPU-bound work, and file and loopback resource requests were blocked. Actual Finder requires its own observed selection, request and visible preview.

## Finder qualification

The previous provider remained installed while preflight ran. Its baseline extension CDHash was `92fdacdda3d37572b81ba3b961c6c022efe444fe` and its registration UUID was `C080143B-2726-46BF-B11E-6758867D031A`. The [exchange controller](https://github.com/rheiger/markWriter/tree/1143ccdb23189da6cd1ff1d8cea9ee9c45932574/research/finder-exchange) prepared the candidate after validating both original pins and fingerprinting 44 synthetic associations. An APFS scratch exchange and its reverse preserved both directory inodes. The [capture harness](https://github.com/rheiger/markWriter/tree/01f81b310ba35f48fe75653d732f024b8c4800ec/research/pi-2.22-finder) verifies live code identity and correlates request-specific timeout and fallback.

With the user's editor saved and closed, the sealed candidate occupied the normal installation path, with one registered provider. The operator used the existing VNC session and fresh synthetic Markdown. The candidate extension ran as PID 95792. Its running code satisfied the candidate CDHash requirement, and its mapped executable inode 3410262 matched the on-disk executable. Its initial Finder request started in a new process.

| Fixture | What the operator saw | Native renderer elapsed |
| --- | --- | --- |
| Sequence e4260345 | Alice sent Request to Bob and the dashed Response returned. | 998 ms and 386 ms |
| Class 3af81f66 | User and Order had fields and an owns association with 1 and * ends. | 1,516 ms and 432 ms |
| Timeout 1a7dbc53 | Under the fixture heading, readable PlantUML included TIMEOUTSENTINEL913 and the final @enduml. | 8,396 ms |
| Recovery c2540040 | The next preview displayed RecoveryRequest and the dashed Response. | 616 ms and 387 ms |

For the timeout, the operator selected the fixture before capture and then pressed Space once. A signature-checked watcher suspended the exact provider for 8.264 seconds. The single request `E47770B2-80F9-4CFD-B663-4517912CCE23` logged start, timeout and fallback under the same PID. After resumption, that same process completed both requests in the recovery interval. The ordinary sequence, class and recovery intervals each had two successful completions. The logs do not identify which response Finder displayed. Timings above measure native enrichment and exclude human and Finder display delays. The first process was fresh, while cache state was uncontrolled.

The live capture's original summary failed on the Mac's compact timezone syntax for the timeout, and required a single request for ordinary intervals. The original reports and NDJSON are preserved. The [replay repair](https://github.com/rheiger/markWriter/commit/8bae8ab) checked their hashes, fixture, code identity, PID, order and timing, writing separate receipts. The integrated JavaScript verifier independently accepted the strict timeout. [Sequence](finder/sequence/replayed.json) · [Class](finder/class/replayed.json) · [Timeout](finder/timeout/replayed.json) · [Recovery](finder/recovery/replayed.json) · [Loaded executable identity](finder/sequence-live.txt)

## Distribution gate

The compiled `@plantuml/core@1.2026.10` engine (SHA-256 `c6664799aaa464319b5e1070a69850b93a7ea23ee41a23e920a8f2086e7da21c`), app render worker and Finder script contain Smetana and TeaVM runtime markers. The candidate's generated third-party notices include the npm package's MIT license. They do not identify Smetana or TeaVM. The exact upstream source for the compiled Smetana graph type retains its AT&T copyright and EPL-1.0 header. The matched TeaVM runtime is Apache-2.0 and has an upstream NOTICE. Before shipping, reconcile the credits, license texts and corresponding source for the code actually included, regenerate the offline notices and verify them inside each resulting package. The already documented Viz Graphviz build has separate provenance. Switching the layout provider at runtime would leave Smetana in the existing binary.

[PlantUML's npm distribution](https://github.com/plantuml/plantuml/blob/a00eddaf700c0681a642ddd11c4f95e0ade8cdc9/PUBLISHING_NPM.md) · [Smetana graph type](https://github.com/plantuml/plantuml/blob/a00eddaf700c0681a642ddd11c4f95e0ade8cdc9/src/main/java/h/ST_Agraph_s.java) · [Pinned TeaVM version](https://github.com/plantuml/plantuml/blob/a00eddaf700c0681a642ddd11c4f95e0ade8cdc9/gradle/libs.versions.toml) · [TeaVM runtime](https://github.com/konsoletyper/teavm/blob/e87d452e4bd70c77b9e19314a46c3d6971c148b6/core/src/main/resources/org/teavm/backend/javascript/runtime.js) · [TeaVM NOTICE](https://github.com/konsoletyper/teavm/blob/e87d452e4bd70c77b9e19314a46c3d6971c148b6/NOTICE)

## Installed Mac app and exported document

The integrated, signature-checked editor opened [the synthetic fixture](app-check.md) with its own preferences and recovery directory. The launcher denied outbound IP to the editor. The operator exported using File → Export as HTML through the existing Mac VNC connection. The [saved HTML](mac-saved.html) is 7,804 bytes with SHA-256 `a7622302a74d50261dc946fde6ced454b70d5edf8c62a6a21abc16b06fb8b9e5`. It contains two inline SVGs (sequence viewBox 131 × 221 and class 84 × 188) with text and geometry, including two message arrowheads, both classes, owns and both multiplicities. The third block retains the exact missing-theme source. The ordinary link remains active. No script, image, stylesheet link, iframe or object was present. The synthetic source SHA-256 was unchanged. [Parsed export receipt](mac-export-receipt.json)

## Other exact packages

The same source revision passed the [Linux app and native export trial](https://github.com/rheiger/markWriter/tree/8a2ce72fbe89faa8d4ee0b68e99cc2e0cabca8eb/research/pi-2.22-integrated-app-linux) on the extracted Ubuntu DEB in Debian 13.8. Hosted Ubuntu separately passed 49 installed-package checks. The [installed Windows trial](https://github.com/rheiger/markWriter/blob/a5d92900565229b2e63503ffdb2913e1e15ef48d/docs/evidence/pi-2.22-windows/README.md) verified WYSIWYG, Preview, native export, both worker hashes and fallback. All three package jobs passed. These are research artifacts with the prior version's metadata.

The operator described the WYSIWYG view as looking the same as the HTML export and initially described PlantUML as looking text-only. No distinct visual confirmation of the Mac rendered Preview pane or its diagram geometry was obtained. The static SVG structures above were verified from the actual saved file. That file remains in the user's Documents folder. The fresh test profile contained only a clean empty document and the unchanged synthetic input when its verified process was terminated for restoration.

## Restoration and decision

The original 2.19.3 host returned to its original path and directory inode 2371490. Its host and extension seals, binary and script hashes, sole registered path, six fixture hashes and 44 file-type/default application fingerprints passed independent post-restoration checks. The first immediate registration check encountered a transient listing mismatch. The restoration watchdog then verified the registered original, and a fresh independent check reproduced that result. Registration UUID changed from `C080143B-2726-46BF-B11E-6758867D031A` to `758753AA-8BEB-409C-8D61-81244BEB17AF`. [Restoration state](finder/restoration-state.json) · [Final listing](finder/provider-final.txt) · [Watchdog receipt](finder/watchdog.log)

**Go for the verified Finder rendering, controlled fallback and subsequent recovery. No-go for distribution of this revision.** The runtime notice and provenance review remains open. The separate Mac Preview observation and production Finder coverage with the editor open, multiple diagram blocks and existing diagram regressions on the target remain outstanding. Direct negative fixtures and the native deadline probe establish their respective tested paths. The actual Finder session used the installed extension's offline restrictions on a network-connected Mac. A hard process-memory ceiling and an end-to-end eight-second visible response under arbitrary scheduling were not established. No release patch was allocated.
