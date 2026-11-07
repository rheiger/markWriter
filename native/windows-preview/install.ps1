[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][ValidateSet('Enable','Disable')][string]$Action,
  [Parameter(Mandatory=$true)][string]$DllPath
)
$ErrorActionPreference = 'Stop'
$clsid = '{A448B833-8E1A-4EA4-BCC4-272134A64E97}'
$iid = '{8895b1c6-b41f-4c1c-a562-0d564250836f}'
$appId = '{6D2B5079-2F0B-48DD-AB7F-97CEC514D30B}'
$label = 'MarkWriter Markdown Preview'
$base = 'HKCU:\Software\Classes'
$class = "$base\CLSID\$clsid"
$serverKey = "$class\InprocServer32"
$list = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\PreviewHandlers'
$targets = @("$base\.md\shellex\$iid", "$base\.markdown\shellex\$iid")
if (![IO.Path]::IsPathRooted($DllPath)) { throw 'DllPath must be absolute.' }
$dll = [IO.Path]::GetFullPath($DllPath)
function Value([string]$key, [string]$name = '') {
  if (!(Test-Path -LiteralPath $key)) { return $null }
  return (Get-Item -LiteralPath $key).GetValue($name, $null, 'DoNotExpandEnvironmentNames')
}
function Remove-OwnedValue([string]$path, [string]$name, [string]$expected) {
  if (!(Test-Path -LiteralPath $path)) { return }
  $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($path.Substring(6), $true)
  if (!$key) { throw "Cannot open $path for cleanup." }
  try {
    if ($key.GetValue($name, $null, 'DoNotExpandEnvironmentNames') -eq $expected) { $key.DeleteValue($name, $false) }
    $empty = $key.ValueCount -eq 0 -and $key.SubKeyCount -eq 0
  } finally { $key.Dispose() }
  if ($empty -and $path -ne $list) { Remove-Item -LiteralPath $path }
}
function Cleanup([bool]$partial) {
  $server = Value $serverKey
  if (!$partial -and $server -ne $dll) {
    $owned = @($targets | Where-Object { (Value $_) -eq $clsid }).Count -gt 0
    if (!(Test-Path -LiteralPath $class) -and !$owned -and (Value $list $clsid) -ne $label) { return }
    throw 'Preview class no longer points to this DLL; no changes made.'
  }
  # Only exact values we created are removed. Preserve later third-party values
  # and children; never recursively remove a registry subtree.
  foreach ($target in $targets) { Remove-OwnedValue $target '' $clsid }
  Remove-OwnedValue $list $clsid $label
  Remove-OwnedValue $serverKey 'ThreadingModel' 'Apartment'
  Remove-OwnedValue $serverKey '' $dll
  Remove-OwnedValue $class 'AppID' $appId
  Remove-OwnedValue $class '' $label
}
if ($Action -eq 'Enable') {
  if (!(Test-Path -LiteralPath $dll -PathType Leaf)) { throw 'DLL not found.' }
  # No in-place re-enable: a prior installation must be disabled first. This
  # prevents an upgrade or failed re-enable from destroying prior state.
  if (Test-Path -LiteralPath $class) { throw 'The preview CLSID already exists; no changes made.' }
  if ($null -ne (Value $list $clsid)) { throw 'The preview list entry already exists; no changes made.' }
  foreach ($target in $targets) {
    if (Test-Path -LiteralPath $target) { throw "A per-user preview key already exists at $target; no changes made." }
  }
  # Refuse to shadow a machine-registered copy of this CLSID, including a
  # possible low-integrity opt-out. Machine extension handlers may be
  # temporarily shadowed by explicit opt-in and remain untouched.
  if (Test-Path -LiteralPath "Registry::HKEY_LOCAL_MACHINE\Software\Classes\CLSID\$clsid") { throw 'The preview CLSID already exists for the machine; no changes made.' }
  try {
    New-Item -Path $serverKey -Force | Out-Null
    Set-Item -LiteralPath $class -Value $label
    New-ItemProperty -LiteralPath $class -Name AppID -Value $appId -PropertyType String -Force | Out-Null
    Set-Item -LiteralPath $serverKey -Value $dll
    New-ItemProperty -LiteralPath $serverKey -Name ThreadingModel -Value 'Apartment' -PropertyType String -Force | Out-Null
    New-Item -Path $list -Force | Out-Null
    New-ItemProperty -LiteralPath $list -Name $clsid -Value $label -PropertyType String -Force | Out-Null
    foreach ($target in $targets) { New-Item -Path $target -Force | Out-Null; Set-Item -LiteralPath $target -Value $clsid }
  } catch {
    $failure = $_
    try { Cleanup $true } catch { Write-Warning "Partial registration cleanup failed: $_" }
    throw $failure
  }
} else { Cleanup $false }
