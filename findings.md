# 2.5.0-alpha1 findings

- Live fetched origin/main and HEAD both 4e1bbed. 23 user files inventoried before edits.
- External AI-Cache mounted/writable ~691GiB; internal ~31GiB.
- Worker controls expose requested terra/max; root model/tier cannot be changed via current tool.

- Built-in browser confirms same #46 loss as real-editor unit regression: code a  b→a b, tab→space, all-space span absent. Existing code/math fence still ordinary highlighting before integration.
- First detached cargo launch ended with shell; restarted as owned PTY session2969, external target verified. Vite session7642.

- Independent review caught table inline code backslash+pipe loss. Two regressions reproduced red; narrowly mark internal table-cell codec context and add required GFM pipe escape inside code. All37 codec tests now green.
- Math renders all4 representative blocks in actual built-in browser; root math codec/maps/export tests3 and typecheck pass. Font license metadata requires OFL supplement beyond KaTeX MIT.

## Final result

- Public2.5.0-alpha1 sourceee0b534c70ea53988a7e6263ae634e7f87d914cb viaPR51. Required46/47/50complete;44/48/49deferred.315frontend/10Node/21Mac+LinuxRust/26WindowsRust;48native22installedgroups/26code8technical20fontcases eachWin/Linux. All12anonymouspublicassetIDs/bytes andold10releases40assets15tags/latestpreserved.
- Evidence: /Users/rheiger/.codex/artifacts/markwriter-2.5.0-alpha1. All23userhashesmatch; userdata/preferences retained. Cleanup sourcebundle independentlyrestores;573files/3profilemembers verifiedbeforeowned-scratch deletion. Sharedguide LF normalization is release-output-only; canonical user Markdown is not normalized by that packaging operation.
- Worker calls explicitly configured gpt-6.1-terra/max in fresh contexts. Root model/effort override and service-tier controls were not exposed; no unsupported switch or fast-tier claim is made.

## 2.5.1 findings
- Release tooling is hardcoded toalpha1 prerelease; must align metadata/draft/manifest/published classification with authorized regular2.5.1 latest=false. Previous releases immutable.
- New native regression must exercise long aggregate document, not only existing26shortcodecases.
- Python pathological14Ki f-string observation201ms/plainfallback; inputbounds aren't hard latency guarantees. Cancellable highlighting worker is candidate next-round hardening.
