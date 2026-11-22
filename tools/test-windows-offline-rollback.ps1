[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('Prepare','Baseline','Upgrade','Remove','Rollback')][string]$Phase,
    [switch]$ConfirmOfflineGuest
)

$ErrorActionPreference = 'Stop'
$machine = Get-CimInstance Win32_ComputerSystem
$os = Get-CimInstance Win32_OperatingSystem
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (!$ConfirmOfflineGuest -or $machine.Model -ne 'Virtual Machine' -or
    $machine.Manufacturer -ne 'Microsoft Corporation' -or $os.Caption -notmatch 'Windows 11' -or
    $env:PROCESSOR_ARCHITECTURE -ne 'AMD64' -or @(Get-NetAdapter | Where-Object Status -eq 'Up').Count) {
    throw 'Use only the checkpointed offline Windows 11 x64 Hyper-V guest.'
}
if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) -or
    [Diagnostics.Process]::GetCurrentProcess().SessionId -eq 0) {
    throw 'Run from ordinary, non-elevated PowerShell in the signed-in guest desktop.'
}

$baseline = '2.8.2'
$candidate = '2.9.2'
$statePath = Join-Path $PSScriptRoot 'state'
$receiptPath = Join-Path $statePath 'receipt.json'
$profile = Join-Path $statePath 'profile'
$fixture = Join-Path $statePath 'fixture'
$saved = Join-Path $fixture 'Saved-89.md'
$workspace = Join-Path $profile 'workspace.json'
$preserved = Join-Path $statePath 'markwriter-89-unowned.txt'
$install = Join-Path $env:ProgramFiles 'MarkWriter'
$binary = Join-Path $install 'markwriter.exe'
$preview = Join-Path $install 'MarkWriterPreview.dll'
$uninstaller = Join-Path $install 'uninstall.exe'
$unowned = Join-Path $install 'markwriter-89-unowned.txt'
$clsid = '{8360D352-56CE-4C43-A12E-A73CF9D10214}'
$iid = '{8895b1c6-b41f-4c1c-a562-0d564250836f}'
$server = "HKLM:\Software\Classes\CLSID\$clsid\InprocServer32"
$draft = 'mw89draft'

