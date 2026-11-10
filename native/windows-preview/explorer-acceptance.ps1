# Disposable interactive Windows x64 profile only; run at medium integrity.
param(
  [string]$DllPath,
  [string]$ResultPath,
  [string]$AppPath,
  [switch]$Diagnostic,
  [switch]$Bundled,
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-fA-F]{64}$')][string]$ExpectedSha256,
  [string]$InstallerPath = (Join-Path $PSScriptRoot 'install.ps1')
)
$ErrorActionPreference = 'Stop'
if ($Bundled) {
  if (!$env:GITHUB_ACTIONS) { throw 'The bundled acceptance fixture requires a disposable GitHub Actions runner.' }
  $AppPath = $env:MARKWRITER_BINARY
  $DllPath = Join-Path (Split-Path -Parent $AppPath) 'MarkWriterPreview.dll'
  $ResultPath = $env:MARKWRITER_PREVIEW_RESULT
}
if (!$DllPath -or !$ResultPath) { throw 'DLL and result paths are required.' }
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class PreviewProcessIntegrity {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [StructLayout(LayoutKind.Sequential)]
  public struct WindowRect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out WindowRect rect);
  [DllImport("shlwapi.dll", CharSet=CharSet.Unicode, ExactSpelling=true)]
  static extern int AssocQueryStringW(uint flags, uint kind, string association, string verb, StringBuilder buffer, ref uint capacity);
  public static string OpenCommand(string extension) {
    uint capacity=32768;
    var command=new StringBuilder((int)capacity);
    int result=AssocQueryStringW(0, 1, extension, "open", command, ref capacity);
    return result == 0 ? command.ToString() : String.Format("HRESULT 0x{0:x8}", result);
  }
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool GetTokenInformation(IntPtr token, int kind, IntPtr info, int length, out int needed);
  [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);
  [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthority(IntPtr sid, uint index);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  public static int Rid(System.Diagnostics.Process p) {
    IntPtr token; if (!OpenProcessToken(p.Handle, 8, out token)) throw new System.ComponentModel.Win32Exception();
    try { int size; GetTokenInformation(token, 25, IntPtr.Zero, 0, out size); IntPtr buf = Marshal.AllocHGlobal(size);
      try { if (!GetTokenInformation(token,25,buf,size,out size)) throw new System.ComponentModel.Win32Exception();
        IntPtr sid=Marshal.ReadIntPtr(buf); byte count=Marshal.ReadByte(GetSidSubAuthorityCount(sid)); return Marshal.ReadInt32(GetSidSubAuthority(sid,(uint)(count-1)));
      } finally { Marshal.FreeHGlobal(buf); }
    } finally { CloseHandle(token); }
  }
}
'@
$dll = (Resolve-Path -LiteralPath $DllPath).Path
if (!$Diagnostic -and !$AppPath) { throw 'A production acceptance receipt requires AppPath.' }
if (Test-Path -LiteralPath $ResultPath) { throw 'Result path already exists; refusing stale evidence.' }
if ((Get-FileHash -LiteralPath $dll -Algorithm SHA256).Hash -ine $ExpectedSha256) { throw 'Installed DLL digest does not match the expected packaged asset.' }
$installer = if (!$Bundled) { (Resolve-Path -LiteralPath $InstallerPath).Path }
$clsid='{A448B833-8E1A-4EA4-BCC4-272134A64E97}'
$iid='{8895b1c6-b41f-4c1c-a562-0d564250836f}'
if (Test-Path "HKCU:\Software\Classes\CLSID\$clsid") { throw 'Profile already contains the MarkWriter preview class.' }
foreach ($ext in @('.md','.markdown')) { if (Test-Path "HKCU:\Software\Classes\$ext\shellex\$iid") { throw 'Profile already contains a per-user preview key.' } }
$list='HKCU:\Software\Microsoft\Windows\CurrentVersion\PreviewHandlers'
if ((Test-Path $list) -and $null -ne (Get-Item $list).GetValue($clsid)) { throw 'Profile already contains a preview list entry.' }
$root = Join-Path $env:TEMP ('markwriter-preview-' + [guid]::NewGuid())
$resolvedApp = if ($AppPath) { (Resolve-Path -LiteralPath $AppPath).Path } else { $null }
foreach ($p in @(if ($resolvedApp) { Get-Process -Name ([IO.Path]::GetFileNameWithoutExtension($resolvedApp)) -ErrorAction SilentlyContinue })) {
  $processPath = $null
  try { $processPath = $p.Path } catch { throw 'Could not establish whether MarkWriter is already running.' }
  if (!$processPath -or $processPath -ieq $resolvedApp) { throw 'MarkWriter is already running or its path is unavailable; use a clean disposable profile.' }
}
New-Item -ItemType Directory $root | Out-Null
function Save-FixtureUIA {
  # Fixture-window-only, bounded UIA evidence; never capture the full desktop.
  try {
    $rootElement = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$window.HWND)
    $nodes = $rootElement.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
    $snapshot = @($nodes | Select-Object -First 200 | ForEach-Object {
      try { @{name=([string]$_.Current.Name).Substring(0, [Math]::Min(160, ([string]$_.Current.Name).Length)); controlType=[string]$_.Current.ControlType.ProgrammaticName} } catch {}
    })
    @{fixtureWindow=$true; nodeCount=$nodes.Count; nodes=$snapshot} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath ($ResultPath + '.uia.json') -Encoding UTF8
  } catch { Write-Warning "Could not capture fixture-window UIA diagnostics: $_" }
}
$shell = New-Object -ComObject Shell.Application
$window = $null
$appProcess = $null
$cases = [Collections.Generic.List[string]]::new()
try {
  if (!$Bundled) { & $installer -Action Enable -DllPath $dll }
  $fixtures = @(
    @{ Name='Ä Markdown preview.md'; Text="# Explorer evidence`r`nThis is safe <script>inert</script> Grüße 😀"; Expected='Explorer evidence' },
    @{ Name='Ö second document.markdown'; Text='# Second selected document'; Expected='Second selected document' },
    @{ Name='large.md'; Text=('# Oversized evidence' + ('x' * 1100000)); Expected='Preview truncated at 1 MiB.' }
  )
  foreach ($f in $fixtures) { [IO.File]::WriteAllText((Join-Path $root $f.Name), $f.Text, [Text.UTF8Encoding]::new($false)) }
  # Start Explorer explicitly: a hosted runner may have no desktop shell to
  # receive Shell.Application.Open. The temporary fixture path is quoted.
  Start-Process -FilePath "$env:WINDIR\explorer.exe" -ArgumentList ('"{0}"' -f $root) | Out-Null
  for ($i=0; $i -lt 100 -and !$window; $i++) {
    Start-Sleep -Milliseconds 200
    foreach ($candidate in $shell.Windows()) { try { $location = [Uri]$candidate.LocationURL; if ($location.IsFile -and [IO.Path]::GetFullPath($location.LocalPath).TrimEnd('\') -ieq [IO.Path]::GetFullPath($root).TrimEnd('\')) { $window=$candidate; break } } catch {} }
  }
  if (!$window) {
    $seen = @($shell.Windows() | ForEach-Object { try { [string]$_.LocationURL } catch { '<unavailable>' } } | Select-Object -First 20)
    Write-Host ("Explorer windows observed: " + ($seen -join ', '))
    Write-Host ("Explorer process count: " + @(Get-Process explorer -ErrorAction SilentlyContinue).Count)
    throw 'Explorer fixture window was not found through Shell.Application'
  }
  $explorerHwnd = [IntPtr]$window.HWND
  [PreviewProcessIntegrity]::SetForegroundWindow($explorerHwnd) | Out-Null
  Start-Sleep -Milliseconds 200
  if ([PreviewProcessIntegrity]::GetForegroundWindow() -ne $explorerHwnd) { throw 'Fixture Explorer window did not become foreground' }
  # Runner profile is disposable. Alt+P toggles Preview pane; if already enabled,
  # retry once after a failed content observation rather than accepting no result.
  [System.Windows.Forms.SendKeys]::SendWait('%p')
  function Select-And-Observe($fixture) {
    $path=Join-Path $root $fixture.Name
    $beforeHash=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
    $beforeTime=(Get-Item -LiteralPath $path).LastWriteTimeUtc.Ticks
    $item=$window.Document.Folder.ParseName($fixture.Name)
    if (!$item) { throw 'Explorer could not resolve fixture' }
    $window.Document.SelectItem($item, 29) # select, focus, deselect others, ensure visible
    $observed=$false
    for ($attempt=0; $attempt -lt 80 -and !$observed; $attempt++) {
      Start-Sleep -Milliseconds 250
      $element=[System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$window.HWND)
      $all=$element.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
      foreach ($child in $all) {
        try {
          $pattern=$null
          if ($child.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern,[ref]$pattern)) {
            if ($pattern.DocumentRange.GetText(-1).Contains($fixture.Expected)) { $observed=$true; break }
          }
        } catch {}
      }
    }
    if (!$observed) { throw "Explorer did not expose expected preview text for $($fixture.Name)" }
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $beforeHash -or (Get-Item -LiteralPath $path).LastWriteTimeUtc.Ticks -ne $beforeTime) { throw 'Preview changed source file' }
  }
  try { Select-And-Observe $fixtures[0] } catch { [System.Windows.Forms.SendKeys]::SendWait('%p'); Select-And-Observe $fixtures[0] }
  $cases.Add('Explorer Markdown Unicode content and source preservation')
  Select-And-Observe $fixtures[1]; $cases.Add('Explorer markdown extension and selection change')
  $window.Width = $window.Width - 100; $window.Height = $window.Height - 100
  Select-And-Observe $fixtures[0]; $cases.Add('preview survives Explorer resize')
  if ($Bundled) {
    [uint32]$explorerPid=0
    [PreviewProcessIntegrity]::GetWindowThreadProcessId($explorerHwnd, [ref]$explorerPid) | Out-Null
    try { $explorerIntegrity = [PreviewProcessIntegrity]::Rid((Get-Process -Id $explorerPid)) }
    catch { $explorerIntegrity = "not queryable at medium integrity: $_" }
    Write-Host "Fixture Explorer PID $explorerPid, integrity $explorerIntegrity"
    # Explorer can launch through a desktop process that predates the runner's
    # profile override. Both possible workspaces belong to this disposable user.
    $workspaces = @(
      (Join-Path $env:LOCALAPPDATA 'com.markwriter.app/workspace.json')
      (Join-Path $env:MARKWRITER_PROFILE_DIR 'workspace.json')
    )
    function Read-ActiveFixture($workspace) {
      if (!(Test-Path -LiteralPath $workspace -PathType Leaf)) { return }
      try {
        $snapshot = Get-Content -Raw -LiteralPath $workspace | ConvertFrom-Json
        $snapshot.documents | Where-Object { $_.id -eq $snapshot.activeId } | Select-Object -First 1
      } catch { return }
    }
    function Trace-WebView($editor) {
      try {
        $all = Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'"
        $all | Where-Object { $_.ParentProcessId -eq $editor.Id } | ForEach-Object {
          Write-Host "WebView2 child PID $($_.ProcessId), image $($_.ExecutablePath)"
        }
      } catch { Write-Host "Could not query WebView2 processes: $_" }
      $webviewProfile = Join-Path $env:LOCALAPPDATA 'com.markwriter.app/EBWebView'
      Write-Host "Default WebView2 data folder present: $(Test-Path -LiteralPath $webviewProfile)"
    }
    function Trace-DirectLaunch($fixturePath, $forceRuntime, $withFile) {
      $profileOverride = $env:MARKWRITER_PROFILE_DIR
      $runtimeOverride = $env:WEBVIEW2_BROWSER_EXECUTABLE_FOLDER
      $variant = "runtime-$forceRuntime-file-$withFile"
      try {
        $env:MARKWRITER_PROFILE_DIR = Join-Path $root $variant
        if (!$forceRuntime) { Remove-Item Env:WEBVIEW2_BROWSER_EXECUTABLE_FOLDER -ErrorAction SilentlyContinue }
        $stdout = "$ResultPath.$variant.stdout.log"
        $stderr = "$ResultPath.$variant.stderr.log"
        $params = @{
          FilePath=$resolvedApp; WorkingDirectory=$root; PassThru=$true
          RedirectStandardOutput=$stdout; RedirectStandardError=$stderr
        }
        if ($withFile) { $params.ArgumentList = ('"{0}"' -f $fixturePath) }
        $direct = Start-Process @params
        $snapshot = Join-Path $env:MARKWRITER_PROFILE_DIR 'workspace.json'
        $active = $null
        for ($i=0; $i -lt 50 -and !$direct.HasExited -and !$active; $i++) {
          Start-Sleep -Milliseconds 200
          $active = Read-ActiveFixture $snapshot
        }
        $direct.Refresh()
        Write-Host "Direct ${variant}: active '$($active.title)', chars $($active.content.Length), exited $($direct.HasExited), hwnd $($direct.MainWindowHandle)"
        if (!$direct.HasExited) { Trace-WebView $direct }
      } catch { Write-Host "Direct $variant failed: $_" }
      finally {
        if ($direct -and !$direct.HasExited) {
          $direct.CloseMainWindow() | Out-Null
          if (!$direct.WaitForExit(2000)) { $direct.Kill(); $direct.WaitForExit() }
        }
        foreach ($log in @($stdout,$stderr)) {
          if ($log -and (Test-Path -LiteralPath $log)) { Get-Content -LiteralPath $log | Select-Object -First 25 | Out-Host }
        }
        $env:MARKWRITER_PROFILE_DIR = $profileOverride
        $env:WEBVIEW2_BROWSER_EXECUTABLE_FOLDER = $runtimeOverride
      }
    }
    function Open-ThroughExplorer($fixture) {
      $item = $window.Document.Folder.ParseName($fixture.Name)
      if (!$item) { throw 'Explorer file activation fixture missing' }
      $ext = [IO.Path]::GetExtension($fixture.Name)
      Write-Host "Effective $ext Open command: $([PreviewProcessIntegrity]::OpenCommand($ext))"
      [PreviewProcessIntegrity]::SetForegroundWindow($explorerHwnd) | Out-Null
      $window.Document.SelectItem($item, 29)
      if ([PreviewProcessIntegrity]::GetForegroundWindow() -ne $explorerHwnd) { throw 'Explorer was not foreground for file activation' }
      # Enter activates the selected file through the same default verb as double-click.
      [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
      $expectedPath = Join-Path $root $fixture.Name
      $fixtureEditor = $null
      for ($i=0; $i -lt 100; $i++) {
        Start-Sleep -Milliseconds 200
        $running = @(Get-Process markwriter -ErrorAction SilentlyContinue | Where-Object { $_.Path -ieq $resolvedApp -and $_.MainWindowHandle })
        foreach ($process in $running) {
          $fixtureEditor = $process
          # The active document and exact source are flushed by the ordinary UI
          # after opening. This remains observable when WebView2 exposes no
          # document-level UI Automation text patterns to the harness.
          foreach ($workspace in $workspaces) {
            $active = Read-ActiveFixture $workspace
            if ($active -and $active.title -ceq $fixture.Name -and
                ($active.path -ieq $expectedPath -or $active.path -ieq "\\?\$expectedPath") -and
                $active.content -ceq $fixture.Text) { return $process }
          }
          try {
            $appRoot = [System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
            $match = [System.Windows.Automation.PropertyCondition]::new(
              [System.Windows.Automation.AutomationElement]::NameProperty, $fixture.Expected)
            if ($appRoot.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $match)) { return $process }
            $tabMatch = [System.Windows.Automation.PropertyCondition]::new(
              [System.Windows.Automation.AutomationElement]::NameProperty, $fixture.Name)
            $tab = $appRoot.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $tabMatch)
            if (!$tab) { continue }
            $selection = $null
            if (!$tab.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern,[ref]$selection) -or
                !$selection.Current.IsSelected) { continue }
            # Chromium may expose the editor as a single accessible text field.
            $condition = [System.Windows.Automation.PropertyCondition]::new(
              [System.Windows.Automation.AutomationElement]::IsTextPatternAvailableProperty, $true)
            foreach ($node in $appRoot.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)) {
              $text=$null
              if ($node.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern,[ref]$text) -and
                  $text.DocumentRange.GetText(32768).Contains($fixture.Expected)) { return $process }
            }
          } catch {}
        }
      }
      Get-Process markwriter -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host "Observed editor PID $($_.Id), path $($_.Path), window $($_.MainWindowTitle)"
        if ($_.Path -ine $resolvedApp -or !$_.MainWindowHandle) { return }
        $hwnd = $_.MainWindowHandle
        try {
          $element = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
          Write-Host "Editor window class: $($element.Current.ClassName)"
          $nodes = $element.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
          Write-Host "Editor accessibility nodes: $($nodes.Count)"
          $nodes | Select-Object -First 35 | ForEach-Object {
            try { Write-Host "$($_.Current.ControlType.ProgrammaticName) $($_.Current.Name)" } catch {}
          }
          Add-Type -AssemblyName System.Drawing
          [PreviewProcessIntegrity]::SetForegroundWindow($hwnd) | Out-Null
          $bounds = [PreviewProcessIntegrity+WindowRect]::new()
          if ([PreviewProcessIntegrity]::GetForegroundWindow() -eq $hwnd -and
              [PreviewProcessIntegrity]::GetWindowRect($hwnd, [ref]$bounds)) {
            $rect = [Drawing.Rectangle]::FromLTRB($bounds.Left, $bounds.Top, $bounds.Right, $bounds.Bottom)
            $rect = [Drawing.Rectangle]::Intersect($rect, [System.Windows.Forms.SystemInformation]::VirtualScreen)
            if ($rect.Width -gt 0 -and $rect.Height -gt 0) {
              $bitmap = [Drawing.Bitmap]::new($rect.Width, $rect.Height)
              try {
                $graphics = [Drawing.Graphics]::FromImage($bitmap)
                try { $graphics.CopyFromScreen($rect.Location, [Drawing.Point]::Empty, $rect.Size) }
                finally { $graphics.Dispose() }
                $bitmap.Save("$ResultPath.app.png", [Drawing.Imaging.ImageFormat]::Png)
              } finally { $bitmap.Dispose() }
            }
          }
        } catch { Write-Host "Could not inspect the launched editor window: $_" }
      }
      foreach ($workspace in $workspaces) {
        $active = Read-ActiveFixture $workspace
        if ($active) { Write-Host "Active fixture at $workspace is '$($active.title)' with $($active.content.Length) characters." }
        else { Write-Host "Workspace $workspace present: $(Test-Path -LiteralPath $workspace)" }
      }
      if ($fixtureEditor) {
        Trace-WebView $fixtureEditor
        $fixtureEditor.CloseMainWindow() | Out-Null
        if (!$fixtureEditor.WaitForExit(2000)) { $fixtureEditor.Kill(); $fixtureEditor.WaitForExit() }
        Trace-DirectLaunch $expectedPath $false $true
        Trace-DirectLaunch $expectedPath $true $true
        Trace-DirectLaunch $expectedPath $false $false
      }
      throw "Explorer open did not display the document body for $($fixture.Name)"
    }
    $appProcess = Open-ThroughExplorer $fixtures[0]
    if ([PreviewProcessIntegrity]::Rid($appProcess) -ne 8192) { throw 'Explorer started the editor above medium integrity' }
    $cases.Add('cold Explorer Open verb opens a Unicode Markdown path at medium integrity')
    $warm = Open-ThroughExplorer $fixtures[1]
    if ($warm.Id -ne $appProcess.Id) { throw 'Warm shell-open did not reuse the editor process' }
    $cases.Add('warm Explorer Open verb opens markdown in the running editor')
    Select-And-Observe $fixtures[1]; $cases.Add('Explorer preview with MarkWriter open')
  } elseif ($resolvedApp) {
    $appProcess = Start-Process -FilePath $resolvedApp -PassThru
    Start-Sleep -Seconds 3
    if ($appProcess.HasExited) { throw 'MarkWriter did not remain open' }
    Select-And-Observe $fixtures[1]; $cases.Add('Explorer preview with MarkWriter open')
  } else { Write-Host 'DIAGNOSTIC ONLY: MarkWriter-open case was not run; no acceptance receipt will be written.' }
  Select-And-Observe $fixtures[2]; $cases.Add('Explorer oversized preview bounded and source preserved')
  $hosts = @(Get-Process prevhost -ErrorAction SilentlyContinue | Where-Object {
    try { @($_.Modules | Where-Object { $_.FileName -ieq $dll }).Count -gt 0 } catch { $false }
  })
  if (!$hosts.Count) { throw 'Cannot identify Prevhost with the tested DLL loaded' }
  foreach ($hostProcess in $hosts) { if ([PreviewProcessIntegrity]::Rid($hostProcess) -ne 4096) { throw 'Preview DLL is not hosted at low integrity' } }
  $cases.Add('x64 Prevhost loaded tested DLL at low integrity')
  Save-FixtureUIA
  $window.Quit(); $window=$null
  if (!$Bundled) { & $installer -Action Disable -DllPath $dll }
  $iid='{8895b1c6-b41f-4c1c-a562-0d564250836f}'
  foreach ($ext in @('.md','.markdown')) {
    $key="HKCU:\Software\Classes\$ext\shellex\$iid"
    if ((Test-Path $key) -and (Get-Item $key).GetValue('') -eq '{A448B833-8E1A-4EA4-BCC4-272134A64E97}') { throw 'Registration cleanup failed' }
  }
  if (!$Bundled) { $cases.Add('opt-in registration removed') }
  if ((Get-FileHash -LiteralPath $dll -Algorithm SHA256).Hash -ine $ExpectedSha256) { throw 'Installed DLL changed during acceptance.' }
  $cases.Add('installed DLL matches packaged SHA-256')
} finally {
  if ($window) {
    Save-FixtureUIA
    $window.Quit()
  }
  if ($appProcess -and !$appProcess.HasExited) { $appProcess.CloseMainWindow() | Out-Null; if (!$appProcess.WaitForExit(5000)) { $appProcess.Kill(); $appProcess.WaitForExit() } }
  if (!$Bundled) { & $installer -Action Disable -DllPath $dll }
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}

if (Test-Path -LiteralPath $root) { throw 'Fixture cleanup failed' }
if ($Diagnostic) { Write-Host 'DIAGNOSTIC ONLY: Explorer and cleanup checks passed; no acceptance receipt written.'; return }
$os = Get-CimInstance Win32_OperatingSystem
@{passed=$true; baseline=("{0} build {1}, {2}" -f $os.Caption,$os.BuildNumber,$os.OSArchitecture); cases=@($cases.ToArray())} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ResultPath -Encoding UTF8
