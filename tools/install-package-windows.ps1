$ErrorActionPreference='Stop'
$installer=(Get-ChildItem src-tauri/target/release/bundle/nsis/*.exe | Select-Object -First 1).FullName
$destination=Join-Path $env:RUNNER_TEMP 'MarkWriter-installed'
# Current-user NSIS install uses the same normal installer in silent UI automation.
& $env:MARKWRITER_GSUDO --integrity Medium pwsh -NoProfile -File "$PSScriptRoot/run-installer-windows.ps1" -Installer $installer -Destination $destination
if($LASTEXITCODE -ne 0){throw 'NSIS installation failed'}
$binary=(Get-ChildItem $destination/*.exe | Where-Object Name -notmatch 'uninstall' | Select-Object -First 1).FullName
if(-not $binary){throw 'Installed executable not found'}
$profile=Join-Path $env:RUNNER_TEMP 'markwriter-profile'
New-Item -ItemType Directory -Force $profile | Out-Null
icacls $profile /grant "${env:USERNAME}:(OI)(CI)M" | Out-Null
"MARKWRITER_BINARY=$binary" >> $env:GITHUB_ENV
"MARKWRITER_PROFILE_DIR=$profile" >> $env:GITHUB_ENV
$webview=$env:MARKWRITER_WEBVIEW_RUNTIME
if(-not $webview -or -not (Test-Path -LiteralPath $webview)){throw 'Resolved WebView2 runtime not found'}
# Restrict test processes on this disposable runner; loopback remains available to
# the external driver. No firewall or WebView security protection is disabled.
foreach($program in @($binary,$webview)){
 # Avoid unspecified/broadcast endpoints and the unsupported IPv6 /0 prefix.
 # Two /1 prefixes still cover every IPv6 destination; IPv4 loopback is retained.
 foreach($address in @('0.0.0.1-126.255.255.255','128.0.0.0-255.255.255.254','::/1','8000::/1')){
  Write-Host "Restricting $program to offline test: $address"
  New-NetFirewallRule -DisplayName ('MarkWriter offline package test '+[guid]::NewGuid()) -Direction Outbound -Action Block -Program $program -RemoteAddress $address | Out-Null
 }
}
