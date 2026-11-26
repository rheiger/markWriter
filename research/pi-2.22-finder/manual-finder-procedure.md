# Manual Finder qualification procedure — prepared, not yet executed

This procedure uses the already-open VNC connection to `aiger.q40.richie.ch`.
The human operator performs the Finder actions and reports what was visible;
the orchestrator performs the shell steps and captures logs. Do not report a
Finder result until both the operator observation and correlated logs exist.
The local automation interface cannot control the open VNC window.

## Starting state and scope

On the Apple-silicon Mac running macOS 27.2.1, the sole observed registered
provider is `com.markwriter.app.quicklook` version 2.19.3 at
`/Applications/MarkWriter.app/Contents/PlugIns/MarkWriterQuickLook.appex`, UUID
`C86EFCFB-7093-4CD6-A488-2B2A832B7592`. Its registration and synthetic
default-app observations were recorded before any changes. The staged
research app is version 2.21.1 with only its extension script modified; it is
not the integrated app candidate. Its research DMG has SHA-256
`5d44084cd7563357c671259a11dad8e40747a1cac24feb4ee17fef26e45946d1`;
its 9,829,675-byte script has SHA-256
`e1df0b12ba83249f00965f2251714b80fda9418a97f7646e6b5a1a43fc1fddd9`.
Its extension executable has SHA-256
`25771777a50b493a08862cd23b43afe1000e459a5c20a7a6f5d4b31e5ad2b761`, matching
the executable read from the mounted research DMG.
Both the staged app and extension passed strict ad-hoc seal verification.

The staged candidate and the installed provider share a bundle identifier.
Registering the candidate temporarily changes per-user LaunchServices/Quick
Look registration and may affect previews while the test is active. The
procedure restores the original registration and compares it, but successful
restoration cannot be assumed. Do not change extension elections, run global
cache resets, replace `/Applications/MarkWriter.app`, or touch user documents.

The task-owned working directory is
`/tmp/markwriter-pi222-finder.4JogPG`. It contains six unique synthetic
fixtures in `manual-fixtures/`, their initial hashes in
`manual-fixtures-before.sha256`, the original provider listing in
`manual-provider-before.txt`, and synthetic file-type/default-app baseline
observations in `manual-defaults-before.json`. The probe and timeout scripts
are staged in `manual-source/`. The registration fixture baseline was produced
with the repository's `tools/quicklook-registration-probe.swift`. No provider
was changed while preparing this procedure.

## Before the first Finder action

Keep one shell session open for the entire trial and run these commands on the
Mac. Confirm the hashes and both strict seals before registering anything.
Record complete command output in a task-owned evidence directory.

```sh
MWQ=/tmp/markwriter-pi222-finder.4JogPG
MW_APP="$MWQ/19bd836/MarkWriter.app"
MW_EXT="$MW_APP/Contents/PlugIns/MarkWriterQuickLook.appex"
MW_EXEC=$(/bin/realpath "$MW_EXT/Contents/MacOS/QuickLookPrototype")
MW_LS=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
MW_ORIGINAL=/Applications/MarkWriter.app/Contents/PlugIns/MarkWriterQuickLook.appex
mkdir "$MWQ/manual-evidence"
shasum -a 256 "$MWQ/MarkWriter-2.21.1-plantuml-finder-19bd836.dmg" "$MW_EXT/Contents/Resources/quicklook-render.js" "$MW_EXEC" | tee "$MWQ/manual-evidence/package-hashes.txt"
codesign --verify --deep --strict --verbose=2 "$MW_APP" 2>&1 | tee "$MWQ/manual-evidence/host-seal.txt"
codesign --verify --strict --verbose=2 "$MW_EXT" 2>&1 | tee "$MWQ/manual-evidence/extension-seal.txt"
pluginkit -m -ADvv -i com.markwriter.app.quicklook | tee "$MWQ/manual-evidence/provider-immediately-before.txt"
shasum -a 256 -c "$MWQ/manual-fixtures-before.sha256"
```

If the original listing is different from the recorded version/path/UUID,
stop and reassess rather than restoring an assumed baseline. If the candidate
hash or seals differ, stop. Only when ready for a brief temporary change:

```sh
"$MW_LS" -f "$MW_APP"
pluginkit -a "$MW_EXT"
pluginkit -m -ADvv -i com.markwriter.app.quicklook | tee "$MWQ/manual-evidence/provider-during.txt"
```

Record the candidate's newly reported UUID and exact path. Presence in this
listing does **not** show that Finder selected it. If the candidate does not
appear, stop and restore; do not force a global cache reset or claim success.

## Finder observations through the existing VNC

Ask the operator to close existing Quick Look windows and hide Finder's preview
pane so only one request is likely. In Finder use **Go → Go to Folder** and
open `/tmp/markwriter-pi222-finder.4JogPG/manual-fixtures`. Keep the exact
selected filename and the unique heading visible. The orchestrator starts a
fresh log stream before each selection interval, and stops that same stream
after the operator closes Quick Look. For example, for the first fixture:

```sh
/usr/bin/log stream --level info --style ndjson --predicate 'subsystem == "com.markwriter.app.quicklook" AND category == "renderer"' > "$MWQ/manual-evidence/sequence.ndjson" 2> "$MWQ/manual-evidence/sequence-log-error.txt" &
MW_LOG_PID=$!
```

