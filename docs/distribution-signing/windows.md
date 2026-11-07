# Windows: Authenticode

## Current release and first launch

The v2.5.1 x64 current-user NSIS installer is unsigned. Verify its origin and compare the release checksum, subject to the [checksum trust limitation](README.md). Windows may display an unknown-publisher or SmartScreen warning. If the user independently trusts the downloaded file and Windows offers the choice, **More info → Run anyway** is a per-file decision. Enterprise policy can block continuation; Windows 11 Smart App Control can block unsigned files without an override. Do not disable system protections to force installation. See [Microsoft's SmartScreen guidance](https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation).

## Future signing workflow

1. Obtain a publicly trusted code-signing certificate from an appropriate issuer and confirm its current identity-validation, key protection and hardware/cloud signing requirements. Choose an authorized timestamp service. Protect the private key in a suitable hardware or managed signing service; restrict its use and audit signing operations. A self-signed certificate does not establish public publisher trust.
2. Install the Windows SDK signing tools in an isolated release environment. Configure Tauri's `bundle.windows` `certificateThumbprint`, `digestAlgorithm` and `timestampUrl`, or a reviewed `signCommand` for the chosen provider. Tauri describes these options and supported services in its [Windows signing guide](https://v2.tauri.app/distribute/sign/windows/). The NSIS installer and its installed executable must both be signed and verified; check all other shipped executables as applicable.
3. Sign with SHA-256 and an RFC 3161 timestamp using the provider's supported workflow. As a generic illustration, with an identity already accessible to SignTool:

   ```powershell
   signtool sign /sha1 <CERTIFICATE_THUMBPRINT> /fd SHA256 /tr <TIMESTAMP_URL> /td SHA256 "C:\path\to\artifact.exe"
   signtool verify /pa /all /v "C:\path\to\artifact.exe"
   Get-AuthenticodeSignature "C:\path\to\artifact.exe" | Format-List Status,SignerCertificate,TimeStamperCertificate
   ```

   `/sha1` selects the certificate by thumbprint; `/fd SHA256` sets the file digest. Confirm valid identity, chain and timestamp in the verification output on both installer and extracted/installed executable. Use the provider's own tooling if a hardware or cloud service requires it. See Microsoft's [SignTool reference](https://learn.microsoft.com/windows/win32/seccrypto/signtool) and [timestamp guidance](https://learn.microsoft.com/windows/win32/seccrypto/time-stamping-authenticode-signatures).
4. Use a protected release environment and least-privilege, short-lived access to the signing service where possible; never log credentials or export a private key into source or build artifacts. Plan certificate renewal, revocation, compromise response and access removal. Do not sign unreviewed pull-request builds.

Signing identifies the publisher and protects signed content from alteration, but does not guarantee SmartScreen acceptance. Microsoft states that even OV/EV-signed new binaries can trigger reputation warnings; EV no longer grants immediate reputation. Test a downloaded final installer on clean supported Windows systems, record signature and timestamp evidence, exercise install, launch, edit, save, upgrade, uninstall and rollback, and preserve documents and profile. Failed verification or native acceptance blocks a signed-release claim. Keep the previous known-good installer for rollback and investigate before publishing a new candidate.
