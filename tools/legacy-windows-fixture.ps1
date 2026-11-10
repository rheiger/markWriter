param([Parameter(Mandatory=$true)][ValidateSet('Seed','Verify')][string]$Phase)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class MarkWriterFixtureShell {
    [DllImport("user32.dll")] public static extern IntPtr GetShellWindow();
}
'@
if (!$env:GITHUB_ACTIONS -or !$env:RUNNER_TEMP) { throw 'This fixture requires a disposable GitHub Actions Windows runner.' }
$base = 'HKCU:\Software\Classes'
$iid = '{8895b1c6-b41f-4c1c-a562-0d564250836f}'
$oldClass = '{A448B833-8E1A-4EA4-BCC4-272134A64E97}'
$competing = '{9038F78F-5474-4B17-BFC6-8AB25A1702DB}'
$legacyDir = Join-Path $env:LOCALAPPDATA 'MarkWriter'
$profile = Join-Path $env:LOCALAPPDATA 'com.markwriter.app'
$uninstall = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\MarkWriter'
$competingKey = "$base\.markdown\shellex\$iid"
$obsoleteCommand = "$base\MarkWrite.Document\shell\open\command"
$appCommand = "$base\Applications\markwriter.exe\shell\open\command"

if ($Phase -eq 'Seed') {
    if ((Test-Path $legacyDir) -or (Test-Path $uninstall) -or (Test-Path $competingKey) -or (Test-Path $appCommand)) {
        throw 'Legacy fixture paths already in use.'
    }
    if ([MarkWriterFixtureShell]::GetShellWindow() -eq [IntPtr]::Zero) {
        Start-Process "$env:WINDIR\explorer.exe"
        for ($attempt=0; $attempt -lt 40 -and [MarkWriterFixtureShell]::GetShellWindow() -eq [IntPtr]::Zero; $attempt++) {
            Start-Sleep -Milliseconds 250
        }
    }
    Write-Host "Interactive shell window available: $([MarkWriterFixtureShell]::GetShellWindow() -ne [IntPtr]::Zero)"
    $fixtures = Join-Path $env:RUNNER_TEMP 'markwriter-2.7.3-upgrade'
    New-Item -ItemType Directory $fixtures | Out-Null
    $assets = @{
        'MarkWriter-2.7.3-windows-x64.exe' = '69922deef2296edbc6445b7414ee69e93bc3f1307114f3c27e83780244e92427'
        'MarkWriter-2.7.3-windows-x64-explorer-preview.zip' = '1bd5624e6421006244f3072d7d4fcc8186dedb93eaacb42ec9c5a581333dfc06'
    }
    foreach ($name in $assets.Keys) {
        $path = Join-Path $fixtures $name
        Invoke-WebRequest "https://github.com/rheiger/markWriter/releases/download/v2.7.3/$name" -OutFile $path -MaximumRetryCount 3
        if ((Get-FileHash -LiteralPath $path).Hash -ine $assets[$name]) { throw "Legacy asset digest mismatch for $name." }
    }
    $oldInstaller = Join-Path $fixtures 'MarkWriter-2.7.3-windows-x64.exe'
    $process = Start-Process -FilePath $oldInstaller -ArgumentList '/S' -Wait -PassThru
    if ($process.ExitCode -ne 0 -or !(Test-Path "$legacyDir\markwriter.exe") -or !(Test-Path $uninstall)) {
        throw 'Public v2.7.3 per-user installation failed.'
    }
    Expand-Archive "$fixtures/MarkWriter-2.7.3-windows-x64-explorer-preview.zip" "$fixtures/preview"
    & "$fixtures/preview/install.ps1" -Action Enable -DllPath "$fixtures/preview/MarkWriterPreview.dll"
    Set-Item -LiteralPath $competingKey -Value $competing
    if ((Test-Path $obsoleteCommand) -or (Test-Path "$env:ProgramFiles\MarkWrite\MarkWrite.exe")) { throw 'Old MarkWrite fixture path already in use.' }
    Set-Item -LiteralPath "$base\.md" -Value 'MarkWrite.Document'
    New-Item -Path $obsoleteCommand -Force | Out-Null
    Set-Item -LiteralPath $obsoleteCommand -Value ('"{0}\MarkWrite\MarkWrite.exe" "%1"' -f $env:ProgramFiles)
    New-Item -Path $appCommand -Force | Out-Null
    Set-Item -LiteralPath $appCommand -Value ('"{0}\markwriter.exe" "%1"' -f $legacyDir)
    New-Item -ItemType Directory -Force $profile | Out-Null
    Set-Content -LiteralPath "$legacyDir/unowned.txt" -Value 'user file in old folder'
    Set-Content -LiteralPath "$profile/upgrade-sentinel.txt" -Value 'preserve user data'
    return
}

for ($attempt=0; $attempt -lt 100; $attempt++) {
    if (!(Test-Path "$legacyDir/markwriter.exe") -and !(Test-Path $uninstall) -and
        !(Test-Path "$base\CLSID\$oldClass") -and !(Test-Path $obsoleteCommand)) { break }
    Start-Sleep -Milliseconds 200
}
if ((Test-Path "$legacyDir/markwriter.exe") -or (Test-Path "$legacyDir/uninstall.exe") -or (Test-Path $uninstall)) {
    # A direct ordinary-user retry supplies diagnostics for a failed setup launch.
    # The required installer test still fails even if the diagnostic retry succeeds.
    $candidate = Join-Path $env:ProgramFiles 'MarkWriter/markwriter.exe'
    $errorLog = Join-Path $env:RUNNER_TEMP 'markwriter-cleanup-error.txt'
    $diagnostic = Start-Process -FilePath $candidate -ArgumentList '--retire-legacy-install --quiet' -RedirectStandardError $errorLog -Wait -PassThru
    Write-Host "Direct ordinary cleanup exit code: $($diagnostic.ExitCode)"
    Get-Content -LiteralPath $errorLog
    Write-Host "After retry, legacy binary present: $(Test-Path "$legacyDir/markwriter.exe"), uninstall record present: $(Test-Path $uninstall)"
    if (Test-Path $uninstall) {
        Get-ItemProperty $uninstall | Select-Object Publisher,MainBinaryName,InstallLocation,UninstallString,DisplayIcon,DisplayVersion | Format-List
        Write-Host "Legacy location: $((Get-Item 'HKCU:\Software\markwriter\MarkWriter').GetValue(''))"
    }
    throw 'Setup did not retire the known v2.7.3 user installation.'
}
if ((Get-Content "$legacyDir/unowned.txt") -cne 'user file in old folder' -or (Get-Content "$profile/upgrade-sentinel.txt") -cne 'preserve user data') {
    throw 'Migration changed a non-installer file.'
}
if ((Test-Path "$base\CLSID\$oldClass") -or (Test-Path "$base\.md\shellex\$iid")) {
    throw 'Setup did not retire the legacy per-user preview registration.'
}
if ((Get-Item -LiteralPath $competingKey).GetValue('') -ine $competing) { throw 'Competing user handler was changed.' }
Remove-Item -LiteralPath $competingKey
if ((Test-Path $appCommand) -and (Get-Item -LiteralPath $appCommand).GetValue('')) {
    throw 'Old per-user Open With command remains.'
}
if ((Get-Item -LiteralPath "$base\.md").GetValue('') -eq 'MarkWrite.Document' -or (Test-Path $obsoleteCommand)) {
    throw 'Obsolete MarkWrite.Document association remains.'
}
'Known v2.7.3 user install and preview retired; unrelated file, profile, and competing handler preserved.'