After the stream is running, have the operator select `01-sequence.md`, press
Space, and report whether heading `PI222-SEQUENCE-A7F4` and a diagram showing
Alice, Bob, Request and Response are visible. Close Quick Look. Stop only the
owned log stream with `kill "$MW_LOG_PID"; wait "$MW_LOG_PID" || true`, then:

```sh
/usr/bin/python3 "$MWQ/manual-source/summarize-manual-finder.py" "$MWQ/manual-evidence/sequence.ndjson" "$MW_EXEC" | tee "$MWQ/manual-evidence/sequence-summary.json"
```

The analyzer requires exactly one start and one completion/fallback from the
exact staged executable and the same PID. The request ID does not encode the
filename; correlation also depends on the operator-controlled selection and
interval. If there are zero or multiple requests, the wrong executable, or the
visible result is unclear, mark that attempt inconclusive and use a fresh
interval rather than attributing another process's response to the fixture.
Repeat the same capture with a new filename/log for:

* `02-class.md`: heading `PI222-CLASS-B8E5`; User and Order, their private and
  public fields, and the labeled relationship should be visible.
* `03-rejected.md`: heading `PI222-REJECT-C9D6`; all four rejected fences
  should remain readable source, including the malformed class, missing theme,
  local include and loopback include. Scroll to check the final block.
* `04-oversized.md`: heading `PI222-OVERSIZED-D0C7`; source, rather than a
  diagram, should be visible through the end. Scroll to check `@enduml`.

These manual observations do not by themselves prove absence of file or
network access; the earlier canary results remain separate direct-WebKit tests.

## Controlled timeout and recovery

Close Quick Look and select `05-timeout.md` without opening it. Start a new
log stream into `timeout.ndjson` using the same command above, then arm the
watcher **before** asking the operator to press Space:

```sh
/usr/bin/python3 "$MWQ/manual-source/finder-delay-probe.py" "$MW_EXEC" "$MWQ/manual-evidence/timeout.ndjson" > "$MWQ/manual-evidence/timeout-injection.txt" 2>&1 &
MW_DELAY_PID=$!
```

The watcher waits up to 18 seconds for the first start event from the exact
staged extension executable, verifies the PID's current executable, pauses
only that PID for about 8.25 seconds, and has an independent 13-second resume
watchdog. Have the operator press Space promptly, then wait for the watcher:
`wait "$MW_DELAY_PID"`. If it reports no exact process, a mismatch or another
error, stop the trial and restore; do not manually pause other processes.

The operator records whether Finder visibly shows the Basic Markdown fallback
and the complete short PlantUML source headed `PI222-TIMEOUT-E1B8`, including
`TIMEOUTSENTINEL913`. Close Quick Look, stop the owned log stream, and run:

```sh
/usr/bin/python3 "$MWQ/manual-source/summarize-manual-finder.py" "$MWQ/manual-evidence/timeout.ndjson" "$MW_EXEC" --require-timeout | tee "$MWQ/manual-evidence/timeout-summary.json"
```

The analyzer additionally requires exactly one same-PID timeout log between
that request's start and fallback. If Finder issued extra requests, or the
visible source cannot be associated with the sole request, the attempt is
inconclusive. Capture the subsequent `06-recovery.md` in a new log interval;
the operator should see heading `PI222-RECOVERY-F2A9` and a rendered sequence
with `RecoveryRequest`, and the analyzer must report one completed request
from the same staged executable. This is an induced scheduling delay, not a
normal-load latency measurement.

## Mandatory restoration and verification

Close the test Quick Look window. Stop any owned log/watcher processes; if a
watcher was interrupted, verify its watchdog has resumed its exact process.
Then remove only the staged provider/registration and restore the original:

```sh
pluginkit -r "$MW_EXT"
"$MW_LS" -u "$MW_APP"
"$MW_LS" -f /Applications/MarkWriter.app
pluginkit -a "$MW_ORIGINAL"
pluginkit -m -ADvv -i com.markwriter.app.quicklook | tee "$MWQ/manual-evidence/provider-after.txt"
shasum -a 256 -c "$MWQ/manual-fixtures-before.sha256" | tee "$MWQ/manual-evidence/fixture-hashes-after.txt"
"$MWQ/manual-source/registration-probe" "$MWQ/manual-registration-fixtures" "$MW_APP" "$MWQ/manual-defaults-before.json" > "$MWQ/manual-evidence/defaults-after.json" 2> "$MWQ/manual-evidence/defaults-after-errors.txt" || true
/usr/bin/python3 "$MWQ/manual-source/compare-manual-restoration.py" "$MWQ/manual-defaults-before.json" "$MWQ/manual-evidence/defaults-after.json" "$MWQ/manual-evidence/provider-after.txt" "$MW_EXT" | tee "$MWQ/manual-evidence/restoration-comparison.txt"
```

Verify the candidate path is absent and the original 2.19.3 path and original
UUID are present. Compare `contentType`, `extensionTypes` and
`defaultApplication` for **every** synthetic fixture in the before/after JSON;
the probe's own checks deliberately exclude the Markdown editor default, so
checking every entry separately is necessary. Review any probe errors. Record
and investigate any mismatch; do not call restoration successful based solely
on `pluginkit` output. A restored listing does not prove actual Finder has
selected the original provider until separately observed and correlated.

Keep the logs, summaries, operator's observations, candidate identity,
hashes and restore evidence with the PI. The test app remains a research
package, and the app/export, timeout, review and any other unproven gates must
be reported separately.
