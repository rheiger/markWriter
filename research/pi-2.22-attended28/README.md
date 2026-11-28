# PI 2.22 attended Finder evidence — 28 November 2026

This evidence-only branch starts from candidate source revision
`ce882d781441c8376f69f52da5b27bf3f3a5f83e`. It does not change release or
product metadata. The package under test was identified by its research DMG
SHA-256 `e47013681a00f2ed08b3e36f37fdbab37fc0475175d60618f90a1c516e92b88d`.
The Apple-silicon Mac was running macOS 27.2.1, build 26B131. The sole listed
provider at the start of inspection was version 2.21.1 at
`/Applications/MarkWriter.app/Contents/PlugIns/MarkWriterQuickLook.appex`,
registration UUID `989FBB82-78C6-4EAF-BD23-2EBC6D4318E4`.

The [installed app and extension passed strict seal verification](installed-provider-verification.txt);
the extension was ad hoc signed and had no TeamIdentifier. The installed extension executable
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
edge. The screenshot alone does not establish the rest of that fence or the
fifth block. The operator subsequently scrolled and reported that the final
two blocks were readable source. That report is a separate human observation;
it was not independently captured in the retained screenshot. Neither source
identifies which of the five completed requests supplied the displayed result.

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
root with the command below. The matching `test_capture_finder_case.py` from
that revision passed all nine tests locally under Python's unittest runner.

```sh
python3 research/pi-2.22-attended28/capture_finder_case.py replay \
  --capture-dir research/pi-2.22-attended28/closed \
  --fixture research/pi-2.22-attended28/closed/closed-a831f905.md \
  --case sequence --extension /Applications/MarkWriter.app/Contents/PlugIns/MarkWriterQuickLook.appex \
  --cdhash a06fb7915b27f1959c58c0f6a6f06c2f018bdf4e \
  --image-uuid 25053f44-52cb-3f32-a138-8a3e9c49ae85 \
  --out /tmp/new-closed-replay.json --normal-interval
```

## Controlled timeout

The stopped [timeout capture](timeout/result.json) contains a single request
`28de4f77-04b6-4057-9e33-196cff9e8720` from dynamically verified PID 14185,
the same installed executable and image identity. The harness recorded a
controlled suspension of that exact process/request for 8.264417959 seconds;
the [log](timeout/renderer.ndjson) contains the same request's ordered start,
timeout and fallback, with `elapsed_ms=8397`. A strict
[single-request replay](timeout/replay.json) verified the saved fixture hash,
signature receipt, suspension and event order. This is an induced scheduling
delay, not a normal-load performance measurement.

Before this interval the operator had briefly displayed the timeout file in a
Finder preview sidebar. The sidebar was hidden before capture was armed; that
earlier activity is outside this interval and may have warmed or cached the
fixture. The retained interval itself has exactly one correlated request. The
operator's visible source-fallback observation must still be assessed separately.

The 374,062-byte timeout fixture is synthetic and is not duplicated in this
branch. [generate-fixtures.py](generate-fixtures.py), SHA-256
`137fec363957026ae543ce2e6f01d6301f010ffbd5d9e0d219ff8083d40beab6`, exactly
reproduces its SHA-256
`cf28f560b2f776a5721fa4aadc472d792e7bab6807e260db24143bff3ea268ac` using
nonce `a831f905`. It also reproduced the recorded closed and recovery fixture
hashes. To reproduce the timeout replay from a new local directory:

```sh
python3 research/pi-2.22-attended28/generate-fixtures.py /tmp/new-pi222-cases a831f905
python3 research/pi-2.22-attended28/capture_finder_case.py replay \
  --capture-dir research/pi-2.22-attended28/timeout \
  --fixture /tmp/new-pi222-cases/timeout/timeout-a831f905.md \
  --case timeout --extension /Applications/MarkWriter.app/Contents/PlugIns/MarkWriterQuickLook.appex \
  --cdhash a06fb7915b27f1959c58c0f6a6f06c2f018bdf4e \
  --image-uuid 25053f44-52cb-3f32-a138-8a3e9c49ae85 \
  --out /tmp/new-timeout-replay.json
```

## First recovery interval and restoration

The [first recovery capture](recovery-empty/result.json) was stopped with
an empty renderer log and `correlated: false`. It does not establish a
successful subsequent preview. A separate read-only macOS unified-log query
of the whole MarkWriter Quick Look renderer subsystem and category from
10:19:20 through 10:25:40 local returned only the three timeout request events
and no later renderer event in that window. Its [filtered output](timeout-to-restoration-unified.ndjson)
retains only timestamp, PID, process image path/UUID and event message. The
unified-log timestamps differ by roughly two milliseconds from the live-stream
timestamps; the request ID, PID, image identity and messages match. Log
retention/filtering and an empty capture do not prove what a person saw or
what another provider might have done.

The first exchange's [restoration journal](exchange-first/state.json),
[provider listing](exchange-first/provider-restored.txt) and
[watchdog record](exchange-first/watchdog.log) record the original 2.19.3
host and extension restored at `/Applications/MarkWriter.app`, matching their
saved component identities and the synthetic default-app/type fingerprints.
The original registration UUID changed from
`758753AA-8BEB-409C-8D61-81244BEB17AF` to
`38CA77F7-BD0C-44A0-944A-DF39D14DC050`. The exchange script, byte-identical
to [`exchange.py` at 1143ccd](https://github.com/rheiger/markWriter/blob/1143ccd/research/finder-exchange/exchange.py)
(SHA-256 `b586bd598be5f9b11dec133c1abc56532d303561d5614aad9c7a04252a7c9287`),
checks the saved app identities, sole provider listing and synthetic defaults
before recording `phase: restored`. This is not a claim about every user
setting or about unchanged registration UUIDs.

A [later read-only observation](exchange-first/subsequent-prepared-observation.txt)
at 09:28:43 UTC showed the same original path/version as sole provider but UUID
`8C0B27CC-2FBE-4761-A20C-C2097FE88D21`; a second exchange's prepared state
recorded that UUID and the same original app directory device/inode. The cause
of the UUID change between observations is not established. That later state
does not alter the first exchange's historical receipt.

The controlled timeout's visual fallback, next successful preview, other
diagram limits and the eventual second-exchange restoration remain separate
evidence requirements.
