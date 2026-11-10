$ErrorActionPreference='Stop'
$packageVersion=(Get-Content -Raw src-tauri/tauri.conf.json | ConvertFrom-Json).version
$installer=(Get-Item -LiteralPath "src-tauri/target/release/bundle/nsis/MarkWriter_${packageVersion}_x64-setup.exe").FullName
$destination=Join-Path $env:ProgramFiles 'MarkWriter'
# Exercise the default elevated machine install, without /D.
$installation=Start-Process -FilePath $installer -ArgumentList '/S' -Wait -PassThru
if($installation.ExitCode -ne 0){throw "NSIS installation failed ($($installation.ExitCode))"}
$binary=Join-Path $destination 'markwriter.exe'
if(!(Test-Path -LiteralPath $binary -PathType Leaf)){throw 'Default Program Files executable not found'}
$builtPreview=Join-Path $PSScriptRoot '../src-tauri/windows/MarkWriterPreview.dll'
$installedPreview=Join-Path $destination 'MarkWriterPreview.dll'
if((Get-FileHash -LiteralPath $installedPreview).Hash -ne (Get-FileHash -LiteralPath $builtPreview).Hash){
 throw 'Installed Explorer handler differs from the bundled build.'
}
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
