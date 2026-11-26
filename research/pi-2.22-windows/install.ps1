$ErrorActionPreference = 'Stop'
$manifest = Get-Content -Raw candidate/windows-x64.manifest.json | ConvertFrom-Json
if ($manifest.source -cne 'ce882d781441c8376f69f52da5b27bf3f3a5f83e' -or $manifest.buildRun -ne '45878938169' -or
    $manifest.platform -cne 'windows-x64' -or $manifest.asset.name -cne 'MarkWriter-2.21.1-windows-x64.exe' -or
    $manifest.signing.status -cne 'unsigned') { throw 'Unexpected artifact provenance' }
$installer = Get-Item -LiteralPath (Join-Path candidate $manifest.asset.name)
if ($installer.Length -ne $manifest.asset.size -or (Get-FileHash $installer.FullName).Hash -ne $manifest.asset.sha256) {
    throw 'Installer size or SHA256 differs from the exact build manifest'
}
if ((Get-AuthenticodeSignature $installer.FullName).Status -ne 'NotSigned') { throw 'Expected an unsigned research installer' }
$installed = Start-Process -FilePath $installer.FullName -ArgumentList '/S' -Wait -PassThru
if ($installed.ExitCode) { throw "NSIS exited with $($installed.ExitCode)" }
$binary = Join-Path $env:ProgramFiles 'MarkWriter/markwriter.exe'
if ((Get-FileHash $binary).Hash -ne $manifest.binaryInspection.sha256) { throw 'Installed app hash differs from original qualification' }
$profile = Join-Path $env:RUNNER_TEMP 'pi222-isolated-profile'
New-Item -ItemType Directory $profile | Out-Null
icacls $profile /grant "${env:USERNAME}:(OI)(CI)M" | Out-Null
if ($LASTEXITCODE) { throw 'Unable to grant the test user profile access' }
foreach ($program in @($binary, $env:MARKWRITER_WEBVIEW_RUNTIME)) {
    foreach ($net in @('0.0.0.1-126.255.255.255','128.0.0.0-255.255.255.254','::/1','8000::/1')) {
        New-NetFirewallRule -DisplayName ('PI222 offline package ' + [guid]::NewGuid()) -Direction Outbound -Action Block -Program $program -RemoteAddress $net | Out-Null
    }
}
$os = Get-CimInstance Win32_OperatingSystem
New-Item -ItemType Directory -Force package-acceptance-results | Out-Null
@{installer=$manifest.asset; appSha256=$manifest.binaryInspection.sha256; packageSource=$manifest.source; packageRun=$manifest.buildRun;
  os=$os.Caption; build=$os.BuildNumber; webview=(Get-Item $env:MARKWRITER_WEBVIEW_RUNTIME).VersionInfo.ProductVersion;
  signature=(Get-AuthenticodeSignature $installer.FullName).Status.ToString()} | ConvertTo-Json -Depth 6 | Set-Content package-acceptance-results/pi222-installed.json
"MARKWRITER_BINARY=$binary" >> $env:GITHUB_ENV
"MARKWRITER_PROFILE_DIR=$profile" >> $env:GITHUB_ENV
