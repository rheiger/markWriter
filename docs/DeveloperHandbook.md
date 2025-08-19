# Developer Handbook

## Project setup
```bash
# macOS
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt
```

## Running locally
```bash
python markwrite.py
# Version
python markwrite.py --version
```

## Building apps
- macOS `.app`:
```bash
pyinstaller -y MarkWrite.spec
open dist/MarkWrite.app
```
- Windows (from Windows host):
  - PyInstaller: `pyinstaller -y MarkWrite-win.spec`
  - NSIS installer: install NSIS, then `makensis installer\windows\markwrite.nsi`

## File associations (macOS)
- Declared in `MarkWrite.spec` under `CFBundleDocumentTypes`.
- After building, move `MarkWrite.app` to `/Applications`.
- To refresh Launch Services:
```bash
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f -R "/Applications/MarkWrite.app"
```

## Release process
1) Bump version in `markwrite.py` and `MarkWrite.spec`.
2) Update `README.md`, `How-To.md` if needed.
3) Commit with a release message and tag `vX.Y.Z`.
4) Push main and tags; CI will build artifacts and publish on tags.

**Current version**: v0.2.4 (build 000033)

## CI overview
- Workflow: `.github/workflows/build.yml`
- Jobs:
  - macOS: builds `.app`, zips, uploads artifacts, publishes on tags
  - Windows: builds one-folder zip and NSIS installer
  - Linux job placeholder (disabled) – consider AppImage later
- Smoke tests: `python markwrite.py --version`

## Code style & conventions
- High-verbosity, readable code; explicit names
- Early returns, minimal nesting
- Avoid comments for trivial code; document “why” when non-obvious

## Troubleshooting
- WebEngine trust_store_mac errors: benign Chromium logs
- Blank page when opening via Finder: handled by app-level FileOpen and deferred markdown injection; ensure you’re on the latest version and the app is in `/Applications`.
- Gatekeeper blocks: right‑click → Open, or see `docs/Signing-Notarization.md` to sign/notarize.

