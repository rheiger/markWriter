$ErrorActionPreference = 'Stop'
# WebView2 150+ ignores external-driver debug arguments in elevated processes.
# Run only this test tree at Medium integrity, following the verified upstream fix:
# https://github.com/webdriverio/desktop-mobile/pull/637
$destination = Join-Path $env:RUNNER_TEMP 'markwriter-gsudo'
New-Item -ItemType Directory -Force $destination | Out-Null
$archive = Join-Path $destination 'gsudo.zip'
Invoke-WebRequest 'https://github.com/gerardog/gsudo/releases/download/v2.6.1/gsudo.portable.zip' -OutFile $archive
$expected = '21130bf178d7b9891207f00bff56f05b6b363ce9cec7b2d084e45fb12ee51f44'
if ((Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {
    throw 'gsudo archive digest mismatch'
}
Expand-Archive $archive -DestinationPath $destination -Force
$gsudo = Join-Path $destination 'x64/gsudo.exe'
& $gsudo --version
# Only the existing runner user receives Modify on this disposable workspace.
# Avoid the upstream example's broader Everyone grant.
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls $env:GITHUB_WORKSPACE /grant "${identity}:(OI)(CI)M"
if ($LASTEXITCODE -ne 0) { throw 'Could not grant the runner user workspace access' }
"MARKWRITER_GSUDO=$gsudo" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
