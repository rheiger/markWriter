param([Parameter(Mandatory=$true)][string]$Path)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
# The runner exposes some standard Win32 controls as generic UIA panes. Operate
# their observed native Edit/Button handles when UIA patterns are unavailable.
# https://learn.microsoft.com/windows/win32/winmsg/wm-settext
# https://learn.microsoft.com/windows/win32/controls/bm-click
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class PackageDialogControl {
 [DllImport("user32.dll",CharSet=CharSet.Unicode,EntryPoint="SendMessageTimeoutW",SetLastError=true)]
 public static extern IntPtr SetText(IntPtr hwnd,uint message,UIntPtr wParam,string text,uint flags,uint timeout,out UIntPtr result);
 [DllImport("user32.dll",EntryPoint="SendMessageTimeoutW",SetLastError=true)]
 public static extern IntPtr Click(IntPtr hwnd,uint message,UIntPtr wParam,IntPtr lParam,uint flags,uint timeout,out UIntPtr result);
 [DllImport("user32.dll")]
 public static extern bool SetForegroundWindow(IntPtr hwnd);
}
'@
try {
$root = [System.Windows.Automation.AutomationElement]::RootElement
$condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ClassNameProperty, '#32770')
$applicationIds=@(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $env:MARKWRITER_BINARY } | ForEach-Object ProcessId)
if(-not $applicationIds.Count){throw 'Installed test application process not found for OS dialog ownership'}
$dialog = $null
for ($attempt=0; $attempt -lt 300; $attempt++) {
  $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)
  foreach ($window in $windows) {
    if (($window.Current.Name -match 'Open|Save|Export') -and ($applicationIds -contains $window.Current.ProcessId) -and -not $window.Current.IsOffscreen) { $dialog=$window; break }
  }
  if ($dialog) { break }
  Start-Sleep -Milliseconds 100
}
if (-not $dialog) {
  $visible=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
  $visible | ForEach-Object { Write-Output ($_.Current.Name+' / '+$_.Current.ClassName+' / PID '+$_.Current.ProcessId) }
  throw 'No ordinary OS file dialog appeared within30s'
}
# CommonItemDialog may expose File name as an editable ComboBox rather than
# a standalone Edit. Wait for that real control after the owned window appears.
$field=$null
$value=$null
$inputCondition=[System.Windows.Automation.OrCondition]::new(
 [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Edit),
 [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ClassNameProperty,'Edit'))
for($attempt=0;$attempt -lt 300;$attempt++){
 $edits=$dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants,$inputCondition)
 foreach($edit in $edits){
  if(($edit.Current.Name -match '^File name' -or $edit.Current.AutomationId -eq '1148') -and -not $edit.Current.IsOffscreen){
   $pattern=$null
   if($edit.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern,[ref]$pattern)){$field=$edit;$value=$pattern;break}
   if($edit.Current.ClassName -eq 'Edit' -and $edit.Current.NativeWindowHandle -ne 0){$field=$edit;break}
  }
 }
 if($field){break}
 Start-Sleep -Milliseconds 100
}
if(-not $field){throw ('No File name input. Visible inputs: '+(($edits | ForEach-Object { $_.Current.Name+' / '+$_.Current.AutomationId+' / '+$_.Current.ControlType.ProgrammaticName }) -join ', '))}
if($value){$value.SetValue($Path)}else{
 $messageResult=[UIntPtr]::Zero
 if([PackageDialogControl]::SetText([IntPtr]$field.Current.NativeWindowHandle,0x000C,[UIntPtr]::Zero,$Path,2,5000,[ref]$messageResult) -eq [IntPtr]::Zero -or $messageResult -eq [UIntPtr]::Zero){throw 'Native filename Edit rejected WM_SETTEXT'}
}
$buttonCondition=[System.Windows.Automation.OrCondition]::new(
 [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Button),
 [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ClassNameProperty,'Button'))
$buttons=$dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants,$buttonCondition)
foreach($button in $buttons) {
  if($button.Current.Name -match '^(Open|Save|Export)$') {
    $dialogTitle=$dialog.Current.Name
    $pattern=$null
    if($button.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern,[ref]$pattern)){$pattern.Invoke()}else{
     if($button.Current.ClassName -ne 'Button' -or $button.Current.NativeWindowHandle -eq 0){throw 'Confirmation has no supported native button'}
     [PackageDialogControl]::SetForegroundWindow([IntPtr]$dialog.Current.NativeWindowHandle) | Out-Null
     $messageResult=[UIntPtr]::Zero
     if([PackageDialogControl]::Click([IntPtr]$button.Current.NativeWindowHandle,0x00F5,[UIntPtr]::Zero,[IntPtr]::Zero,2,5000,[ref]$messageResult) -eq [IntPtr]::Zero){throw 'Native confirmation button timed out'}
    }
    Write-Output ('Completed OS dialog: '+$dialogTitle)
    exit 0
  }
}
throw 'No normal Open/Save confirmation button'

} catch {
 $dialogFailure=$_
 try {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $bounds=[System.Windows.Forms.SystemInformation]::VirtualScreen
  $capture=[System.Drawing.Bitmap]::new($bounds.Width,$bounds.Height)
  $graphics=[System.Drawing.Graphics]::FromImage($capture)
  try {
   $graphics.CopyFromScreen($bounds.Left,$bounds.Top,0,0,$bounds.Size)
   $capture.Save((Join-Path (Get-Location) 'package-acceptance-results/os-dialog-failure.png'))
  } finally {$graphics.Dispose();$capture.Dispose()}
  if($dialog){
   $dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition) | Select-Object -First 300 | ForEach-Object {
    @{name=$_.Current.Name;id=$_.Current.AutomationId;type=$_.Current.ControlType.ProgrammaticName;class=$_.Current.ClassName;pid=$_.Current.ProcessId;offscreen=$_.Current.IsOffscreen}
   } | ConvertTo-Json -Depth 4 | Set-Content package-acceptance-results/native-dialog-tree.json
  }
 } catch {Write-Warning ('Native diagnostic capture failed: '+$_)}
 throw $dialogFailure
}
