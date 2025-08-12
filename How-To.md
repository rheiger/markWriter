# How-To: Install and Use MarkWrite on macOS

This guide explains, step-by-step, how to install and use MarkWrite on a Mac.

MarkWrite is a minimal Markdown editor built with Python and Qt (PySide6). You can either run it directly from source, download a prebuilt app, or build your own double-clickable macOS app.

---

## Option 0: Download a prebuilt app (recommended)

1) Go to the Releases page: [Latest release](https://github.com/rheiger/markWriter/releases/latest)
2) Download `MarkWrite-0.0.8-macOS.zip` (older versions are superseded).
3) Unzip it and move `MarkWrite.app` to your `Applications` folder.
4) On first run, you may need to right-click the app and choose “Open” due to Gatekeeper.

---

## Option 1: Run from source (simplest)

1) Install Python 3.11 or newer
- If you are not sure, open Terminal and run: `python3 --version`
- If you need Python, download from `https://www.python.org/downloads/macos/` and install.

2) Download MarkWrite
- Visit the repository page: `https://github.com/rheiger/markWriter`
- Click "Code" → "Download ZIP", then unzip it (or clone it if you use Git).

3) Open Terminal and go to the project folder (replace the path if needed):
```bash
cd ~/Downloads/markWriter-main
```

4) Create and activate a virtual environment:
```bash
python3 -m venv .venv
source .venv/bin/activate
```

5) Install dependencies:
```bash
pip install -r requirements.txt
```

6) Run the app:
```bash
python markwrite.py
```

The MarkWrite window should appear.

---

## Option 2: Build a double-clickable macOS app

This produces a `MarkWrite.app` you can open from Finder like a normal application.

1) Complete steps 1–5 from "Run from source".

2) Build the app:
```bash
pyinstaller -y MarkWrite.spec
```

3) Open the app:
```bash
open dist/MarkWrite.app
```
Or open Finder, go to the project’s `dist` folder, and double-click `MarkWrite.app`.

### First-launch security note (Gatekeeper)
Because this app is not code-signed/notarized yet, macOS may warn that it’s from an unidentified developer.

If you see that warning:
- Right-click (Control-click) `MarkWrite.app` → choose "Open" → then click "Open" again in the dialog.
- Or go to System Settings → Privacy & Security → scroll to the Security section and click "Open Anyway".

---

## Optional: Code signing and notarization (for developers)
To distribute the app without the Gatekeeper warning, you need an Apple Developer account and a Developer ID Application certificate.

Prerequisites:
- Xcode command line tools installed (`xcode-select --install`).
- Apple Developer account and a Developer ID Application signing identity.
- Set up `notarytool` with a keychain profile (e.g., `AC_PASSWORD`). See Apple’s docs for `xcrun notarytool store-credentials`.

Steps:
1) Build the app using PyInstaller (see Option 2).
2) Zip the app for notarization:
```bash
ditto -c -k --sequesterRsrc --keepParent dist/MarkWrite.app dist/MarkWrite.zip
```
3) Sign the app with hardened runtime:
```bash
codesign --force --deep --options runtime --sign "Developer ID Application: YOUR NAME (TEAMID)" dist/MarkWrite.app
```
4) Submit for notarization and wait:
```bash
xcrun notarytool submit dist/MarkWrite.zip --keychain-profile "AC_PASSWORD" --wait
```
5) Staple the ticket to the app:
```bash
xcrun stapler staple dist/MarkWrite.app
```
Users should now be able to open the app without bypass prompts.

---

## Basic usage
- File → New: start a new document
- File → Open: open an existing `.md` (Markdown) file
- File → Save / Save As: save your work to `.md`
- File → Export as HTML: save the current document as an `.html` file
- Help → About: show app information

Tip: An • (dot) next to the filename in the title bar means you have unsaved changes.

---

## Internet requirement (for now)
The editor UI (Toast UI Editor) is loaded from a CDN. You need an internet connection for the editor to appear. Offline assets may be added in a future version.

---

## Troubleshooting
- "Can’t be opened because Apple cannot check it for malicious software": see the First-launch security note above.
- Terminal shows messages like `trust_store_mac.cc` or "TextSelection endpoint…": these are benign messages from the underlying web engine and can be ignored if the app runs.
- If the app does not start, try updating dependencies:
```bash
source .venv/bin/activate
pip install -U pip
pip install -U -r requirements.txt
```

---

## Uninstall / Remove
- If you built the app: delete the `dist/` folder (and `build/` if present).
- If you ran from source only: no installation was made; simply delete the project folder.

---

## Version
MarkWrite 0.0.8 (build 000017)
