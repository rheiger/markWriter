# PI 2.22 attended Finder evidence — 28 November 2026

This evidence-only branch starts from candidate source revision
`ce882d781441c8376f69f52da5b27bf3f3a5f83e`. It does not change release or
product metadata. The package under test was identified by its research DMG
SHA-256 `e47013681a00f2ed08b3e36f37fdbab37fc0475175d60618f90a1c516e92b88d`.
The Apple-silicon Mac was running macOS 27.2.1, build 26B131. The sole listed
provider at the start of inspection was version 2.21.1 at
`/Applications/MarkWriter.app/Contents/PlugIns/MarkWriterQuickLook.appex`,
registration UUID `989FBB82-78C6-4EAF-BD23-2EBC6D4318E4`.

The installed app and extension passed strict seal verification; the extension
was ad hoc signed and had no TeamIdentifier. The installed extension executable
SHA-256 was `401eeecb1117048961103518a0ffa0720766457109c5566dcdde6e0bc950d7ab`
and its script SHA-256 was
`ddb435c53c82e376588cad4f2e0a68b9f76f9bb858c708c669da8816613e96e3`, matching
the package component hashes and the stopped capture receipt. The captured
extension CDHash was `a06fb7915b27f1959c58c0f6a6f06c2f018bdf4e`, and its
arm64 image UUID was `25053f44-52cb-3f32-a138-8a3e9c49ae85`. These are
package and provider identity observations, not an automatic visual pass.

## Closed-details sequence interval

The immutable [capture result](closed/result.json), [renderer events](closed/renderer.ndjson),
[synthetic fixture](closed/closed-a831f905.md), and stop marker were copied
after capture stopped. Fixture SHA-256 is
`2576160357b6ade76904e4232a18ac0ab5ab143d184ab0d533dbe0389f72b648`.
The capture's strict single-request correlation correctly reports false:
Finder issued five completed requests in the selection interval. The separately
retained [normal multi-request replay](closed/replay-normal.json) verifies
each request's start/completion sequence, the same dynamically verified PID
14185, recorded code-signing identity, fixture bytes and source-file hashes.
The five native elapsed values were 1,487, 468, 1,680, 845 and 341 ms; these
are request log durations, not times to visible output or measured cold starts.
Multiple requests mean a displayed response cannot be attributed to any one
request.

The operator supplied a PNG screenshot of the actual Finder Quick Look window.
The original was 1,624 × 1,700 pixels, SHA-256
`225009bfd60ff3f9c82ec32c258072707407ccfafad69722b477eff2d14e7dd9`. The
binary is not included here because it contains desktop edges. The visible
window title was `closed-a831f905.md` and the document heading was
`PI222 closed a831f905`. The displayed sequence diagram showed Client, Server,
the rightward `NightRequest` and dashed leftward `NightReply`. The class diagram
showed User and Order, their distinct private/public field markers, `owns`, and
the `1`/`*` cardinalities. Both diagram-source disclosures were closed. The
missing-theme fence was visible as source through `@enduml`; the following
local-include fence was visible only through the include line at the bottom
edge. This screenshot does not establish the rest of that fence or the fifth
block; further scroll observation is pending. It also does not identify which
of the five completed requests supplied the displayed result.

A contemporaneous [read-only process observation](live-executable-inode.txt)
found PID 14185's mapped executable and the installed file had the same device,
inode and size. This process inspection was after the first two logged requests
and does not identify which response Finder displayed. The capture reports
point-in-time extension-process RSS samples up to 130,160 KiB; they exclude
WebKit children and do not establish peak total memory.

The replay uses [capture_finder_case.py](capture_finder_case.py), byte-identical
to `research/pi-2.22-finder/capture_finder_case.py` at source commit `8bae8ab`
(SHA-256 `8932efc8ebf0e3a3e315b970cdcf4e5350a3740b3b1fb13cd091944e010d8bd4`).
It reads the copied receipt, event log, stop marker and fixture and writes a new
local output; it does not contact or modify the Mac. Run from the repository
root with:

```sh
python3 research/pi-2.22-attended28/capture_finder_case.py replay \
  --capture-dir research/pi-2.22-attended28/closed \
  --fixture research/pi-2.22-attended28/closed/closed-a831f905.md \
  --case sequence --extension /Applications/MarkWriter.app/Contents/PlugIns/MarkWriterQuickLook.appex \
  --cdhash a06fb7915b27f1959c58c0f6a6f06c2f018bdf4e \
  --image-uuid 25053f44-52cb-3f32-a138-8a3e9c49ae85 \
  --out /tmp/new-closed-replay.json --normal-interval
```

The interval is not a controlled timeout. A qualified timeout requires one
correlated request, a verified suspension of that exact process and request,
the visible source fallback, and a subsequent successful preview. Other
diagrams, limits, and restoration state require their own evidence.
