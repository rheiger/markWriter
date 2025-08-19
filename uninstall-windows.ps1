# MarkWrite Windows Uninstaller (PowerShell)
# Run as Administrator

# Check if running as administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "ERROR: This uninstaller must be run as Administrator" -ForegroundColor Red
    Write-Host "Right-click and select 'Run as administrator'" -ForegroundColor Red
    Read-Host "Press Enter to continue"
    exit 1
}

Write-Host "MarkWrite Windows Uninstaller" -ForegroundColor Red
Write-Host "===========================" -ForegroundColor Red
Write-Host ""

# Set installation directory
$InstallDir = "C:\Program Files\MarkWrite"

if (-not (Test-Path $InstallDir)) {
    Write-Host "MarkWrite is not installed at: $InstallDir" -ForegroundColor Yellow
    Read-Host "Press Enter to continue"
    exit 0
}

Write-Host "Uninstalling from: $InstallDir" -ForegroundColor Yellow
Write-Host ""

# Confirm uninstallation
$response = Read-Host "Are you sure you want to uninstall MarkWrite? (y/N)"
if ($response -ne "y" -and $response -ne "Y") {
    Write-Host "Uninstallation cancelled." -ForegroundColor Yellow
    exit 0
}

Write-Host "Removing shortcuts..." -ForegroundColor Yellow

# Remove desktop shortcut
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$DesktopShortcut = Join-Path $DesktopPath "MarkWrite.lnk"
if (Test-Path $DesktopShortcut) {
    Remove-Item $DesktopShortcut -Force
    Write-Host "Desktop shortcut removed" -ForegroundColor Green
}

# Remove start menu shortcut
$StartMenuPath = [Environment]::GetFolderPath("StartMenu")
$StartMenuDir = Join-Path $StartMenuPath "Programs\MarkWrite"
if (Test-Path $StartMenuDir) {
    Remove-Item $StartMenuDir -Recurse -Force
    Write-Host "Start Menu shortcut removed" -ForegroundColor Green
}

# Remove file associations
Write-Host "Removing file associations..." -ForegroundColor Yellow
try {
    # Remove .md association
    $mdKey = "HKCU:\Software\Classes\.md"
    if (Test-Path $mdKey) {
        Remove-Item $mdKey -Recurse -Force
    }
    
    # Remove document type
    $docKey = "HKCU:\Software\Classes\MarkWrite.Document"
    if (Test-Path $docKey) {
        Remove-Item $docKey -Recurse -Force
    }
    
    Write-Host "File associations removed" -ForegroundColor Green
} catch {
    Write-Host "WARNING: Could not remove file associations: $($_.Exception.Message)" -ForegroundColor Yellow
}

# Remove installation directory
Write-Host "Removing installation files..." -ForegroundColor Yellow
try {
    Remove-Item -Recurse -Force $InstallDir
    Write-Host "Installation files removed" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Could not remove installation files: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "You may need to manually delete: $InstallDir" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Uninstallation completed!" -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to continue"
