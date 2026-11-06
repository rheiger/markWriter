$ErrorActionPreference='Stop'
$installer=(Get-ChildItem src-tauri/target/release/bundle/nsis/*.exe | Select-Object -First 1).FullName
$destination=Join-Path $env:RUNNER_TEMP 'MarkWriter-installed'
# Current-user NSIS install uses the same normal installer in silent UI automation.
& $env:MARKWRITER_GSUDO --integrity Medium pwsh -NoProfile -Command "`$p=Start-Process -FilePath '$installer' -ArgumentList @('/S','/D=$destination') -Wait -PassThru;exit `$p.ExitCode"
if($LASTEXITCODE -ne 0){throw 'NSIS installation failed'}
$binary=(Get-ChildItem $destination/*.exe | Where-Object Name -notmatch 'uninstall' | Select-Object -First 1).FullName
if(-not $binary){throw 'Installed executable not found'}
$profile=Join-Path $env:RUNNER_TEMP 'markwriter-profile'
New-Item -ItemType Directory -Force $profile | Out-Null
icacls $profile /grant "${env:USERNAME}:(OI)(CI)M" | Out-Null
"MARKWRITER_BINARY=$binary" >> $env:GITHUB_ENV
"MARKWRITER_PROFILE_DIR=$profile" >> $env:GITHUB_ENV
$webview=Get-ChildItem 'C:/Program Files (x86)/Microsoft/EdgeWebView/Application/*/msedgewebview2.exe' | Select-Object -Last 1
if(-not $webview){throw 'WebView2 runtime not found'}
# Restrict test processes on this disposable runner; loopback remains available to
# the external driver. No firewall or WebView security protection is disabled.
foreach($program in @($binary,$webview.FullName)){
 New-NetFirewallRule -DisplayName ('MarkWriter offline package test '+[guid]::NewGuid()) -Direction Outbound -Action Block -Program $program -RemoteAddress '0.0.0.0-126.255.255.255','128.0.0.0-255.255.255.255','::/0' | Out-Null
}
