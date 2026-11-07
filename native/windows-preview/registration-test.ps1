# Run only in a disposable, medium-integrity Windows user profile.
param([Parameter(Mandatory=$true)][string]$DllPath)
$ErrorActionPreference = 'Stop'
$installer = Join-Path $PSScriptRoot 'install.ps1'
$clsid = '{A448B833-8E1A-4EA4-BCC4-272134A64E97}'
$iid = '{8895b1c6-b41f-4c1c-a562-0d564250836f}'
$base = 'HKCU:\Software\Classes'
$targets = @("$base\.md\shellex\$iid", "$base\.markdown\shellex\$iid")
$class = "$base\CLSID\$clsid"
if ((Test-Path $class) -or @($targets | Where-Object { Test-Path $_ }).Count) { throw 'Profile is not clean. Use a disposable test profile.' }
$defaults = @{}
foreach ($ext in @('.md','.markdown')) {
  $key = "$base\$ext"; $defaults[$ext] = if (Test-Path $key) { (Get-Item $key).GetValue('') } else { $null }
}
try {
  & $installer -Action Enable -DllPath $DllPath
  foreach ($target in $targets) { if ((Get-Item $target).GetValue('') -ne $clsid) { throw 'Enable failed' } }
  $rejected = $false
  try { & $installer -Action Enable -DllPath $DllPath } catch { $rejected = $true }
  if (!$rejected -or (Get-Item "$class\InprocServer32").GetValue('') -ne $DllPath) { throw 'Re-enable changed existing registration' }
  # Later third-party values and subkeys under our class must survive disable.
  New-ItemProperty -Path $class -Name 'ForeignValue' -Value 'retain' -PropertyType String | Out-Null
  New-Item -Path "$class\ForeignChild" | Out-Null
  New-ItemProperty -Path "$class\InprocServer32" -Name 'ForeignServerValue' -Value 'retain' -PropertyType String | Out-Null
  # A subsequent provider change must survive our disable operation.
  $competitor = '{1C3B2F21-8802-46D8-9302-6A70A9B82ED3}'
  Set-Item -LiteralPath $targets[0] -Value $competitor
  & $installer -Action Disable -DllPath $DllPath
  if ((Get-Item $targets[0]).GetValue('') -ne $competitor) { throw 'Changed provider was not preserved' }
  if (Test-Path $targets[1]) { throw 'Owned extension key remained' }
  if ((Get-ItemProperty -Path $class -Name ForeignValue).ForeignValue -ne 'retain' -or !(Test-Path "$class\ForeignChild") -or (Get-ItemProperty -Path "$class\InprocServer32" -Name ForeignServerValue).ForeignServerValue -ne 'retain') { throw 'Third-party class changes were not preserved' }
  if ((Get-Item $class).GetValue('') -or (Get-Item "$class\InprocServer32").GetValue('')) { throw 'Owned class values remained' }
  # This key was created solely by this disposable test; remove its fixtures.
  Remove-Item -LiteralPath $class -Recurse
  New-Item -Path $class -Force | Out-Null
  New-ItemProperty -Path $class -Name DisableLowILProcessIsolation -Value 1 -PropertyType DWord | Out-Null
  $rejected = $false
  try { & $installer -Action Enable -DllPath $DllPath } catch { $rejected = $true }
  if (!$rejected -or (Get-ItemProperty -Path $class).DisableLowILProcessIsolation -ne 1) { throw 'Existing low-integrity opt-out class was changed' }
  Remove-Item -LiteralPath $class -Recurse
  foreach ($ext in @('.md','.markdown')) {
    $key = "$base\$ext"; $value = if (Test-Path $key) { (Get-Item $key).GetValue('') } else { $null }
    if ($value -ne $defaults[$ext]) { throw 'Default application association changed' }
  }
  Write-Host 'Per-user registration and provider-preservation checks passed; Explorer and low-integrity hosting were NOT tested.'
} finally {
  if ((Test-Path "$class\InprocServer32") -and (Get-Item "$class\InprocServer32").GetValue('') -eq $DllPath) { & $installer -Action Disable -DllPath $DllPath }
  if (Test-Path $class) { Remove-Item -LiteralPath $class -Recurse }
  if ((Test-Path $targets[0]) -and (Get-Item $targets[0]).GetValue('') -eq '{1C3B2F21-8802-46D8-9302-6A70A9B82ED3}') { Remove-Item -LiteralPath $targets[0] }
}
