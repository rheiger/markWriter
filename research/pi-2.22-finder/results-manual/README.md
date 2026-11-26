# Manual Finder trial — 26 November 2026

**Result: candidate Finder qualification remains inconclusive.** The human
operator used the existing Mac VNC connection and described the visible result;
the agent did not have access to the VNC canvas. The experiment used the
`19bd836` Finder-only research package documented in the parent README, not a
single integrated app/Finder release candidate. No user documents were used.

The staged candidate was registered at
`/private/tmp/markwriter-pi222-finder.4JogPG/19bd836/MarkWriter.app/Contents/PlugIns/MarkWriterQuickLook.appex`,
version 2.21.1, UUID `B653882C-356B-423F-9B13-052C9664F4B6`. Package,
executable and script hashes and strict seals were checked before registration.

1. With both candidate and original providers listed, the operator opened
   `01-sequence.md` and reported readable PlantUML source rather than a
   diagram. The interval recorded two start/completion pairs from the original
   `/Applications/MarkWriter.app/.../QuickLookPrototype` process, PID 65652,
   at 17:59:32–17:59:45 local time. It recorded **zero** requests from the
   staged executable. The pairs do not identify which response Finder showed.
2. The installed extension's registration was temporarily removed by its exact
   path while the restoration watchdog was active. The listing then showed
   only the candidate UUID and path. The operator opened fresh synthetic
   `07-sequence-retry.md` and again reported readable source, not a diagram.
   The renderer log interval contained **no events**, so it does not identify
   the provider responsible for that visible preview. Candidate registration
   alone did not establish Finder selection. No global cache reset, extension
   election or user process termination was performed.
3. The trial stopped without attempting the controlled timeout. Candidate
   registration and its LaunchServices host entry were removed; the original
   `/Applications/MarkWriter.app/.../MarkWriterQuickLook.appex` version 2.19.3
   was registered again and its strict code seal passed. The final listing has
   only that original path and no candidate. A filtered LaunchServices query
   succeeded and found no staged host. Eight synthetic fixture hashes match.
   All 44 synthetic file-type/default-app observations matched their baseline;
   the comparison stores only fingerprints to avoid publishing unrelated
   application details.
4. Re-registration generated a **new UUID**. The baseline was
   `C86EFCFB-7093-4CD6-A488-2B2A832B7592`; the first restored listing showed
   `42DE5E50-F867-4C1D-9334-1C5046C5B394`, and a watchdog retry generated
   `C080143B-2726-46BF-B11E-6758867D031A`. The watchdog was stopped after that
   retry to avoid repeated registration changes. The controller's strict
   original-UUID equality check therefore reported **restoration unproven**;
   the changed identifier is not concealed by the matching path and defaults.
5. After restoration, the operator opened fresh `08-restored-original.md` and
   reported the unique heading and readable source. Two start/completion pairs
   from the exact original installed executable, PID 86502, occurred during the
   interval at 18:05:24–18:05:27 local time. The older provider emits no request
   IDs, so this establishes original-provider activity during the selection
   interval, not which response produced the visible result.

Filtered NDJSON files retain only timestamp, process ID, executable path and
event message; unrelated system telemetry is excluded. An empty filtered file
means no matching renderer events appeared in the captured interval, not that
no other Quick Look provider was active. `provider-*.txt`, strict seal receipts,
fixture checks, the redacted defaults comparison and `restore.log` record the
state described above. `owned-processes-final.txt` is empty: no test log
streams, controller, timeout helper or watchdog remained when checked.

No packaged candidate Finder rendering, controlled timeout/fallback, or
post-timeout recovery is established by this attempt. Further tests require a
reliable way to select the candidate provider and a restoration approach that
accounts for macOS assigning a new registration UUID.
