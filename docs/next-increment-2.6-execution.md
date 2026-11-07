# Execution locations and model setup

Checked 7 November 2026. These are startup instructions, not evidence that development or signing has begun. Read [the plan](next-increment-2.6-plan.md), then use [the prompts](next-increment-2.6-prompts.md).

## Recommended choice

**Use an isolated checkout on `/Volumes/AI-Cache/temp/MarkWriter/` now**, or cloud for portable code plus a Mac for native acceptance. External storage has roughly 685 GiB free versus 26 GiB internal at the check. This uses the already configured Mac/Xcode and avoids waiting for Time Machine reclamation. Keep headroom for OS temporary files, memory swap and logs: redirecting Cargo alone does not move every write.

`rimair5` is a credible second Mac: read-only SSH succeeded, macOS 27.3 arm64, Xcode selected, about 263 GiB free. The app-bundled Codex executable exists, but standard Node/npm/Cargo locations and the project checkout were absent. Its tools and actual supported target need setup/verification before use. Shared Screen enables human native acceptance; it does not prove this chat's computer-use tool can control that remote session.

No snapshots were deleted, cache roots moved, dependencies installed or remote development started during planning. Do not thin/delete Time Machine snapshots or change backup policy for this task.

## A. External disk on this Mac

After this planning branch is pushed, run in a terminal. Use one run root and one checkout per orchestrator. The example intentionally refuses an existing run root rather than overwriting work:

```sh
export MW_RUN_ROOT="/Volumes/AI-Cache/temp/MarkWriter/2.6-$(date +%Y%m%d-%H%M%S)"
test -d /Volumes/AI-Cache/temp/MarkWriter || exit 1
test ! -e "$MW_RUN_ROOT" || exit 1
mkdir -p "$MW_RUN_ROOT"/{tmp,cache/npm,cache/cargo,targets,evidence}
export TMPDIR="$MW_RUN_ROOT/tmp"
export npm_config_cache="$MW_RUN_ROOT/cache/npm"
export CARGO_HOME="$MW_RUN_ROOT/cache/cargo"
export CARGO_TARGET_DIR="$MW_RUN_ROOT/targets/integration"
git clone --branch codex/2.6-planning https://github.com/rheiger/markWriter.git "$MW_RUN_ROOT/repo"
cd "$MW_RUN_ROOT/repo"
git switch -c codex/2.6-native-integration
npm install
npm --prefix frontend ci
rustup toolchain install 1.90.0 --profile minimal
export RUSTUP_TOOLCHAIN=1.90.0
rustc --version
```

Do not run the broad `npm run setup`/`clean` scripts against the original checkout. Set Xcode `-derivedDataPath "$MW_RUN_ROOT/targets/xcode"` in future extension builds. Keep frontend dependencies in the external clone. Isolate app profiles and downloads in the owned run; do not replace `/Applications/MarkWriter.app`. `CARGO_HOME` relocation may redownload dependencies; it does not automatically relocate Rustup/toolchains or GUI-launched Xcode/Codex caches. Do not move shared roots mid-session. Monitor `df -h / /Volumes/AI-Cache`, serialize native builds and stop heavy work if internal space becomes unsafe. A practical initial reserve is 15 GiB internal, with a higher reserve if observed swap/temp use needs it; this is an operational estimate, not a universal build minimum.

**Prefer launching the current app-bundled CLI from the same terminal**, so it inherits these environment variables. Select **gpt-6.1-sol, Medium, normal/default speed** and paste product prompt A. An already running GUI app does not inherit the exports merely because you open the checkout there. If using a new Codex app session instead, require the agent to set these paths in every actual build/test process and verify them before installing or building; opening the external project alone does not relocate caches or OS temporary writes.

```sh
/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex \
  -C "$MW_RUN_ROOT/repo" -m gpt-6.1-sol \
  -c 'model_reasoning_effort="medium"' -c 'service_tier="default"' \
  -c 'agents.default_subagent_model="gpt-6.1-terra"' \
  -c 'agents.default_subagent_reasoning_effort="high"' \
  -c 'agents.max_concurrent_threads_per_session=3'
```

Paste prompt A once interactive. Do not add bypass-approval or bypass-hook flags. Verify accepted configuration/model availability at startup and inspect worker routing. Check the actual `TMPDIR`, npm cache, Cargo home/target and selected Rust version in worker/build processes too; setting `RUSTUP_TOOLCHAIN` selects the toolchain without changing a shared default. The command is a prepared example, not executed here. At inspection, `/opt/homebrew/bin/codex` was **0.41.0**, while the app-bundled binary was **0.167.0-alpha.3.2**; plain `codex` may invoke the obsolete client. Use the verified current client or deliberately update it separately. A path can change with an app update, so check `--version`/`--help` first.

