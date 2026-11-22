param([switch]$ObserveEditor, [string]$Association = '.markdown')
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or !$env:RUNNER_TEMP -or !$IsWindows) {
    throw 'This test requires a disposable hosted Windows runner.'
}

if ($ObserveEditor) {
    # Resolve the effective association in the same medium-integrity account as
    # Explorer, independently of reading the fixture's registry values.
    Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class LifecycleAssociation {
    [DllImport("shlwapi.dll", CharSet=CharSet.Unicode, ExactSpelling=true)]
    public static extern int AssocQueryStringW(uint flags, uint kind, string association, string verb, StringBuilder buffer, ref uint capacity);
}
'@
    function Read-OpenCommand([uint32]$Flags) {
        [uint32]$capacity = 32768
        $value = [Text.StringBuilder]::new([int]$capacity)
        $result = [LifecycleAssociation]::AssocQueryStringW($Flags, 1, $Association, 'open', $value, [ref]$capacity)
        if ($result -ne 0) { return ('HRESULT 0x{0:x8}' -f $result) }
        $value.ToString()
    }
    @{
        effective = Read-OpenCommand 0
        # ASSOCF_PER_MACHINE_ONLY bypasses per-user association lookup.
        perMachine = Read-OpenCommand 0x00008000
    } | ConvertTo-Json -Compress | Set-Content -LiteralPath $env:MARKWRITER_LIFECYCLE_ASSOCIATION_RESULT
    return
}

$root = (Resolve-Path "$PSScriptRoot/..").Path
$artifacts = Join-Path $root 'package-acceptance-results'
$receiptPath = Join-Path $artifacts 'windows-rollback.json'
$explorerPath = Join-Path $artifacts 'explorer-preview.json'
$state = Join-Path $env:RUNNER_TEMP ('markwriter-rollback-' + [guid]::NewGuid())
New-Item -ItemType Directory $state | Out-Null
$baseVersion = '2.7.5'
$baseInstallerName = "MarkWriter-$baseVersion-windows-x64.exe"
$baseInstaller = Join-Path $state $baseInstallerName
# Published v2.7.5 SHA256SUMS and the released Windows and Explorer manifests.
$basePackageHash = 'c92b7b7fcf681c1074795f4732257117eb879dd514eab21ff734ac0b73eb0080'
$baseBinaryHash = 'cb6937bb91d04a586a7142797fbc5ba2cf6926ba3a69ea0b04da95a07f94a66e'
$basePreviewHash = '7391f89b001c61af3d0236627664731a5bddbffae8afbfc2ed516e3494a8708c'
$candidateVersion = (Get-Content -Raw "$root/src-tauri/tauri.conf.json" | ConvertFrom-Json).version
if ([version]$candidateVersion -le [version]$baseVersion) { throw 'Rollback testing requires a candidate newer than 2.7.5.' }
$candidateInstaller = "$root/release-assets/MarkWriter-$candidateVersion-windows-x64.exe"
$candidateManifest = Get-Content -Raw "$root/release-assets/windows-x64.manifest.json" | ConvertFrom-Json
$binary = $env:MARKWRITER_BINARY
$installDir = Split-Path -Parent $binary
if ($installDir -ine (Join-Path $env:ProgramFiles 'MarkWriter') -or (Test-Path -LiteralPath $binary)) {
    throw 'The first Windows lifecycle test must leave the ordinary Program Files package uninstalled.'
}
$preview = Join-Path $installDir 'MarkWriterPreview.dll'
$uninstaller = Join-Path $installDir 'uninstall.exe'
$unknown = Join-Path $installDir 'lifecycle-unowned.txt'
$document = Join-Path $state 'Lifecycle saved.md'
$env:MARKWRITER_PROFILE_DIR = Join-Path $state 'profile'
New-Item -ItemType Directory $env:MARKWRITER_PROFILE_DIR | Out-Null
$workspace = Join-Path $env:MARKWRITER_PROFILE_DIR 'workspace.json'
$env:MARKWRITER_LIFECYCLE_DOCUMENT = $document
$env:MARKWRITER_LIFECYCLE_ASSOCIATION_RESULT = Join-Path $state 'association.txt'
$machine = 'HKLM:\Software\Classes'
$clsid = '{8360D352-56CE-4C43-A12E-A73CF9D10214}'
$iid = '{8895b1c6-b41f-4c1c-a562-0d564250836f}'
$server = "$machine\CLSID\$clsid\InprocServer32"
$competingKey = "$machine\SystemFileAssociations\.markdown\shellex\$iid"
$competing = '{' + [guid]::NewGuid().ToString().ToUpperInvariant() + '}'
$editorKey = "$machine\.markdown"
$markwriterEditor = 'MarkWriter.Markdown'
$editorDefaultOwned = $false
$previewFallbackOwned = $false
$os = Get-CimInstance Win32_OperatingSystem
$receipt = [ordered]@{
    passed = $false
    baseline = "{0} build {1}, {2}" -f $os.Caption, $os.BuildNumber, $os.OSArchitecture
    source = $env:GITHUB_SHA
    previous = @{ version = $baseVersion; assetSha256 = $basePackageHash; executableSha256 = $baseBinaryHash; previewSha256 = $basePreviewHash }
    candidate = @{ version = $candidateVersion; assetSha256 = $candidateManifest.asset.sha256; executableSha256 = $candidateManifest.binaryInspection.sha256 }
    previewProvider = @{ clsid = $clsid; server = $preview; syntheticCompetingFallbackClsid = $competing }
    operations = [Collections.Generic.List[object]]::new()
}

