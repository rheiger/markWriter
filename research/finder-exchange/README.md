# Same-path Finder research trial

This console-user controller stages an exact SHA-256-pinned research DMG on the
Mac that owns the open VNC session. It verifies strict ad-hoc host and extension
seals, bundle IDs, versions and the executable and script hashes. The original
2.19.3 host and extension CDHashes must match independently observed input pins.
Obtain those with `codesign -dv --verbose=4` against the original installed host
and extension. The trial accepts candidate research metadata 2.21.1.

Compile the repo's `tools/quicklook-registration-probe.swift` with
`xcrun swiftc`. Use a new canonical private session pathname, such as
`/private/tmp/markwriter-exchange-<unique suffix>` on the Applications volume.
Keep the controller and compiled probe outside that new session directory.

```text
python3 exchange.py prepare SESSION DMG EXPECTED_DMG_SHA256 ORIGINAL_HOST_CDHASH ORIGINAL_EXTENSION_CDHASH PROBE
python3 exchange.py start SESSION
```

Prepare stages the candidate in a private directory under the name `holding`
and unmounts its DMG. It records the installed host and provider, code identities,
bundle inodes and redacted effective type/default-app fingerprints for 44 synthetic
files. Allow the trial operator to save work and quit the editor before starting.
Close open Quick Look panels. Start keeps its stdin open: wait for `READY`.
Use separate shells for tests. Any input line or EOF requests restore. The
controller waits up to 20 minutes before its detached watchdog attempts rollback.
It also checks for a dead or replaced controlling process. Keep the SSH session
alive through restoration. An independent shell may run:

```text
python3 exchange.py restore SESSION
```

The native Darwin `renamex_np(RENAME_SWAP)` operation always leaves both bundles
in place under distinct names. The original directory, metadata and inode remain
at `SESSION/holding` during the trial. The original moves back atomically on
restoration. A journal records the expected pair of inodes before mutation, so
recovery can recognize either side even following controller death. The
controller sends TERM exclusively to the one verified installed provider image
if running, using its PID start time, path, executable inode and UID. It never
signals the editor, Finder, WebKit or shared services. Do not open the editor
on real documents or select unrelated previews during the trial. If someone
opens the editor, save/quit normally then invoke restore. If verification fails
inspect the journal and both paths. Preserve them until the original seals, hash
checks, inode, sole default-election provider registration and synthetic defaults
have passed. macOS can issue a new registration UUID; the journal records both
and the comparison. A powered-off Mac cannot execute its watchdog.

The controller verifies installed registration only. Visible rendering and
timeout/recovery require separately correlated Finder observations. Use fresh
synthetic fixtures, the open VNC connection and logs including the candidate
executable path and request ID. Where both versions use the same path, verify
the actual running image's file inode independently against the installed
candidate binary. Record operator observations and exact timestamps separately.
Raw provider listings are local; defaults are stored as per-fixture hashes.
Keep trial receipts and remove only the verified candidate staging and task
artifacts after the original app is restored.
