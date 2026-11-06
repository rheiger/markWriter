param(
 [Parameter(Mandatory=$true)][string]$Installer,
 [Parameter(Mandatory=$true)][string]$Destination
)
$ErrorActionPreference='Stop'
# A script file keeps native gsudo argument forwarding from evaluating an inner
# PowerShell command a second time. NSIS requires /D as its final argument.
$installation=Start-Process -FilePath $Installer -ArgumentList "/S /D=$Destination" -Wait -PassThru
exit $installation.ExitCode
