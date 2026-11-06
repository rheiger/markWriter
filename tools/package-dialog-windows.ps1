param([Parameter(Mandatory=$true)][string]$Path)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::RootElement
$condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ClassNameProperty, '#32770')
$dialog = $null
for ($attempt=0; $attempt -lt 100; $attempt++) {
  $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $condition)
  foreach ($window in $windows) {
    if ($window.Current.Name -match 'Open|Save|Export') { $dialog=$window; break }
  }
  if ($dialog) { break }
  Start-Sleep -Milliseconds 100
}
if (-not $dialog) { throw 'No ordinary OS file dialog appeared' }
$edits = $dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Edit))
$field = $null
foreach ($edit in $edits) {
  if ($edit.Current.Name -match '^File name' -or $edit.Current.AutomationId -eq '1148') { $field=$edit; break }
}
if (-not $field) { throw ('No File name edit. Visible edits: '+(($edits | ForEach-Object { $_.Current.Name+' / '+$_.Current.AutomationId }) -join ', ')) }
$value = $field.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
$value.SetValue($Path)
$buttons=$dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Button))
foreach($button in $buttons) {
  if($button.Current.Name -match '^(Open|Save|Export)$') {
    $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
    Write-Output ('Completed OS dialog: '+$dialog.Current.Name)
    exit 0
  }
}
throw 'No normal Open/Save confirmation button'