function Get-Sha256($Path) {
    (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}
function Read-DefaultValue($Path) {
    $key = Get-Item -LiteralPath $Path -ErrorAction SilentlyContinue
    if ($key) { $key.GetValue('') }
}
function Assert-Installed($ExecutableHash, $PreviewHash) {
    if ((Get-Sha256 $binary) -ne $ExecutableHash -or (Get-Sha256 $preview) -ne $PreviewHash -or (Read-DefaultValue $server) -ine $preview) {
        throw 'Installed executable, preview DLL, or preview provider differs from the exact expected package.'
    }
}
function Install-Package($Installer, $Phase) {
    $process = Start-Process -FilePath $Installer -ArgumentList '/S' -Wait -PassThru
    $receipt.operations.Add(@{ phase = $Phase; exitCode = $process.ExitCode })
    if ($process.ExitCode -ne 0) { throw "$Phase failed with exit code $($process.ExitCode)." }
}
function Invoke-Recovery($Mode, $Version, $Label) {
    $result = Join-Path $artifacts "windows-rollback-$Label.json"
    $env:MARKWRITER_LIFECYCLE_RECOVERY_RESULT = $result
    & $env:MARKWRITER_GSUDO --integrity Medium node "$PSScriptRoot/windows-lifecycle-recovery.mjs" $Mode $Version
    if ($LASTEXITCODE -ne 0) { throw "Installed recovery check failed during $Label." }
    $evidence = Get-Content -Raw -LiteralPath $result | ConvertFrom-Json -AsHashtable
    if (!$evidence.passed -or $evidence.version -cne $Version) { throw 'Recovery evidence version or status differs.' }
    $receipt.operations.Add(@{ phase = $Label; recovery = $evidence })
}
function Read-OpenCommands($Association) {
    & $env:MARKWRITER_GSUDO --integrity Medium pwsh -NoProfile -File $PSCommandPath -ObserveEditor -Association $Association
    if ($LASTEXITCODE -ne 0) { throw "Could not observe the effective Open command for $Association." }
    Get-Content -Raw -LiteralPath $env:MARKWRITER_LIFECYCLE_ASSOCIATION_RESULT | ConvertFrom-Json
}
function Assert-CompetingEditor($Phase) {
    if ((Read-DefaultValue $editorKey) -cne $editorId -or (Read-DefaultValue $competingKey) -ine $competing) {
        throw 'Package operation changed the competing editor or preview registration.'
    }
    $commands = Read-OpenCommands '.markdown'
    # Windows may show its chooser for a machine default on an extension without
    # a user choice. Record actual shell resolution alongside registry assertions.
    $receipt.operations.Add(@{
        phase = $Phase
        openCommands = $commands
        registeredEditorWasEffective = $commands.effective -ieq $editorCommand
        registeredEditorMatchedMachineResolver = $commands.perMachine -ieq $editorCommand
        syntheticCompetingPreviewRegistration = $competing
    })
}
function Remove-EditorFixture {
    if ($script:editorDefaultOwned -and (Read-DefaultValue $editorKey) -ceq $editorId) {
        if ((Read-DefaultValue $server) -ieq $preview) {
            Set-Item -LiteralPath $editorKey -Value $markwriterEditor
        } else {
            (Get-Item -LiteralPath $editorKey).DeleteValue('', $false)
        }
        [LifecycleShellChange]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
    }
    $script:editorDefaultOwned = $false
}

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class LifecycleShellChange {
    [DllImport("shell32.dll")]
    public static extern void SHChangeNotify(int eventId, uint flags, IntPtr first, IntPtr second);
}
'@

try {
    Invoke-WebRequest "https://github.com/rheiger/markWriter/releases/download/v$baseVersion/$baseInstallerName" -OutFile $baseInstaller -MaximumRetryCount 3
    if ((Get-Sha256 $baseInstaller) -ne $basePackageHash -or (Get-Sha256 $candidateInstaller) -ne $candidateManifest.asset.sha256 -or
        $candidateManifest.source -ne $env:GITHUB_SHA) { throw 'Installer digest or candidate source differs from the exact expected release inputs.' }
    $candidatePreviewHash = Get-Sha256 "$root/src-tauri/windows/MarkWriterPreview.dll"
    $receipt.candidate.previewSha256 = $candidatePreviewHash

    Install-Package $baseInstaller 'install released 2.7.5'
    Assert-Installed $baseBinaryHash $basePreviewHash
    Invoke-Recovery 'seed' $baseVersion 'seed at 2.7.5'
    $savedHash = Get-Sha256 $document
    $receipt.savedDocumentSha256 = $savedHash

    $editorId = Read-DefaultValue "$machine\.txt"
    if (!$editorId -or (Read-DefaultValue $editorKey) -cne $markwriterEditor -or (Read-DefaultValue $competingKey) -ine $clsid) {
        throw 'Expected a Windows text-editor ProgID and the two MarkWriter fallback registration values.'
    }
    # A registered Windows editor has a real executable and a Shell-resolvable
    # ProgID. Use it as the machine-wide fallback for the disposable profile.
    $editorCommand = (Read-OpenCommands $editorId).effective
    if (!$editorCommand -or $editorCommand -match '^HRESULT |OpenWith\.exe|markwriter\.exe') {
        throw "The Windows text-editor class does not resolve to an independent editor: $editorCommand"
    }
    $receipt.competingEditor = @{ layer = 'machine-wide default association'; progId = $editorId; command = $editorCommand }
    Set-Item -LiteralPath $editorKey -Value $editorId
    $editorDefaultOwned = $true
    Set-Item -LiteralPath $competingKey -Value $competing
    $previewFallbackOwned = $true
    [LifecycleShellChange]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
    Assert-CompetingEditor 'seed competing associations before upgrade'

    Install-Package $candidateInstaller 'upgrade in place to candidate'
    Assert-Installed $candidateManifest.binaryInspection.sha256 $candidatePreviewHash
    Assert-CompetingEditor 'preserve competing associations on upgrade'
    Invoke-Recovery 'recover' $candidateVersion 'recover at candidate'
    if ((Get-Sha256 $document) -ne $savedHash) { throw 'Upgrade changed the saved Markdown bytes.' }
    $workspaceHash = Get-Sha256 $workspace
    Set-Content -LiteralPath $unknown -Value 'unowned lifecycle fixture'
    $unknownHash = Get-Sha256 $unknown

    $lock = [IO.File]::Open($preview, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    try {
        $blocked = Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait -PassThru
        Assert-Installed $candidateManifest.binaryInspection.sha256 $candidatePreviewHash
        if (!(Test-Path -LiteralPath $uninstaller) -or (Get-Sha256 $document) -ne $savedHash -or
            (Get-Sha256 $workspace) -ne $workspaceHash -or (Get-Sha256 $unknown) -ne $unknownHash) {
            throw 'Blocked removal changed the installation, saved file, profile, or unowned fixture.'
        }
        $receipt.operations.Add(@{ phase = 'blocked removal preserved exact installation, saved document, profile and unowned file'; exitCode = $blocked.ExitCode })
        Assert-CompetingEditor 'preserve competing associations on blocked removal'
    } finally { $lock.Dispose() }

    $removed = Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait -PassThru
    if ((Test-Path -LiteralPath $binary) -or (Test-Path -LiteralPath $preview) -or (Test-Path -LiteralPath $uninstaller) -or
        (Test-Path -LiteralPath $server) -or (Get-Sha256 $document) -ne $savedHash -or
        (Get-Sha256 $workspace) -ne $workspaceHash -or (Get-Sha256 $unknown) -ne $unknownHash) {
        throw 'Removal retry did not remove owned files and provider or preserve the unrelated files and profile.'
    }
    foreach ($ext in '.md', '.markdown') {
        $openWith = Get-Item -LiteralPath "$machine\$ext\OpenWithProgids" -ErrorAction SilentlyContinue
        if ($openWith -and $null -ne $openWith.GetValue('MarkWriter.Markdown')) { throw "Removal left the $ext MarkWriter Open With entry." }
    }
    $receipt.operations.Add(@{ phase = 'removal retry removed owned files and registration and preserved saved document, profile and unowned file'; exitCode = $removed.ExitCode })
    Assert-CompetingEditor 'preserve competing associations on removal retry'

    # Older setup may refuse a nonempty Program Files path after a completed
    # uninstall. The manual procedure moves retained unrelated files aside.
    $preservedUnknown = Join-Path $state 'lifecycle-unowned.txt'
    Move-Item -LiteralPath $unknown -Destination $preservedUnknown
    Install-Package $baseInstaller 'reinstall released 2.7.5'
    Assert-Installed $baseBinaryHash $basePreviewHash
    Assert-CompetingEditor 'preserve competing associations on rollback install'
    Invoke-Recovery 'recover' $baseVersion 'recover after rollback'
    if ((Get-Sha256 $document) -ne $savedHash -or (Get-Sha256 $preservedUnknown) -ne $unknownHash) {
        throw 'Rollback changed the saved document or unowned fixture bytes.'
    }

    # Exercise MarkWriter's intended default and provider separately after
    # preserving the competing registrations through the full transaction.
    Remove-EditorFixture
    if ($previewFallbackOwned -and (Read-DefaultValue $competingKey) -ieq $competing) {
        Set-Item -LiteralPath $competingKey -Value $clsid
        $previewFallbackOwned = $false
    }
    $env:MARKWRITER_PREVIEW_RESULT = Join-Path $artifacts 'windows-rollback-explorer.json'
    $processTrace = $null
    $previousTrace = $env:MARKWRITER_TRACE_ROLLBACK_OPEN
    try {
        if ($env:GITHUB_REF -ceq 'refs/heads/codex/hosted-windows-rollback-diagnostic') {
            $env:MARKWRITER_TRACE_ROLLBACK_OPEN = 'true'
            try {
                $processTrace = 'MarkWriterRollbackProcessStart'
                Register-CimIndicationEvent -Query "SELECT * FROM Win32_ProcessStartTrace WHERE ProcessName = 'markwriter.exe'" -SourceIdentifier $processTrace | Out-Null
            } catch {
                Write-Warning "Process-start observation was unavailable: $_"
                $processTrace = $null
            }
        }
        & $env:MARKWRITER_GSUDO --integrity Medium pwsh -NoProfile -File "$root/native/windows-preview/explorer-acceptance.ps1" -Bundled -ExpectedSha256 $basePreviewHash
        $explorerExit = $LASTEXITCODE
    } finally {
        $env:MARKWRITER_TRACE_ROLLBACK_OPEN = $previousTrace
        if ($processTrace) {
            try {
                $starts = @(Get-Event -SourceIdentifier $processTrace -ErrorAction SilentlyContinue | ForEach-Object {
                    $start = $_.SourceEventArgs.NewEvent
                    @{
                        utc = [DateTime]::FromFileTimeUtc([long]$start.TIME_CREATED).ToString('o')
                        pid = $start.ProcessID
                        parentPid = $start.ParentProcessID
                        session = $start.SessionID
                    }
                })
                ConvertTo-Json -InputObject $starts | Set-Content -LiteralPath "$env:MARKWRITER_PREVIEW_RESULT.process-starts.json" -Encoding utf8
            } catch {
                Write-Warning "Could not collect process-start observation: $_"
            } finally {
                Unregister-Event -SourceIdentifier $processTrace
                Remove-Event -SourceIdentifier $processTrace -ErrorAction SilentlyContinue
            }
        }
    }
    if ($explorerExit -ne 0) { throw 'Rolled-back package failed its ordinary Explorer fixture.' }
    $receipt.rolledBackExplorer = Get-Content -Raw -LiteralPath $env:MARKWRITER_PREVIEW_RESULT | ConvertFrom-Json
    if (!$receipt.rolledBackExplorer.passed -or (Get-Sha256 $document) -ne $savedHash) { throw 'Explorer result or saved Markdown preservation failed after rollback.' }
    $receipt.passed = $true
    $explorer = Get-Content -Raw -LiteralPath $explorerPath | ConvertFrom-Json -AsHashtable
    $explorer.windowsRollback = $receipt
    $explorer.cases += 'exact 2.7.5 to candidate machine-wide upgrade and manual 2.7.5 rollback with recovered draft and Explorer acceptance'
    $explorer | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $explorerPath -Encoding utf8
} catch {
    $receipt.error = $_.ToString()
    throw
} finally {
    $receipt | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $receiptPath -Encoding utf8
    Remove-EditorFixture
    if ($previewFallbackOwned -and (Read-DefaultValue $competingKey) -ieq $competing) {
        if ((Read-DefaultValue $server) -ieq $preview) {
            Set-Item -LiteralPath $competingKey -Value $clsid
        } else {
            Remove-Item -LiteralPath $competingKey
        }
    }
}