The official [subagent configuration](https://learn.chatgpt.com/docs/agent-configuration/subagents) supports explicit model/effort or defaults, with service tier inherited from the root. Exact availability depends on client/account. Do not silently substitute a fixed older `terra-worker` profile or claim a tier/model switch when controls are absent. Saved local config currently requests sol/medium/default; that is not proof of a particular running chat's identity. Workers in this planning session were explicitly spawned as terra/high.

## B. Codex Cloud

Use cloud to remove local build/cache pressure for frontend, shared parsers, tests, Rust portable modules, benchmarks, docs and PR preparation. First verify the actual environment OS and available tools. A non-Mac cloud environment cannot execute Xcode/Finder or qualify the native macOS menu/Quick Look/signing path; use a Mac and the existing CI platform matrix for those gates. A cloud UI test also does not establish Windows shell integration.

Current official setup: **Work in → Cloud → Select environment → Create environment**, select `rheiger/markWriter`, let setup inspect/install/test, review and **Publish**, then start a new task using that environment. You can also manage it under Settings → Codex Cloud → Environments. Repository access and Git push permissions must be available separately. Local files, app sessions, VPN and sign-ins are not automatically transferred. See [cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environments) and [environment modes](https://learn.chatgpt.com/docs/environments/modes).

Give the environment setup agent prompt B. Required baseline:

- Checkout the pushed planning branch and report exact base SHA. Do not assume local untracked `Samples/`, `DebugFeedback/` or private release evidence is in Git; use synthetic fixtures. Install no signing credentials.
- Node 24.22.2, npm, Rust 1.90.0 and locked dependencies matching existing CI. Root uses `npm install` because its lockfile is untracked; frontend uses `npm --prefix frontend ci`.
- On an actual Ubuntu 26.04 disposable environment, review then use `bash tools/setup-linux-packages.sh package`; it installs desktop/WebKit dependencies and deliberately adjusts Azure mirror URLs. It requires sudo and is not portable to other distributions. If the cloud base differs, adapt documented distro prerequisites without representing it as Ubuntu26.04 package acceptance.
- Run frontend lint/typecheck/tests/build, Node tool tests (`node --test tools/*.test.mjs`) and Rust `cargo test --locked --manifest-path src-tauri/Cargo.toml` after required frontend assets exist. Report missing GUI/WebKit/toolchain prerequisites rather than inventing a pass.
- Allow package registries/toolchain downloads and primary-source documentation as needed. Grant only repository scope needed for branches/PRs; no Apple/Windows/update signing secrets. Keep network restrictions explicit. Publish the tested setup, not an untested install script.

Then select sol/medium and normal/default speed if offered, paste prompt A, and require explicit terra/high routing. Verify cloud supports that control and worker concurrency in your account. If it does not, use the external Mac/current local client for the requested exact orchestration rather than claiming equivalent configuration. Cloud produces a branch and handoff; prompt D continues Mac acceptance at the exact commit. Do not ask a cloud agent to SSH into the private LAN or upload private profiles merely to imitate local access.

## C. MacBook Air `rimair5`

Best native alternative when this Mac's internal headroom is inadequate. Prefer running the orchestrator **on rimair5**, using its Codex app and Shared Screen for native acceptance. Do not run a second product orchestrator against the same worktree.

1. In Shared Screen, verify developer identity, current Codex version/model options, Xcode license/components, Node24/npm and Rust1.90. A read-only check found Xcode and Codex but not conventional Node/Cargo installs; install missing tools deliberately using current official installers. No assumption of transferred Codex/Git authentication.
2. Clone the pushed planning branch into a new owned directory, for example `~/Dev/markWriter-2.6`; use a fresh product branch. Keep the original machine's untracked files/profiles and release artifacts on their owner host. Transfer code through Git; use an explicitly inventoried source bundle if network authentication is unavailable. Never copy credentials/keychains as part of a project transfer.
3. Create per-run target/evidence/profile directories on rimair5; set Cargo target, npm cache and Xcode DerivedData there. Confirm free space before builds and keep the Mac awake through its normal supported user settings during a planned run.
4. Select sol/medium/default and terra/high workers; paste prompt A or prompt D for acceptance only. Native checks on macOS27.3 supplement, rather than replace, the supported release baseline and CI macos-26.
5. Return branch/commit, test results, exact candidate installer hashes and sanitized evidence. Preserve private profiles locally. Clean only owned scratch after retained evidence/recovery and user-data checks.

## Transfer and finish

One product orchestrator owns the branch. Cloud→Mac handoff must record base/head SHA, changed paths, tests actually run, missing native gates, fixture hashes, commands and model-routing limitations. Mac acceptance is tied to the same app payload; a source or package change invalidates affected proof. Signing docs can proceed in an independent branch/session restricted to `docs/distribution-signing/`; root owns README integration to avoid conflicts.

Commit/push portable work for review; do not merge or publish a feature release under the planning request. Preserve historical tags/releases/assets/latest. Retain one accepted installer set and evidence, prove source recovery, then delete only inventoried owned scratch. Do not use repository cleanup to erase unrelated dirty/untracked files or shared caches.
