param([Parameter(Mandatory=$true)][string]$Path)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
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
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $bounds=[System.Windows.Forms.SystemInformation]::VirtualScreen
  $capture=[System.Drawing.Bitmap]::new($bounds.Width,$bounds.Height)
  $graphics=[System.Drawing.Graphics]::FromImage($capture)
  try {
    $graphics.CopyFromScreen($bounds.Left,$bounds.Top,0,0,$bounds.Size)
    $capture.Save((Join-Path (Get-Location) 'package-acceptance-results/os-dialog-failure.png'))
  } finally { $graphics.Dispose();$capture.Dispose() }
  throw 'No ordinary OS file dialog appeared within30s'
}
# CommonItemDialog may expose File name as an editable ComboBox rather than
# a standalone Edit. Wait for that real control after the owned window appears.
$field=$null
$value=$null
$inputCondition=[System.Windows.Automation.OrCondition]::new(
 [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Edit),
 [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::ComboBox))
for($attempt=0;$attempt -lt 300;$attempt++){
 $edits=$dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants,$inputCondition)
 foreach($edit in $edits){
  if(($edit.Current.Name -match '^File name' -or $edit.Current.AutomationId -eq '1148') -and -not $edit.Current.IsOffscreen){
   $pattern=$null
   if($edit.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern,[ref]$pattern)){$field=$edit;$value=$pattern;break}
  }
 }
 if($field){break}
 Start-Sleep -Milliseconds 100
}
if(-not $field){throw ('No File name input. Visible inputs: '+(($edits | ForEach-Object { $_.Current.Name+' / '+$_.Current.AutomationId+' / '+$_.Current.ControlType.ProgrammaticName }) -join ', '))}
$value.SetValue($Path)
$buttons=$dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Button))
foreach($button in $buttons) {
  if($button.Current.Name -match '^(Open|Save|Export)$') {
    $dialogTitle=$dialog.Current.Name
    $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
    Write-Output ('Completed OS dialog: '+$dialogTitle)
    exit 0
  }
}
throw 'No normal Open/Save confirmation button'
