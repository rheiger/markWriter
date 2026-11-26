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

## Finder trial status

The previous provider remained installed while preflight ran. Its baseline extension CDHash was `92fdacdda3d37572b81ba3b961c6c022efe444fe` and its registration UUID was `C080143B-2726-46BF-B11E-6758867D031A`. The [exchange controller](https://github.com/rheiger/markWriter/tree/1143ccdb23189da6cd1ff1d8cea9ee9c45932574/research/finder-exchange) prepared the candidate after validating both original pins and fingerprinting 44 synthetic associations. An APFS scratch exchange and its reverse preserved both directory inodes. The [capture harness](https://github.com/rheiger/markWriter/tree/01f81b310ba35f48fe75653d732f024b8c4800ec/research/pi-2.22-finder) verifies live code identity and correlates request-specific timeout and fallback. Actual Finder rendering, timeout and recovery remain open pending the supervised installation trial.
