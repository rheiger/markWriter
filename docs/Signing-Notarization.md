# Distribution: Signing & Notarization (macOS)

This guide explains what you need and how to sign and notarize the app for macOS distribution.

## Requirements
- Active Apple Developer Program membership (paid). A free account is not sufficient.
- Developer ID Application certificate installed in your Keychain (optional: Developer ID Installer if you ship a .pkg).
- Team ID.
- Notarization credentials for `notarytool`:
  - Recommended: App Store Connect API key (Issuer ID, Key ID, and the `.p8` private key file).

## One-time setup
1) Install Xcode Command Line Tools:
```bash
xcode-select --install
```
2) Create and install a Developer ID Application certificate
   - Go to `https://developer.apple.com/account/resources/certificates` → `+` → “Developer ID Application”.
   - Generate a Certificate Signing Request (CSR) via Keychain Access and upload it.
   - Download the certificate and double‑click to add to your login keychain.
   - In Keychain Access, export the certificate + private key as `.p12` with a password. Keep it secret.
3) Create an App Store Connect API key (recommended for CI)
   - `https://appstoreconnect.apple.com` → Users and Access → Keys → “+” → generate a new key.
   - Note the Issuer ID and Key ID. Download the `.p8` private key. Keep it secret.

## Local build, sign, notarize
1) Build the app
```bash
pyinstaller -y MarkWrite.spec
```
2) Sign the app with hardened runtime
```bash
codesign --force --deep --options runtime \
  --sign "Developer ID Application: YOUR NAME (TEAMID)" \
  dist/MarkWrite.app
```
3) Zip the app for notarization
```bash
ditto -c -k --sequesterRsrc --keepParent dist/MarkWrite.app dist/MarkWrite.zip
```
4) Submit for notarization and wait
- Using a stored keychain profile (create it once with `xcrun notarytool store-credentials`):
```bash
xcrun notarytool submit dist/MarkWrite.zip --keychain-profile "AC_PASSWORD" --wait
```
- Or using API key directly:
```bash
xcrun notarytool submit dist/MarkWrite.zip \
  --issuer "<ISSUER_ID>" --key-id "<KEY_ID>" --key "/path/to/AuthKey_<KEY_ID>.p8" \
  --team-id "<TEAM_ID>" --wait
```
5) Staple the ticket
```bash
xcrun stapler staple dist/MarkWrite.app
```
The app should now open on other Macs without the unidentified‑developer prompt.

## CI (optional)
If you want to automate signing/notarization in GitHub Actions, store secrets in the repo’s settings and reference them conditionally.

Recommended secrets:
- `APPLE_TEAM_ID`
- `APPLE_DEV_ID_CERT_P12` (base64 of your `.p12`)
- `APPLE_DEV_ID_CERT_PASSWORD`
- `AC_ISSUER_ID`, `AC_KEY_ID`, `AC_API_KEY` (the `.p8` contents; save as a secret and write to a file during the workflow)

YAML snippet (to embed into the macOS job after build):
```yaml
- name: Import Developer ID cert
  if: ${{ secrets.APPLE_DEV_ID_CERT_P12 !=  }}
  shell: bash
  run: |
    echo "$APPLE_DEV_ID_CERT_P12" | base64 --decode > $RUNNER_TEMP/cert.p12
    security create-keychain -p "" build.keychain
    security default-keychain -s build.keychain
    security unlock-keychain -p "" build.keychain
    security import $RUNNER_TEMP/cert.p12 -k build.keychain -P "$APPLE_DEV_ID_CERT_PASSWORD" -T /usr/bin/codesign
    security set-key-partition-list -S apple-tool:,apple: -s -k "" build.keychain
  env:
    APPLE_DEV_ID_CERT_P12: ${{ secrets.APPLE_DEV_ID_CERT_P12 }}
    APPLE_DEV_ID_CERT_PASSWORD: ${{ secrets.APPLE_DEV_ID_CERT_PASSWORD }}

- name: Codesign app
  if: ${{ secrets.APPLE_DEV_ID_CERT_P12 !=  }}
  run: |
    codesign --force --deep --options runtime \
      --sign "Developer ID Application: YOUR NAME (TEAMID)" \
      dist/MarkWrite.app

- name: Prepare API key for notarytool
  if: ${{ secrets.AC_API_KEY !=  }}
  shell: bash
  run: |
    printf "%s" "$AC_API_KEY" > $RUNNER_TEMP/AC_API_KEY.p8
  env:
    AC_API_KEY: ${{ secrets.AC_API_KEY }}

- name: Notarize app
  if: ${{ secrets.AC_API_KEY !=  }}
  run: |
    ditto -c -k --sequesterRsrc --keepParent dist/MarkWrite.app dist/MarkWrite.zip
    xcrun notarytool submit dist/MarkWrite.zip \
      --issuer "$AC_ISSUER_ID" --key-id "$AC_KEY_ID" --key "$RUNNER_TEMP/AC_API_KEY.p8" \
      --team-id "$APPLE_TEAM_ID" --wait
  env:
    AC_ISSUER_ID: ${{ secrets.AC_ISSUER_ID }}
    AC_KEY_ID: ${{ secrets.AC_KEY_ID }}
    APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}

- name: Staple ticket
  if: ${{ secrets.AC_API_KEY !=  }}
  run: |
    xcrun stapler staple dist/MarkWrite.app
```

Notes:
- Never commit certificates or keys. Use repository secrets.
- Replace the signing identity string with your actual identity from Keychain.
- You can gate these steps on `if:` so unsigned builds still work for forks or contributors.
