$ErrorActionPreference = 'Stop'
if (!$env:GITHUB_ACTIONS) { throw 'This test requires a disposable Windows runner.' }
$dir = Split-Path -Parent $env:MARKWRITER_BINARY
$uninstaller = Join-Path $dir 'uninstall.exe'
$dll = Join-Path $dir 'MarkWriterPreview.dll'
$classes = 'HKLM:\Software\Classes'
$clsid = '{8360D352-56CE-4C43-A12E-A73CF9D10214}'
$iid = '{8895b1c6-b41f-4c1c-a562-0d564250836f}'
$server = "$classes\CLSID\$clsid\InprocServer32"
$competingKey = "$classes\SystemFileAssociations\.markdown\shellex\$iid"
$competing = '{9038F78F-5474-4B17-BFC6-8AB25A1702DB}'
$receipt = 'package-acceptance-results/explorer-preview.json'
function Invoke-Uninstall {
    (Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait -PassThru).ExitCode
}
function Check-OwnedInstall {
    if (!(Test-Path -LiteralPath $dll) -or !(Test-Path -LiteralPath $env:MARKWRITER_BINARY) -or
        (Get-Item -LiteralPath $server).GetValue('') -ine $dll) {
        throw 'Uninstall changed the installation while the preview DLL was in use.'
    }
}
$lock = [IO.File]::Open($dll, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
try {
    Invoke-Uninstall | Out-Null
    Check-OwnedInstall
} finally { $lock.Dispose() }

function Release-FixturePreviewHosts {
    $identityFile = "$receipt.hosts.json"
    if (!(Test-Path -LiteralPath $identityFile)) { return }
    $hostImage = Join-Path $env:WINDIR 'System32\prevhost.exe'
    foreach ($identity in @(Get-Content -Raw -LiteralPath $identityFile | ConvertFrom-Json)) {
        if (!$identity) { continue }
        $process = Get-Process -Id $identity.id -ErrorAction SilentlyContinue
        if (!$process -or $process.Path -ine $hostImage -or $process.SessionId -ne $identity.session -or
            $process.StartTime.ToUniversalTime().Ticks -ne $identity.start) { continue }
        if (!($process.Modules | Where-Object { $_.FileName -ieq $dll })) { continue }
        Write-Host "Releasing idle disposable fixture Preview host PID $($process.Id)."
        $process.Kill()
        if (!$process.WaitForExit(5000)) { throw 'Fixture Preview host did not exit.' }
    }
}

# A provider registered after MarkWriter must survive its uninstall.
if ((Get-Item -LiteralPath $competingKey).GetValue('') -ine $clsid) { throw 'Expected own fallback before test.' }
Set-Item -LiteralPath $competingKey -Value $competing
try {
    for ($attempt = 0; $attempt -lt 24 -and (Test-Path -LiteralPath $uninstaller); $attempt++) {
        Invoke-Uninstall | Out-Null
        if (Test-Path -LiteralPath $uninstaller) {
            if ($attempt -eq 0) {
                Check-OwnedInstall
                Release-FixturePreviewHosts
            }
            Start-Sleep -Seconds 2
        }
    }
    if ((Test-Path -LiteralPath $uninstaller) -or (Test-Path -LiteralPath $dll) -or
        (Test-Path -LiteralPath $env:MARKWRITER_BINARY) -or (Test-Path -LiteralPath $server)) {
        throw 'Uninstall did not remove the installed package and handler.'
    }
    if ((Get-Item -LiteralPath $competingKey).GetValue('') -ine $competing) { throw 'Uninstall removed a competing preview handler.' }
    if ((Get-Content -LiteralPath "$env:LOCALAPPDATA/com.markwriter.app/upgrade-sentinel.txt") -cne 'preserve user data') {
        throw 'Uninstall changed user data.'
    }
    $openWith = Get-Item -LiteralPath "$classes\.md\OpenWithProgids" -ErrorAction SilentlyContinue
    if ($openWith -and $null -ne $openWith.GetValue('MarkWriter.Markdown')) {
        throw 'Uninstall left the registered MarkWriter ProgID.'
    }
    $report = Get-Content -Raw -LiteralPath $receipt | ConvertFrom-Json -AsHashtable
    $report.cases += @(
        'machine setup migrated verified public 2.7.3 per-user binaries and registration',
        'setup preserved unknown file, profile data, and competing per-user provider',
        'uninstall refused while the bundled DLL was locked',
        'uninstall removed owned files and values while preserving competing registration and profile data'
    )
    $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $receipt -Encoding utf8
} finally {
    if ((Test-Path -LiteralPath $competingKey) -and (Get-Item -LiteralPath $competingKey).GetValue('') -ieq $competing) {
        Remove-Item -LiteralPath $competingKey
    }
}
