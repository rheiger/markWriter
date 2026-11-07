# macOS: Developer ID and notarization

## Current release and first launch

The v2.5.1 Apple Silicon DMG contains a strictly verified **ad-hoc sealed** app. This verifies the seal but does not identify a publisher; it is neither Developer ID signed nor notarized. Browser quarantine behavior was not qualified. Get the intended release and compare its published checksum, recognizing the [checksum trust limitation](README.md). A user should proceed only after independently trusting its source and contents.

If macOS blocks a trusted app, first attempt to open it, then use **System Settings → Privacy & Security → Open Anyway** if offered and follow the prompts. Apple says this creates an exception for that app and the button is available for a limited time; managed policy may prevent it. Do not disable Gatekeeper globally or remove quarantine as a general workaround. See [Apple's guidance](https://support.apple.com/en-us/102445).

## Prerequisites and candidate workflow

A registered Apple developer account and installed Xcode do not by themselves establish paid Apple Developer Program membership, an active team, a Developer ID Application certificate with its private key, or notary credentials. Confirm these separately with the account holder. Xcode's selected command-line tools must support `notarytool`; [Apple no longer accepts `altool`](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution). Verify team, bundle identifier, private-key access and certificate validity before planning a signing run. Protect the key and limit who may use it.

1. Provision a **Developer ID Application** identity through Apple's supported process. For direct distribution, sign every nested executable and extension inside-out, enable hardened runtime, use a secure timestamp, and configure only required entitlements. Apple specifies these [notarization requirements](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution). Review entitlements and extension signatures separately; an ad-hoc identity is not a substitute.
2. The current `src-tauri/tauri.conf.json` explicitly uses `signingIdentity: "-"`. For a candidate, arrange a reviewed build configuration or `APPLE_SIGNING_IDENTITY` override; do not silently mistake the existing ad-hoc identity for Developer ID. Tauri documents identity selection and credentials in its [macOS signing guide](https://v2.tauri.app/distribute/sign/macos/). Test the exact configuration and ensure CI fails closed if the identity is unavailable.
3. Choose a supported notarization credential: an App Store Connect API key or an Apple ID with an **app-specific password** and team ID, per Tauri's guide. Store secrets in a protected CI environment, not source or command history. On ephemeral runners, restrict access to the key and remove temporary keychains and credential files after each job, including failure paths. Audit access and plan expiry, rotation and recovery.
4. Build the final DMG with the intended signing configuration, submit the actual distributable to Apple's notary service, wait for **Accepted**, inspect its log even on success, and staple and validate its ticket. Tauri can integrate notarization into its bundle step. For a separately controlled manual submission, after securely provisioning the named Keychain profile, the following are illustrative:

   ```sh
   xcrun notarytool submit /path/to/MarkWriter.dmg --keychain-profile "<profile>" --wait
   xcrun notarytool log "<submission-id>" --keychain-profile "<profile>" /path/to/notary-log.json
   xcrun stapler staple /path/to/MarkWriter.dmg
   xcrun stapler validate /path/to/MarkWriter.dmg
   ```

   These steps transmit the candidate to Apple and modify the DMG when stapling. They require an explicitly authorized release operation. Apple documents [submission, logs and stapling](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow) and recommends notarizing the outermost distribution container in [packaging guidance](https://developer.apple.com/documentation/xcode/packaging-mac-software-for-distribution).
5. Verify the final app and every nested component, for example `codesign --verify --deep --strict --verbose=2 /path/to/MarkWriter.app` and `codesign -dv --verbose=4 /path/to/MarkWriter.app`; inspect the actual authority, team, hardened runtime and timestamp. `--deep` verification is a supplement, not proof that every component has the intended identity and entitlements. Validate the stapled DMG, assess Gatekeeper on a clean target and test the actual quarantined download both online and offline. Record final post-staple hashes. Never modify signed content afterwards.

## Quick Look and acceptance

Quick Look is a separately scoped feature, not a claim about v2.5.1. If an extension is added, it is nested code with its own identifier, signing and entitlement requirements; account for sandbox, registration, supported document types and the host OS. Qualify clean installation, Finder discovery, preview behavior, upgrades, extension replacement and removal on each supported macOS version. A notarized host alone does not prove the extension works or is trusted.

Test normal launch, editing, saving, export, upgrade, rollback and recovery using the final downloaded DMG, ideally on a clean separate Mac as [Apple recommends](https://developer.apple.com/documentation/xcode/packaging-mac-software-for-distribution). Preserve documents and profile, keep the previous installer, and restore a separately backed-up profile only if needed. A failed seal, wrong identity, rejected or unstapled ticket, or failed native test blocks a trusted-distribution claim.
