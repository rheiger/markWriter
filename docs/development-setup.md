# Development environment: inspect, prepare, verify

For human developers and AI agents. Start here on a new machine or after changing
checkouts. Run commands from the repository root unless stated otherwise. Setup
prepares a development checkout; it does not authorize installing a release,
changing file associations, signing, publishing, or modifying user documents.

## 1. Inspect before changing the machine

On macOS:

```sh
sw_vers
uname -m
sysctl -in sysctl.proc_translated 2>/dev/null || true
xcode-select -p
xcrun --find clang
xcrun --show-sdk-path
df -h .
command -v git node npm rustup rustc cargo
git --version
node --version
npm --version
rustc --version
cargo --version
rustup show active-toolchain
```

Missing commands are findings, not a reason to run every installer. Check executable
paths as well as versions. On Apple silicon prefer a native arm64 terminal and
matching tools; a translated shell may report `x86_64` (translation flag `1`).
Record free space: frontend dependencies and Rust builds can consume several GB;
actual requirements depend on caches and build targets. Do not relocate or delete
other projects or caches without authorization.

Inspect the repository before installing dependencies:

```sh
pwd
git status --short --branch
git remote -v
git branch --show-current
git log -1 --oneline
```

Read [AGENTS.md](../AGENTS.md), [README.md](../README.md), both `package.json`
files, `.nvmrc`, `src-tauri/Cargo.toml`, and
[CI](../.github/workflows/v2-ci.yml). Those files own the version requirements.
At this revision Node 24+ and npm 9+ are required; CI uses Node 24.22.2 and Rust
1.90.0, with Rust 1.90 declared as the minimum. Prefer Node 24 and CI's Rust
version for a reproducible baseline. Do not upgrade dependencies as part of setup.

## 2. Clone or update safely

The configured upstream is GitHub, not GitLab. On a new machine:

```sh
mkdir -p ~/Dev
git clone https://github.com/rheiger/markWriter.git ~/Dev/markWriter
cd ~/Dev/markWriter
```

HTTPS permits public read access without copying private SSH keys. For pushing,
configure the developer's GitHub authentication separately; never print credentials
or copy another machine's private keys. Check Git author identity before commits.

For an existing checkout, preserve all tracked and untracked work first. Do not
overwrite a directory, automatically stash work, reset, clean, or force-push. With
a clean checkout on `main`, update using:

```sh
git fetch origin
git pull --ff-only origin main
```

If the branch differs, files would be overwritten, or fast-forward fails, inspect
and resolve that condition before continuing. Create a `codex/<task>` branch for
new work once the baseline is established.

Cloning excludes ignored/untracked files, app preferences/recovery, credentials,
and local archives. The original machine's `archive/`, `DebugFeedback/`, and
untracked old planning files need a separate transfer if wanted. They are not
prerequisites for building; do not treat old plans as the current backlog.

## 3. Install only missing prerequisites

- **macOS native tools:** if the checks above fail because Apple command-line tools
  are absent, run `xcode-select --install` and let the user complete Apple's UI.
  Verify `xcrun` again afterward. Full Xcode is needed for iOS work, not this
  desktop setup. Consult the official [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).
- **Node:** reuse a suitable installation. Otherwise install Node 24 using the
  machine's existing version manager, or the official [Node downloads](https://nodejs.org/en/download).
  Do not introduce a second package manager or run a blanket upgrade. Reopen the
  shell if needed and verify both Node and npm paths/versions.
- **Rust:** reuse rustup when present; otherwise use the official
  [Rust installer](https://rust-lang.org/tools/install/), reviewing its options.
  Avoid replacing another project's global default. For this shell, install and
  select the CI toolchain:

  ```sh
  rustup toolchain install 1.90.0 --profile minimal
  export RUSTUP_TOOLCHAIN=1.90.0
  rustc --version
  cargo --version
  ```

Keep that environment variable in every terminal running native commands. Match
updated CI requirements if they change. Do not copy old `node_modules`, Rust
`target/` directories or binaries between machines/architectures.

For Linux and Windows use the platform instructions in Tauri's prerequisites and
the repository's CI/package workflows. A successful macOS build does not qualify
those platforms or shell preview extensions.

## 4. Restore dependencies and verify the baseline

```sh
npm ci --prefix frontend
npm run frontend:test
npm run frontend:lint
npm run frontend:build
(cd src-tauri && cargo test --locked)
(cd src-tauri && node ../frontend/node_modules/@tauri-apps/cli/tauri.js build --debug --no-bundle --ci)
git status --short
```

The frontend lockfile and Cargo lockfile are tracked; do not regenerate them to
work around a failure. The root npm lockfile is ignored. The commands above use
the pinned frontend Tauri CLI and need no root npm install or global Cargo Tauri
CLI. Root convenience scripts such as `npm run dev` additionally need root
`npm install` and, where they call `cargo tauri`, a separate Cargo CLI; they are
not the recommended fresh-machine path.

Investigate failures with the exact command, versions and logs. Do not silently
skip a failed check or use dependency upgrades as a repair. These checks prove
unit/lint/build readiness, not installed-app or actual desktop acceptance.

## 5. Launch with isolated preferences and recovery

Use two terminals, each at the repository root. Terminal A:

```sh
npm run frontend:dev
```

Terminal B (with the selected Rust toolchain in its environment):

```sh
export RUSTUP_TOOLCHAIN=1.90.0
export MARKWRITER_PROFILE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/markwriter-dev.XXXXXX")"
printf 'Isolated profile: %s\n' "$MARKWRITER_PROFILE_DIR"
(cd src-tauri && node ../frontend/node_modules/@tauri-apps/cli/tauri.js dev)
```

Vite binds to `127.0.0.1:5173` and fails when occupied; inspect a conflict rather
than killing an unknown process or exposing the server to the LAN. The profile
variable redirects preferences/workspace recovery only. It is **not a filesystem
sandbox**: native dialogs and document writes still operate on real paths. Use
synthetic fixture copies in a temporary folder, never personal documents. Do not
install/copy the debug app into Applications or register preview handlers during
setup. Close the test app/server afterward; retain logs/profile until investigated
if anything failed.

Confirm typing, switching Code/WYSIWYG/Preview, and save/reopen with a synthetic
file if desktop interaction is available. Report exactly what was exercised;
otherwise mark desktop acceptance pending. A browser tab alone cannot validate
native file operations or menus.

## 6. Continue work and hand off

Read [architecture](architecture.md), [document ownership](document-ownership.md),
[preview correspondence](preview-correspondence.md), and current issues before
choosing a feature. Preserve the icon artwork and About credit. Release/tag,
signing/notarization, updater and installed-app changes require specific scope.

Report the checkout path, branch/commit, architecture, tool versions, installations
made, check results, profile path, and any remaining blockers. Distinguish local
checks, CI, installed-app checks and physical desktop acceptance. Stage only the
intended files; local feedback and archives must not enter commits accidentally.