function Get-Hash($Path) {
    (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}
function Read-DefaultValue($Path) {
    $key = Get-Item -LiteralPath $Path -ErrorAction SilentlyContinue
    if ($key) { $key.GetValue('') }
}
function Assert-MarkWriterClosed {
    if (Get-Process markwriter -ErrorAction SilentlyContinue) {
        throw 'Close MarkWriter and the Explorer Preview pane before continuing.'
    }
}
function Read-Package($Version) {
    $name = "MarkWriter-$Version-windows-x64.exe"
    $path = Join-Path $PSScriptRoot $name
    $manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot "manifest-$Version.json") -Raw | ConvertFrom-Json
    if ($manifest.version -cne $Version -or $manifest.asset.name -cne $name -or
        $manifest.source -notmatch '^[a-f0-9]{40}$' -or $manifest.binaryInspection.sha256 -notmatch '^[a-f0-9]{64}$' -or
        (Get-Hash $path) -ne $manifest.asset.sha256) {
        throw "Staged $Version package or provenance does not match its manifest."
    }
    @{ path = $path; version = $Version; source = $manifest.source
       installerSha256 = $manifest.asset.sha256; executableSha256 = $manifest.binaryInspection.sha256 }
}
function Assert-Installed($Package) {
    if ((Get-Hash $binary) -ne $Package.executableSha256 -or
        !(Test-Path -LiteralPath $preview -PathType Leaf) -or
        !(Test-Path -LiteralPath $uninstaller -PathType Leaf) -or (Read-DefaultValue $server) -ine $preview) {
        throw "Installed files or preview registration differ from the $($Package.version) package."
    }
}
function Invoke-ElevatedProcess($Path, $Arguments) {
    $process = Start-Process -FilePath $Path -ArgumentList $Arguments -Verb RunAs -Wait -PassThru
    $process.ExitCode
}
function Invoke-ElevatedFileChange($Command) {
    # Commands are assembled from the fixed synthetic fixture paths only.
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes("$Command"))
    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $result = Invoke-ElevatedProcess $powershell "-NoProfile -NonInteractive -EncodedCommand $encoded"
    if ($result -ne 0) { throw "Synthetic fixture file operation failed with exit code $result." }
}
function Install-Package($Package) {
    Assert-MarkWriterClosed
    if (!(Test-Path -LiteralPath $binary) -or (Get-Hash $binary) -ne $Package.executableSha256) {
        $exit = Invoke-ElevatedProcess $Package.path '/S'
        if ($exit -ne 0) { throw "Installer $($Package.version) returned $exit." }
    }
    Assert-Installed $Package
}
function Assert-DraftOnDisk {
    $snapshot = Get-Content -LiteralPath $workspace -Raw | ConvertFrom-Json
    $active = $snapshot.documents | Where-Object id -eq $snapshot.activeId
    if (!$active.isDirty -or ([string]$active.content).TrimEnd([char[]]@([char]13, [char]10)) -cne $draft) {
        throw 'The isolated workspace has no matching active dirty draft.'
    }
}
function Exercise-Recovery($Version, [switch]$Seed) {
    Assert-MarkWriterClosed
    $oldProfile = $env:MARKWRITER_PROFILE_DIR
    $env:MARKWRITER_PROFILE_DIR = $profile
    try { $process = Start-Process -FilePath $binary -PassThru }
    finally { $env:MARKWRITER_PROFILE_DIR = $oldProfile }

    Write-Host "In the isolated MarkWriter window confirm About shows $Version, then close About."
    if ($Seed) {
        Write-Host "In the empty editor, type the short draft shown below, then wait two seconds:"
    } else {
        Write-Host 'Confirm the active recovered document still contains exactly this line and shows as unsaved:'
    }
    Write-Host $draft
    if ((Read-Host 'Type the displayed version here to confirm') -cne $Version) { throw 'Version or recovery was not confirmed.' }
    Assert-DraftOnDisk
    $process.Refresh()
    if ($process.HasExited -or $process.Path -ine $binary) { throw 'The exact isolated editor process is no longer available.' }
    # Preserve the verified dirty workspace for the next package rather than discarding it on quit.
    $process.Kill()
    if (!$process.WaitForExit(10000)) { throw 'The isolated editor did not exit.' }
}
function Read-PreviewAssociations {
    foreach ($hive in 'HKLM:', 'HKCU:') {
        foreach ($extension in '.md', '.markdown') {
            $value = Read-DefaultValue "$hive\Software\Classes\SystemFileAssociations\$extension\shellex\$iid"
            if ($value -and $value -ine $clsid) { "$hive/$extension/$value" }
        }
    }
}
function Initialize-PreviewFixture($State) {
    if ($State.PSObject.Properties['competingPreviewRegistrations']) {
        Assert-PreviewAssociations $State
        return
    }
    if (!(Read-PreviewAssociations)) {
        $key = "HKCU:\Software\Classes\SystemFileAssociations\.markdown\shellex\$iid"
        if (Test-Path -LiteralPath $key) { throw 'A preview registration occupies the synthetic fixture slot.' }
        $value = '{' + [guid]::NewGuid().ToString().ToUpperInvariant() + '}'
        New-Item -Path $key -Force | Out-Null
        Set-Item -LiteralPath $key -Value $value
        $State | Add-Member -NotePropertyName syntheticPreviewRegistration -NotePropertyValue $value
    }
    $State | Add-Member -NotePropertyName competingPreviewRegistrations -NotePropertyValue @(Read-PreviewAssociations)
}
function Assert-PreviewAssociations($State) {
    if (((@($State.competingPreviewRegistrations) | Sort-Object) -join '|') -cne
        ((@(Read-PreviewAssociations) | Sort-Object) -join '|')) {
        throw 'An independent or synthetic competing preview registration changed.'
    }
}
function Assert-PreservedFiles($State) {
    if ((Get-Hash $saved) -ne $State.savedSha256 -or (Get-Hash $workspace) -ne $State.workspaceSha256) {
        throw 'The synthetic saved file or isolated workspace changed during the package operation.'
    }
}
function Read-MarkdownChoice {
    $root = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.md'
    $latest = Get-ItemProperty -LiteralPath "$root\UserChoiceLatest\ProgId" -ErrorAction SilentlyContinue
    $protected = Get-ItemProperty -LiteralPath "$root\UserChoiceLatest" -ErrorAction SilentlyContinue
    $legacy = Get-ItemProperty -LiteralPath "$root\UserChoice" -ErrorAction SilentlyContinue
    $progId = $latest.ProgId
    if (!$progId) { $progId = Read-DefaultValue "$root\UserChoiceLatest\ProgId" }
    if (!$progId) { $progId = $protected.ProgId }
    if ($progId) {
        $hash = if ($latest.Hash) { $latest.Hash } elseif ($protected.Hash) { $protected.Hash }
        return @{ ProgId = $progId; Hash = $hash; Source = 'UserChoiceLatest' }
    }
    if ($legacy.ProgId -and $legacy.Hash) {
        return @{ ProgId = $legacy.ProgId; Hash = $legacy.Hash; Source = 'UserChoice' }
    }
}
function Read-EffectiveMarkdownProgId {
    if (!('MarkWriter89Shell' -as [type])) {
        Add-Type @'
using System.Runtime.InteropServices;
using System.Text;
public static class MarkWriter89Shell {
    [DllImport("shlwapi.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    public static extern int AssocQueryStringW(uint flags, uint kind, string association, string extra, StringBuilder result, ref uint length);
}
'@
    }
    [uint32]$length = 32768
    $result = [Text.StringBuilder]::new([int]$length)
    # ASSOCSTR_PROGID, with flags 0 to include the user's effective choice.
    $status = [MarkWriter89Shell]::AssocQueryStringW(0, 20, '.md', $null, $result, [ref]$length)
    if ($status -ne 0) { throw ('Windows Shell could not resolve .md (HRESULT 0x{0:x8}).' -f $status) }
    $result.ToString()
}
function Observe-ExplorerOpen($State, $Label) {
    $choice = Read-MarkdownChoice
    $effective = Read-EffectiveMarkdownProgId
    if (!$choice.ProgId -or $choice.ProgId -match 'MarkWriter|OpenWith' -or $choice.ProgId -ine $effective) {
        $explicit = if ($choice.ProgId) { $choice.ProgId } else { '(no explicit .md choice found)' }
        throw "Expected the Settings choice to match the effective .md association. Recorded choice: $explicit; Shell: $effective."
    }
    if ($State.editorProgId -and $choice.ProgId -cne $State.editorProgId) { throw 'The selected editor ProgID changed.' }

    $file = Join-Path $fixture "$Label-89.md"
    $sentinel = [guid]::NewGuid().ToString('N').Substring(0, 8)
    [IO.File]::WriteAllText($file, "# MarkWriter 89 $Label" + [Environment]::NewLine + $sentinel)
    $hash = Get-Hash $file
    Start-Process explorer.exe -ArgumentList ('"{0}"' -f $fixture)
    Write-Host "In Explorer, double-click $Label-89.md normally. Check which editor opened the file."
    $editor = $State.editor
    if (!$editor) {
        $editor = (Read-Host 'Name of the editor that actually displayed the file').Trim()
        if (!$editor -or $editor -match 'MarkWriter|Open With') {
            throw 'Expected an independent editor to display the fixture.'
        }
    } else {
        Write-Host 'Only enter the code if the same editor as at Baseline displayed the fixture.'
    }
    if ((Read-Host 'Type the eight-character code shown in the editor') -cne $sentinel -or (Get-Hash $file) -ne $hash) {
        throw 'The competing editor did not display the exact unchanged fixture.'
    }
    $after = Read-MarkdownChoice
    if ($after.ProgId -cne $choice.ProgId -or $after.Hash -cne $choice.Hash -or $after.Source -cne $choice.Source -or
        (Read-EffectiveMarkdownProgId) -ine $effective) { throw 'Explorer opening changed the user choice.' }
    if (!$State.editor) { $State.editor = $editor; $State.editorProgId = $choice.ProgId }
    $State.operations += @{ phase = $Label; editor = $editor; progId = $choice.ProgId
                            explorerDisplayedExactFixture = $true; fixtureSha256 = $hash; choiceSource = $choice.Source }
}
function Save-Receipt($State) {
    $temp = "$receiptPath.tmp"
    $State | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $temp -Encoding UTF8
    Move-Item -LiteralPath $temp -Destination $receiptPath -Force
}
function Package-Receipt($Package) {
    @{ version = $Package.version; source = $Package.source
       installerSha256 = $Package.installerSha256; executableSha256 = $Package.executableSha256
       installedPreviewSha256 = Get-Hash $preview }
}

$expectedPrevious = @{ Baseline = 'Prepare'; Upgrade = 'Baseline'; Remove = 'Upgrade'; Rollback = 'Remove' }
if ($Phase -eq 'Prepare') {
    if (Test-Path -LiteralPath $statePath) {
        Assert-MarkWriterClosed
        $previous = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
        if ($previous.failurePhase -cne 'Prepare' -or $previous.phase) {
            throw 'Existing state is not a failed first Prepare. Preserve it and use the guest checkpoint for a clean restart.'
        }
        $archive = 'state-prepare-failed-' + [guid]::NewGuid().ToString('N')
        Rename-Item -LiteralPath $statePath -NewName $archive
        Write-Host "Preserved the failed Prepare receipt in $archive."
    }
    $package = Read-Package $baseline
    New-Item -ItemType Directory -Path $statePath, $fixture, $profile | Out-Null
    $state = @{ schemaVersion = 1; phase = ''; os = $os.Caption; build = $os.BuildNumber; architecture = 'x64'
                passed = $false; operations = @(); editor = $null; editorProgId = $null }
} else {
    $state = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
    if ($state.phase -cne $expectedPrevious[$Phase]) { throw "Expected the previous phase to be $($expectedPrevious[$Phase])." }
}

try {
    switch ($Phase) {
        Prepare {
            Install-Package $package
            $state.baseline = Package-Receipt $package
            [IO.File]::WriteAllText($saved, '# MarkWriter 89 preserved saved file')
            $state.savedSha256 = Get-Hash $saved
            Exercise-Recovery $baseline -Seed
            $state.workspaceSha256 = Get-Hash $workspace
            Write-Host 'Now choose a competing .md editor in Settings > Apps > Default apps before running Baseline.'
        }
        Baseline {
            Assert-PreservedFiles $state
            Initialize-PreviewFixture $state
            Observe-ExplorerOpen $state 'baseline'
        }
        Upgrade {
            $package = Read-Package $candidate
            if ($state.candidate) {
                Assert-MarkWriterClosed
                Assert-Installed $package
                if ($state.failurePhase -cne 'Upgrade' -or $state.candidate.installerSha256 -ne $package.installerSha256 -or
                    $state.candidate.executableSha256 -ne $package.executableSha256 -or
                    $state.candidate.installedPreviewSha256 -ne (Get-Hash $preview)) {
                    throw 'The recorded upgrade cannot safely be resumed.'
                }
                Assert-PreservedFiles $state
            } else {
                Install-Package $package
                Assert-PreservedFiles $state
                $state | Add-Member -NotePropertyName candidate -NotePropertyValue (Package-Receipt $package)
            }
            Exercise-Recovery $candidate
            $state.workspaceSha256 = Get-Hash $workspace
            Assert-PreviewAssociations $state
            Observe-ExplorerOpen $state 'upgraded'
        }
        Remove {
            Assert-MarkWriterClosed
            if ((Get-Hash $binary) -ne $state.candidate.executableSha256 -or
                (Get-Hash $preview) -ne $state.candidate.installedPreviewSha256 -or (Read-DefaultValue $server) -ine $preview) {
                throw 'The exact candidate must be present before the blocked uninstall.'
            }
            if ((Test-Path -LiteralPath $unowned) -or (Test-Path -LiteralPath $preserved)) { throw 'The unowned fixture name is already in use.' }
            [IO.File]::WriteAllText($preserved, 'MarkWriter 89 synthetic unowned file')
            $unownedHash = Get-Hash $preserved
            $from = $preserved.Replace("'", "''")
            $to = $unowned.Replace("'", "''")
            Invoke-ElevatedFileChange "Copy-Item -LiteralPath '$from' -Destination '$to' -ErrorAction Stop"
            $lock = [IO.File]::Open($preview, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
            try {
                $exit = Invoke-ElevatedProcess $uninstaller '/S'
                if ($exit -eq 0 -or (Get-Hash $binary) -ne $state.candidate.executableSha256 -or
                    (Get-Hash $preview) -ne $state.candidate.installedPreviewSha256 -or
                    !(Test-Path -LiteralPath $uninstaller) -or (Read-DefaultValue $server) -ine $preview -or
                    (Get-Hash $unowned) -ne $unownedHash) { throw 'The lock did not block removal while preserving exact files and registration.' }
                Assert-PreservedFiles $state
                Assert-PreviewAssociations $state
            } finally { $lock.Dispose() }
            Observe-ExplorerOpen $state 'blocked'

            Assert-MarkWriterClosed
            $exit = Invoke-ElevatedProcess $uninstaller '/S'
            if ($exit -ne 0 -or (Test-Path $binary) -or (Test-Path $preview) -or (Test-Path $uninstaller) -or
                (Read-DefaultValue $server) -or (Get-Hash $unowned) -ne $unownedHash) {
                throw 'The removal retry did not remove only the owned installation.'
            }
            foreach ($extension in '.md', '.markdown') {
                $key = Get-Item "HKLM:\Software\Classes\$extension\OpenWithProgids" -ErrorAction SilentlyContinue
                if ($key -and $null -ne $key.GetValue('MarkWriter.Markdown')) { throw 'Removal retained a MarkWriter Open With registration.' }
            }
            Assert-PreservedFiles $state
            Assert-PreviewAssociations $state
            Observe-ExplorerOpen $state 'removed'
            # Older installers require an empty install path after a complete removal.
            Invoke-ElevatedFileChange "Remove-Item -LiteralPath '$to' -ErrorAction Stop"
            if ((Get-Hash $preserved) -ne $unownedHash) { throw 'The preserved synthetic fixture changed.' }
            $state | Add-Member -NotePropertyName unownedSha256 -NotePropertyValue $unownedHash
        }
        Rollback {
            $package = Read-Package $baseline
            Install-Package $package
            Assert-PreservedFiles $state
            if ((Get-Hash $preserved) -ne $state.unownedSha256 -or (Get-Hash $preview) -ne $state.baseline.installedPreviewSha256) {
                throw 'Rollback did not preserve the unrelated file or restore the baseline preview binary.'
            }
            Assert-PreviewAssociations $state
            Observe-ExplorerOpen $state 'rolled-back'
            Exercise-Recovery $baseline
            Write-Host 'In the existing Explorer fixture folder, select Saved-89.md and enable the Preview pane.'
            $seenPreview = (Read-Host 'Paste the heading shown in the pane, or press Enter if no heading appears')
            $state | Add-Member -NotePropertyName rolledBackPreviewVisible -NotePropertyValue (
                $seenPreview -ceq 'MarkWriter 89 preserved saved file')
            Write-Host 'Close the Explorer Preview pane after recording the separate observation.'
            if ((Get-Hash $saved) -ne $state.savedSha256) { throw 'Recovery changed the synthetic saved file.' }
            $state.passed = $true
        }
    }
    $state.phase = $Phase
    if ($state.PSObject.Properties['failurePhase']) { $state.PSObject.Properties.Remove('failurePhase') }
    Save-Receipt $state
    Write-Host "Recorded $Phase in $receiptPath."
} catch {
    $state.passed = $false
    $state | Add-Member -NotePropertyName failurePhase -NotePropertyValue $Phase -Force
    Save-Receipt $state
    throw
}
