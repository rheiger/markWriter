[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][ValidateSet('Enable','Disable')][string]$Action,
  [string]$DllPath
)
$ErrorActionPreference = 'Stop'
$clsid = '{A448B833-8E1A-4EA4-BCC4-272134A64E97}'
$iid = '{8895b1c6-b41f-4c1c-a562-0d564250836f}'
$base = 'HKCU:\Software\Classes'
$class = "$base\CLSID\$clsid"
$list = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\PreviewHandlers'
$targets = @("$base\.md\shellex\$iid", "$base\.markdown\shellex\$iid")
function DefaultValue([string]$key) {
  if (!(Test-Path -LiteralPath $key)) { return $null }
  return (Get-Item -LiteralPath $key).GetValue('', $null, 'DoNotExpandEnvironmentNames')
}
if ($Action -eq 'Enable') {
  if (!$DllPath) { throw 'Specify the absolute path to MarkWriterPreview.dll.' }
  if (![IO.Path]::IsPathRooted($DllPath)) { throw 'DllPath must be absolute.' }
  $dll = (Resolve-Path -LiteralPath $DllPath).Path
  if (!(Test-Path -LiteralPath $dll -PathType Leaf)) { throw 'DLL not found.' }
  # Never overwrite an existing per-user preview registration or an unrelated class.
  foreach ($target in $targets) {
    $existing = DefaultValue $target
    if ($null -ne $existing -and $existing -ne $clsid) { throw "A per-user preview handler already exists at $target; no changes made." }
    if ((Test-Path -LiteralPath $target) -and $null -eq $existing) { throw "A per-user preview key exists at $target; no changes made." }
  }
  if ((Test-Path -LiteralPath $list) -and $null -ne (Get-Item -LiteralPath $list).GetValue($clsid) -and !(Test-Path -LiteralPath $class)) { throw 'Preview list entry already exists; no changes made.' }
  $server = DefaultValue "$class\InprocServer32"
  if ((Test-Path -LiteralPath $class) -and (!$server -or $server -ne $dll)) { throw 'The preview CLSID is already registered elsewhere; no changes made.' }
  try {
  New-Item -Path "$class\InprocServer32" -Force | Out-Null
  Set-Item -LiteralPath $class -Value 'MarkWriter Markdown Preview'
  New-ItemProperty -LiteralPath $class -Name AppID -Value '{6D2B5079-2F0B-48DD-AB7F-97CEC514D30B}' -PropertyType String -Force | Out-Null
  Set-Item -LiteralPath "$class\InprocServer32" -Value $dll
  New-ItemProperty -LiteralPath "$class\InprocServer32" -Name ThreadingModel -Value 'Apartment' -PropertyType String -Force | Out-Null
  New-Item -Path $list -Force | Out-Null
  New-ItemProperty -LiteralPath $list -Name $clsid -Value 'MarkWriter Markdown Preview' -PropertyType String -Force | Out-Null
  foreach ($target in $targets) { New-Item -Path $target -Force | Out-Null; Set-Item -LiteralPath $target -Value $clsid }
  } catch {
    $failure = $_
    & $PSCommandPath -Action Disable -DllPath $dll
    throw $failure
  }
} else {
  if (!$DllPath -or ![IO.Path]::IsPathRooted($DllPath)) { throw 'Disable requires the same absolute DllPath used to enable.' }
  $server = DefaultValue "$class\InprocServer32"
  if ($server -and $server -ne [IO.Path]::GetFullPath($DllPath)) { throw 'Preview class points to another DLL; no changes made.' }
  foreach ($target in $targets) {
    if ((DefaultValue $target) -eq $clsid) {
      # Remove only our default value; retain any other values or subkeys.
      $key = Get-Item -LiteralPath $target
      $key.DeleteValue('', $false)
      if ($key.ValueCount -eq 0 -and $key.SubKeyCount -eq 0) { Remove-Item -LiteralPath $target }
    }
  }
  if (Test-Path -LiteralPath $list) { Remove-ItemProperty -LiteralPath $list -Name $clsid -ErrorAction SilentlyContinue }
  # Do not remove a class that has since been redirected to another DLL.
  $server = DefaultValue "$class\InprocServer32"
  if ($DllPath -and $server -eq $DllPath -and (Test-Path -LiteralPath $class)) { Remove-Item -LiteralPath $class -Recurse }
}
