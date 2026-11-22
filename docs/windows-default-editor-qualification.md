# Windows Settings editor rollback qualification

Use a checkpointed Windows 11 x64 Hyper-V guest with its network adapter disconnected from every switch. Run the exercise through the guest console. Keep the checkpoint until the receipt is collected. Copy test inputs through the hypervisor and stage only synthetic fixtures. Leave shared drives and host applications outside the exercise.

Stage the following files together in a directory writable by the test account in the guest. Verify installer hashes and source provenance on the connected host before copying them.

- `tools/test-windows-offline-rollback.ps1`
- `MarkWriter-2.8.2-windows-x64.exe` and its published Windows manifest renamed to `manifest-2.8.2.json`
- `MarkWriter-2.9.2-windows-x64.exe` and its matching Windows manifest renamed to `manifest-2.9.2.json`

Close any existing MarkWriter windows and the Explorer Preview pane inside the guest. In ordinary Windows PowerShell inside the guest, change into the staging directory. Run the following command once for each phase, replacing `Prepare` with the phase name below. Approve UAC from the guest console for install, uninstall, and the synthetic fixture operations.

    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\test-windows-offline-rollback.ps1 -ConfirmOfflineGuest -Phase Prepare

| Phase | Guest console action |
| --- | --- |
| Prepare | Qualify the installed 2.8.2 package or install it over an older copy. In the app opened by the helper, check the version in About. Type the short draft printed by the helper in an empty unsaved document. Keep the app window open and return to the PowerShell prompt. A failed first Prepare can be retried after closing the synthetic editor. The helper archives the failed first receipt before retrying. The helper verifies the isolated workspace and stops that exact test process so the dirty draft remains on disk. |
| Baseline | Choose a competing text editor for `.md` in **Settings → Apps → Default apps**. Then double-click the named synthetic fixture in Explorer and report the actual editor and eight-character code. |
| Upgrade | Install the candidate, verify the draft in the reopened isolated app, then open the named fixture from Explorer. |
| Remove | Approve the uninstall prompts. The helper holds its own read handle on the candidate preview DLL for the first attempt and releases it before retrying. Open the named Explorer fixture after each attempt and report its editor and eight-character code. |
| Rollback | Reinstall 2.8.2, repeat the normal Explorer Open and confirm the isolated draft. Observe the Preview pane separately and report the heading it displays for the saved fixture. |

The helper reads the protected user choice before and after each ordinary Explorer Open. If the guest has no independent preview registration, it adds a synthetic current-user `.markdown` preview value so preservation can be checked separately from the actual `.md` preview. The synthetic value is a registry fixture. It has no implementing preview process. Restoring the guest checkpoint removes test state.

Collect `state/receipt.json` from the staging directory before reverting. The receipt contains synthetic file hashes, the package and source identifiers, the competing editor and its ProgID, and per-phase observations. It omits the protected registry hash and personal profile contents. Stop on a failed phase and collect its receipt and the console error before retrying from a clean checkpoint. The hosted installed-package lifecycle is a separate verification path.
