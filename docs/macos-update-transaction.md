# Qualify same-path macOS replacement and rollback

The qualification target is Apple silicon macOS, at ordinary user privilege, on
a volume that supports Darwin's atomic swap. Use a disposable VM or an isolated
desktop account with no personal documents. The trial changes registrations for
its own synthetic installation and its competing copy. It launches the ordinary
MarkWriter binary with a separate preferences and recovery profile and outbound IP
denied. [Apple volume support for swap renaming](https://developer.apple.com/documentation/foundation/urlresourcevalues/volumesupportsswaprenaming)

## Run the installed-app trial

Obtain an earlier build and a newer candidate from independently authenticated
artifacts. Retain the release versions, provenance, and hashes of the exact
artifacts. Extract the app copies outside your regular installation. Both must
have a strict whole-app seal and a sealed bundled Quick Look extension. Ad hoc
seals establish local bundle integrity. Authenticate the distribution separately
through the update artifact trust policy. The regular hosted package candidate
does not have a whole-app seal. [Update artifact trust](update-artifact-trust.md)

Run the tool from the checkout, using absolute canonical paths and the actual
versions. Use the second path for the newer build being qualified.

```sh
python3 tools/qualify-update-markwriter-macos.py \
  --prior 2.13.3 '/absolute/path/baseline/MarkWriter.app' \
  --candidate 2.14.3 '/absolute/path/candidate/MarkWriter.app'
```

The tool creates a fresh user-owned directory under `/private/tmp`. It verifies
both bundles, the exact app and extension versions, the strict nested seals, and
the arm64 app and extension executables. It uses separate copies for the
installed app, the private staging slot and the competing provider. Follow the
editor and Finder prompts for each stage.

| Stage | Automatic checks | Operator evidence |
| --- | --- | --- |
| Baseline A | Strict seals, selected registration, saved fixture and active untitled dirty draft in the isolated workspace | About shows A. Open the supplied saved fixture and type the synthetic draft. Use Finder Space on the fresh Markdown fixture. |
| Upgrade B | Simulated interruption after the atomic exchange, dry-run inspection, retry, repeated apply, B at the original path, A in staging, competing path retained, and unchanged document, workspace and preferences bytes during the transaction | About shows B. Confirm the saved tab and dirty draft reopened, then exercise the B Finder fixture. |
| Rollback A | Same interruption, retry, repeat, data and path checks for the inverse swap. B remains parked and unregistered. | About shows A. Confirm the saved tab and dirty draft reopened again, then exercise the rollback Finder fixture. |

The runner closes only the editor process it started after validating the dirty
workspace. This preserves the synthetic draft for the next launch without
selecting Save or Discard. The interrupted transaction uses the real swap and
stops before re-registration. This exercises restart of the transaction at that
boundary. The test does not simulate power loss.

### Finder provider evidence

Start this command in a second Terminal before opening each fresh preview.
Disable Finder's Preview pane to avoid rendering an extra file before the Space
preview. Save the relevant renderer event with the trial evidence. The provider
logs the renderer start and completion at info level.
[Apple unified log tools](https://developer.apple.com/documentation/os/viewing-log-messages)

```sh
/usr/bin/log stream --level info --style json \
  --predicate 'subsystem == "com.markwriter.app.quicklook" AND category == "renderer"'
```

After opening the fixture with Space, enter the heading shown in Finder and the
`processImagePath` of its fresh renderer event at the prompts. The expected
process is the selected app's
`Contents/PlugIns/MarkWriterQuickLook.appex/Contents/MacOS/QuickLookPrototype`.
The runner checks the operator-supplied path against the selected bundle and
verifies the extension seal and version. PlugInKit lists registered paths and
cannot establish which provider rendered the preview. If Finder chose another
provider or no fresh event establishes the provider, retain the evidence and
mark the phase incomplete. Close the preview and return Finder to a different
folder after each phase. If a selected Quick Look process remains active, allow
it to exit before retrying the transaction.

Collect `receipt.jsonl`, the editor logs and the selected Finder event for each
phase. The receipt contains automated seal, path, registration and fixture
checks alongside the operator's observations. A `complete` event requires all
three stages. Record the macOS build, the input artifact provenance and hashes,
and any missing evidence alongside the receipt.

## Inspect or resume an interrupted trial

Keep the journal, staged app and logs until diagnosis is complete. Run the
lower-level helper without `--apply` to inspect the exact generated
installation path and transaction. Use the original version arguments for both
directions.

```sh
python3 tools/update-markwriter-macos.py \
  --app '/private/tmp/markwriter-update-trial-REPLACE_ME/MarkWriter.app' \
  --installed-version 2.13.3 --candidate-version 2.14.3
```

Close both editor and preview processes. If the journal and both proofs match,
repeat with `--apply` to finish replacement, or with `--rollback --apply` to
restore the original version. If the swap already occurred, retry syncs both
directories and repairs the selected registration without swapping again. The
helper rejects substituted copies even if the candidate version matches. The
runner's installed smoke trial starts in a fresh directory each time. An
interrupted run's manual recovery stays with its own receipt.

## Remove the trial registrations

After saving evidence, close the editor and all previews of trial fixtures and
move Finder outside the trial directory. A disposable VM can be reverted to its
clean checkpoint. For an isolated account, use the exact trial directory printed
by the tool to unregister only the two generated app copies. Keep both bundles
in place until registration cleanup is confirmed.

```sh
trial='/private/tmp/markwriter-update-trial-REPLACE_ME'
lsregister='/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
for app in "$trial/MarkWriter.app" "$trial/Competing.app"; do
  /usr/bin/pluginkit -r "$app/Contents/PlugIns/MarkWriterQuickLook.appex"
  "$lsregister" -u "$app"
done
/usr/bin/pluginkit -m -ADvv -i com.markwriter.app.quicklook
```

A copy that never registered can report no plug-in at its path. Check the query
afterward for absence of both trial paths and the staging path. Preserve records
for all unrelated paths. If the query still reports trial paths, retain the
directory and diagnose those entries before removing the trial copies.

## Verification

The macOS quality job builds ad hoc sealed synthetic Mach-O A/B bundles in a
temporary directory. It performs the real atomic swap and resumes after a
simulated interruption. It verifies the executed version at the same path
before replacement and after rollback. Registration calls are intercepted in
that test. The mocked tests also cover the qualification receipt, rejected
provider paths and invalid workspace evidence.

Qualifying a real install requires running the desktop trial with both sealed
MarkWriter builds. System-owned installation paths, the app-controlled recovery
checkpoint and relaunch, authenticated package downloads, and Windows and
Linux lifecycle qualification are separate gates.
