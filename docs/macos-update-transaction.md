# Qualify same-path macOS replacement and rollback

The qualification target is Apple silicon macOS with two user-owned copies of
MarkWriter on the same local volume. The installed app's immediate parent must
belong to the current user. A private staging directory beside that app holds
the second bundle and the transaction journal. The tool runs at ordinary user
privilege and requires filesystem support for Darwin's atomic swap.
[Apple volume support for swap renaming](https://developer.apple.com/documentation/foundation/urlresourcevalues/volumesupportsswaprenaming)

Use an isolated account or disposable VM, synthetic documents and a temporary
`MARKWRITER_PROFILE_DIR`. Before staging an update package, authenticate its
exact release, version, platform and bytes outside this tool. The bundle and
nested Quick Look ad hoc seals verify local integrity. Trust in the delivery
channel comes from the signed artifact policy tracked in
[#59](https://github.com/rheiger/markWriter/issues/59).

## Prepare a disposable A/B pair

1. Make a private directory at a canonical absolute path on the target volume.
   Copy the earlier authenticated build to `MarkWriter.app` in that directory.
   Use a copy independent of any app already installed on the machine.
2. Create `.MarkWriter.app.update` beside `MarkWriter.app` with mode `0700`.
   Copy the newer authenticated build into it as `staged.app`. Keep the staging
   bundle unregistered. Keep this directory and its contents private to the
   current account throughout the transaction.
3. Start the earlier build with the isolated profile. Open a saved synthetic
   Markdown document, leave a second synthetic draft in recovery, and record
   their state. Quit the selected editor and close its Finder previews. Keep
   both apps closed while the transaction runs.

Run the dry run and inspect the exact paths and versions. Replace the path and
versions here with the prepared pair:

```sh
python3 tools/update-markwriter-macos.py \
  --app '/private/tmp/markwriter-ab/MarkWriter.app' \
  --installed-version 2.13.3 --candidate-version 2.14.3
```

Repeat with `--apply` to perform replacement. The tool verifies both app
bundles and their extensions, then records their exact identities. It
unregisters the old path when applicable and independently checks that its
PlugInKit record is gone before exchanging the two directories. It verifies the
new locations and re-registers the selected path. The final PlugInKit check
confirms path presence. Confirm the active provider and version in Finder. The checkout tool and
`uninstall-markwriter-macos.py` share the same per-app lock. The transaction
only uses registration commands for the selected app path.

Launch the app at the same path with the isolated profile. Check the version in
About, the saved document's bytes and the restored draft. Exercise Finder Space
on a fresh synthetic Markdown file and record the provider and extension version.
Check that any competing preview registration still points to its original
location and that the staged copy is absent from PlugInKit.

## Recover or roll back

After an interruption, run the same dry run again to inspect the pair. If the
journal and both proofs match, repeating `--apply` converges to the newer version
and repairs the selected registration. A retry after an interrupted swap
syncs both directories before repairing registration. The inverse operation
uses the same original version arguments plus `--rollback --apply`. Both bundles must remain
at their recorded locations so the tool can identify them. A swapped-in bundle
from another location, even one with the same version, fails the identity check.

The older bundle stays in the staging slot after replacement. The newer bundle
stays there after rollback. Keep the journal and the parked bundle until the
trial is complete. When a filesystem or registration error persists, record
the dry-run output and inspect the selected directory and stage before any
manual repair. A failure while registering can leave the selected bundle at
its requested version with registration unfinished. Close the editor and
previews before retrying or rolling back.

## Verification

The macOS quality job builds ad hoc sealed synthetic Mach-O A/B bundles in a
temporary directory, performs the real filesystem swap, resumes after a
simulated interruption, and checks the executed version at the original path
before replacement and after rollback. Registration calls are intercepted in
that test. The fault-injection tests also verify directory identity, journal
validation, competing registrations and retained profile bytes with mocked
native operations.

Installed MarkWriter recovery and actual Finder and Launch Services effects
require the disposable desktop trial above. System-owned install locations,
unprivileged eligibility checks in the app, staging from downloaded artifacts,
the app's recovery checkpoint and relaunch, and Windows and Linux lifecycle
qualification remain outside this tool.
