$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot/..").Path
$installed = Split-Path -Parent $env:MARKWRITER_BINARY
$dll = Join-Path $installed 'MarkWriterPreview.dll'
$expected = (Get-FileHash -LiteralPath "$root/src-tauri/windows/MarkWriterPreview.dll" -Algorithm SHA256).Hash
if ((Get-AuthenticodeSignature -LiteralPath $dll).Status -ne 'NotSigned') { throw 'Expected an unsigned bundled preview DLL.' }
$clsid = '{8360D352-56CE-4C43-A12E-A73CF9D10214}'
$server = (Get-Item "HKLM:\Software\Classes\CLSID\$clsid\InprocServer32").GetValue('')
if ($server -ine $dll) { throw 'Installed Preview CLSID does not point to the packaged DLL.' }
$result = Join-Path $root 'package-acceptance-results/explorer-preview.json'
New-Item -ItemType Directory -Force (Split-Path -Parent $result) | Out-Null
# gsudo re-parses the command line. Keep Program Files paths in the environment.
$env:MARKWRITER_PREVIEW_RESULT = $result
# Shell selection and process dispatch are separate observations. The private
# process-start trace stays on this disposable runner. Only fixture names and
# their matched process IDs enter the package receipt.
$traceName = 'NT Kernel Logger'
$traceDir = Join-Path $env:RUNNER_TEMP ('markwriter-explorer-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $traceDir | Out-Null
$tracePath = Join-Path $traceDir 'process.etl'
$traceXml = Join-Path $traceDir 'process.xml'
try {
    # The classic Process provider supplies command lines for short-lived shells.
    & logman.exe start $traceName -p 'Windows Kernel Trace' '(process)' -o $tracePath -ets | Out-Host
    if ($LASTEXITCODE) { throw 'Could not start Explorer dispatch evidence collection.' }
    try {
        & $env:MARKWRITER_GSUDO --integrity Medium pwsh -NoProfile -File "$root/native/windows-preview/explorer-acceptance.ps1" -Bundled -QualifyDocumentOpening -ExpectedSha256 $expected
        $fixtureExit = $LASTEXITCODE
    } finally {
        & logman.exe stop $traceName -ets | Out-Host
        if ($LASTEXITCODE) { throw 'Could not stop Explorer dispatch evidence collection.' }
    }
    if ($fixtureExit) { throw 'Installed Explorer acceptance failed.' }
    $report = Get-Content -Raw -LiteralPath $result | ConvertFrom-Json -AsHashtable -DateKind String
    $opening = $report.fileOpening
    & tracerpt.exe $tracePath -o $traceXml -of XML -summary (Join-Path $traceDir 'summary.txt') -y | Out-Host
    if ($LASTEXITCODE) { throw 'Could not decode Explorer dispatch evidence.' }
    $trace = [xml](Get-Content -Raw -LiteralPath $traceXml)
    $events = $trace.SelectNodes("//*[local-name()='Event'][*[local-name()='System']/*[local-name()='Opcode']='1' and *[local-name()='RenderingInfo']/*[local-name()='EventName']='Process']")
    function Read-FixtureDispatch($observation) {
        $start = [DateTimeOffset]::Parse($observation.startedAtUtc).UtcDateTime
        $end = [DateTimeOffset]::Parse($observation.endedAtUtc).UtcDateTime
        $dispatch = @{}
        foreach ($event in $events) {
            $time = [DateTimeOffset]::Parse($event.System.TimeCreated.SystemTime).UtcDateTime
            if ($time -lt $start -or $time -gt $end) { continue }
            $fields = @{}
            foreach ($field in $event.EventData.Data) { $fields[$field.Name] = [string]$field.'#text' }
            if ([IO.Path]::GetFileName($fields.ImageFileName) -ine 'markwriter.exe' -or !$fields.CommandLine) { continue }
            if (!$fields.CommandLine.Contains(' --open-from-shell ', [StringComparison]::OrdinalIgnoreCase)) { continue }
            foreach ($file in $observation.paths) {
                if ($fields.CommandLine.Contains(('"{0}"' -f $file), [StringComparison]::OrdinalIgnoreCase)) {
                    $name = [IO.Path]::GetFileName($file)
                    if (!$dispatch.ContainsKey($name)) { $dispatch[$name] = @() }
                    $dispatch[$name] += @{ processId = [int]$fields.ProcessID; parentProcessId = [int]$fields.ParentId }
                }
            }
        }
        $observation.selected = @($observation.paths | ForEach-Object { [IO.Path]::GetFileName($_) })
        $observation.dispatched = $dispatch
        $observation.Remove('paths')
    }
    Read-FixtureDispatch $opening.control
    Read-FixtureDispatch $opening.batch
    $dirtyName = $opening.control.selected[0]
    if (!$opening.control.dispatched.ContainsKey($dirtyName)) { throw 'Process trace missed the known single-file Explorer dispatch.' }
    $opened = @($opening.batch.opened | ForEach-Object { $_.name })
    $missing = @($opening.batch.selected | Where-Object { !$opening.batch.dispatched.ContainsKey($_) })
    $notOpened = @($opening.batch.dispatched.Keys | Where-Object { $_ -ne $dirtyName -and $_ -notin $opened })
    $missingTrace = @($opened | Where-Object { !$opening.batch.dispatched.ContainsKey($_) })
    if ($opening.batch.dirtyOwnerActivated -and !$opening.batch.dispatched.ContainsKey($dirtyName)) {
        $missingTrace += $dirtyName
    }
    $opening.batch.dirtyDispatchStatus = if (!$opening.batch.dispatched.ContainsKey($dirtyName)) { 'notDispatched' }
        elseif ($opening.batch.dirtyOwnerActivated) { 'activated' } else { 'activationUnobserved' }
    $opening.batch.notDispatched = $missing
    $opening.batch.dispatchedWithoutDocument = $notOpened
    $opening.batch.openedWithoutDispatch = $missingTrace
    $opening.batch.status = if ($notOpened.Count -or $missingTrace.Count) { 'dispatchMismatch' }
        elseif ($missing.Count) { 'shellSelectionLimit' }
        elseif ($opening.batch.dirtyDispatchStatus -eq 'activationUnobserved') { 'dirtyActivationUnobserved' } else { 'passed' }
    $report.passed = $opening.batch.status -ne 'dispatchMismatch'
    $report.cases += switch ($opening.batch.status) {
        'passed' { 'Explorer multi-selection activated or opened the dispatched files in the same editor' }
        'shellSelectionLimit' { 'Explorer multi-selection dispatch limit recorded separately from editor behavior' }
        'dirtyActivationUnobserved' { 'Explorer multi-selection delivered the new files and preserved the dirty owner; its separate activation was unobserved' }
        'dispatchMismatch' { 'Explorer dispatch and editor document evidence did not match' }
    }
} finally {
    Remove-Item -LiteralPath $traceDir -Recurse -Force
}
$version = (Get-Content -Raw "$root/src-tauri/tauri.conf.json" | ConvertFrom-Json).version
$installer = "$root/src-tauri/target/release/bundle/nsis/MarkWriter_${version}_x64-setup.exe"
$report.assetSha256 = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
$report.installedSha256 = (Get-FileHash -LiteralPath $dll -Algorithm SHA256).Hash.ToLowerInvariant()
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $result -Encoding utf8
if (!$report.passed) { throw 'Explorer multi-selection dispatch did not match the observed editor documents. See explorer-preview.json.' }
