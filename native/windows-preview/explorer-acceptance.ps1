# Disposable interactive Windows x64 profile only; run at medium integrity.
param(
  [Parameter(Mandatory=$true)][string]$DllPath,
  [Parameter(Mandatory=$true)][string]$ResultPath,
  [Parameter(Mandatory=$true)][string]$AppPath,
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-fA-F]{64}$')][string]$ExpectedSha256,
  [string]$InstallerPath = (Join-Path $PSScriptRoot 'install.ps1')
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class PreviewProcessIntegrity {
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
if (Test-Path -LiteralPath $ResultPath) { throw 'Result path already exists; refusing stale evidence.' }
if ((Get-FileHash -LiteralPath $dll -Algorithm SHA256).Hash -ine $ExpectedSha256) { throw 'Installed DLL digest does not match the expected packaged asset.' }
$installer = (Resolve-Path -LiteralPath $InstallerPath).Path
$clsid='{A448B833-8E1A-4EA4-BCC4-272134A64E97}'
$iid='{8895b1c6-b41f-4c1c-a562-0d564250836f}'
if (Test-Path "HKCU:\Software\Classes\CLSID\$clsid") { throw 'Profile already contains the MarkWriter preview class.' }
foreach ($ext in @('.md','.markdown')) { if (Test-Path "HKCU:\Software\Classes\$ext\shellex\$iid") { throw 'Profile already contains a per-user preview key.' } }
$list='HKCU:\Software\Microsoft\Windows\CurrentVersion\PreviewHandlers'
if ((Test-Path $list) -and $null -ne (Get-Item $list).GetValue($clsid)) { throw 'Profile already contains a preview list entry.' }
$root = Join-Path $env:TEMP ('markwriter-preview-' + [guid]::NewGuid())
$resolvedApp = (Resolve-Path -LiteralPath $AppPath).Path
foreach ($p in Get-Process -ErrorAction SilentlyContinue) {
  try { if ($p.Path -and $p.Path -ieq $resolvedApp) { throw 'MarkWriter is already running; use a clean disposable profile.' } } catch [System.ComponentModel.Win32Exception] {}
}
New-Item -ItemType Directory $root | Out-Null
$shell = New-Object -ComObject Shell.Application
$window = $null
$appProcess = $null
$cases = [Collections.Generic.List[string]]::new()
try {
  & $installer -Action Enable -DllPath $dll
  $fixtures = @(
    @{ Name='Ä-preview.md'; Text="# Explorer evidence`r`nThis is safe <script>inert</script> Grüße 😀"; Expected='Explorer evidence' },
    @{ Name='second.markdown'; Text='# Second selected document'; Expected='Second selected document' },
    @{ Name='large.md'; Text=('# Oversized evidence' + ('x' * 1100000)); Expected='Preview truncated at 1 MiB.' }
  )
  foreach ($f in $fixtures) { [IO.File]::WriteAllText((Join-Path $root $f.Name), $f.Text, [Text.UTF8Encoding]::new($false)) }
  $shell.Open($root)
  for ($i=0; $i -lt 100 -and !$window; $i++) {
    Start-Sleep -Milliseconds 200
    foreach ($candidate in $shell.Windows()) { try { if ($candidate.Document.Folder.Self.Path -eq $root) { $window=$candidate; break } } catch {} }
  }
  if (!$window) { throw 'Explorer window did not open' }
  $app = New-Object -ComObject WScript.Shell
  if (!$app.AppActivate([int]$window.HWND)) { throw 'Explorer did not activate' }
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
  $appProcess = Start-Process -FilePath $resolvedApp -PassThru
  Start-Sleep -Seconds 3
  if ($appProcess.HasExited) { throw 'MarkWriter did not remain open' }
  Select-And-Observe $fixtures[1]; $cases.Add('Explorer preview with MarkWriter open')
  Select-And-Observe $fixtures[2]; $cases.Add('Explorer oversized preview bounded and source preserved')
  $hosts = @(Get-Process prevhost -ErrorAction SilentlyContinue | Where-Object {
    try { @($_.Modules | Where-Object { $_.FileName -ieq $dll }).Count -gt 0 } catch { $false }
  })
  if (!$hosts.Count) { throw 'Cannot identify Prevhost with the tested DLL loaded' }
  foreach ($hostProcess in $hosts) { if ([PreviewProcessIntegrity]::Rid($hostProcess) -ne 4096) { throw 'Preview DLL is not hosted at low integrity' } }
  $cases.Add('x64 Prevhost loaded tested DLL at low integrity')
  $window.Quit(); $window=$null
  & $installer -Action Disable -DllPath $dll
  $iid='{8895b1c6-b41f-4c1c-a562-0d564250836f}'
  foreach ($ext in @('.md','.markdown')) {
    $key="HKCU:\Software\Classes\$ext\shellex\$iid"
    if ((Test-Path $key) -and (Get-Item $key).GetValue('') -eq '{A448B833-8E1A-4EA4-BCC4-272134A64E97}') { throw 'Registration cleanup failed' }
  }
  $cases.Add('opt-in registration removed')
  if ((Get-FileHash -LiteralPath $dll -Algorithm SHA256).Hash -ine $ExpectedSha256) { throw 'Installed DLL changed during acceptance.' }
  $cases.Add('installed DLL matches packaged SHA-256')
} finally {
  if ($window) { $window.Quit() }
  if ($appProcess -and !$appProcess.HasExited) { $appProcess.CloseMainWindow() | Out-Null; if (!$appProcess.WaitForExit(5000)) { $appProcess.Kill(); $appProcess.WaitForExit() } }
  & $installer -Action Disable -DllPath $dll
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}

if (Test-Path -LiteralPath $root) { throw 'Fixture cleanup failed' }
$os = Get-CimInstance Win32_OperatingSystem
@{passed=$true; baseline=("{0} build {1}, {2}" -f $os.Caption,$os.BuildNumber,$os.OSArchitecture); cases=@($cases.ToArray())} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ResultPath -Encoding UTF8
