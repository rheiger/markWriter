# MarkWrite Windows Installer (PowerShell)
# Run as Administrator

param(
    [switch]$Force
)

# Check if running as administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "ERROR: This installer must be run as Administrator" -ForegroundColor Red
    Write-Host "Right-click and select 'Run as administrator'" -ForegroundColor Red
    Read-Host "Press Enter to continue"
    exit 1
}

Write-Host "MarkWrite Windows Installer" -ForegroundColor Green
Write-Host "=========================" -ForegroundColor Green
Write-Host ""

# Set installation directory
$InstallDir = "C:\Program Files\MarkWrite"
Write-Host "Installing to: $InstallDir" -ForegroundColor Yellow
Write-Host ""

# Check if already installed
if (Test-Path $InstallDir) {
    if (-not $Force) {
        Write-Host "MarkWrite is already installed at: $InstallDir" -ForegroundColor Yellow
        $response = Read-Host "Do you want to reinstall? (y/N)"
        if ($response -ne "y" -and $response -ne "Y") {
            Write-Host "Installation cancelled." -ForegroundColor Yellow
            exit 0
        }
    }
    Write-Host "Removing existing installation..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $InstallDir -ErrorAction SilentlyContinue
}

# Create installation directory
Write-Host "Creating installation directory..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null

# Copy files
Write-Host "Copying application files..." -ForegroundColor Yellow
$SourceDir = Join-Path $PSScriptRoot "dist\MarkWrite"
if (-not (Test-Path $SourceDir)) {
    Write-Host "ERROR: Source directory not found: $SourceDir" -ForegroundColor Red
    Write-Host "Make sure you're running this from the project root directory" -ForegroundColor Red
    Read-Host "Press Enter to continue"
    exit 1
}

try {
    Copy-Item -Path "$SourceDir\*" -Destination $InstallDir -Recurse -Force
    Write-Host "Files copied successfully!" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Failed to copy files: $($_.Exception.Message)" -ForegroundColor Red
    Read-Host "Press Enter to continue"
    exit 1
}

# Create shortcuts
Write-Host "Creating shortcuts..." -ForegroundColor Yellow

# Desktop shortcut
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$DesktopShortcut = Join-Path $DesktopPath "MarkWrite.lnk"
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($DesktopShortcut)
$Shortcut.TargetPath = Join-Path $InstallDir "MarkWrite.exe"
$Shortcut.WorkingDirectory = $InstallDir
$Shortcut.Save()
Write-Host "Desktop shortcut created" -ForegroundColor Green

# Start Menu shortcut
$StartMenuPath = [Environment]::GetFolderPath("StartMenu")
$StartMenuDir = Join-Path $StartMenuPath "Programs\MarkWrite"
if (-not (Test-Path $StartMenuDir)) {
    New-Item -ItemType Directory -Path $StartMenuDir -Force | Out-Null
}
$StartMenuShortcut = Join-Path $StartMenuDir "MarkWrite.lnk"
$Shortcut = $WshShell.CreateShortcut($StartMenuShortcut)
$Shortcut.TargetPath = Join-Path $InstallDir "MarkWrite.exe"
$Shortcut.WorkingDirectory = $InstallDir
$Shortcut.Save()
Write-Host "Start Menu shortcut created" -ForegroundColor Green

# Set file associations for .md files
Write-Host "Setting file associations..." -ForegroundColor Yellow
try {
    # Create file association
    $mdKey = "HKCU:\Software\Classes\.md"
    New-Item -Path $mdKey -Force | Out-Null
    Set-ItemProperty -Path $mdKey -Name "(Default)" -Value "MarkWrite.Document"
    
    # Create document type
    $docKey = "HKCU:\Software\Classes\MarkWrite.Document"
    New-Item -Path $docKey -Force | Out-Null
    Set-ItemProperty -Path $docKey -Name "(Default)" -Value "MarkWrite Document"
    
    # Set open command
    $shellKey = "HKCU:\Software\Classes\MarkWrite.Document\shell\open\command"
    New-Item -Path $shellKey -Force | Out-Null
    $exePath = Join-Path $InstallDir "MarkWrite.exe"
    Set-ItemProperty -Path $shellKey -Name "(Default)" -Value "`"$exePath`" `"%1`""
    
    Write-Host "File associations set successfully!" -ForegroundColor Green
} catch {
    Write-Host "WARNING: Could not set file associations: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "You can set them manually later" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Installation completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "MarkWrite has been installed to: $InstallDir" -ForegroundColor Cyan
Write-Host "Desktop and Start Menu shortcuts have been created" -ForegroundColor Cyan
Write-Host ".md files are now associated with MarkWrite" -ForegroundColor Cyan
Write-Host ""
Write-Host "You can now:" -ForegroundColor White
Write-Host "- Double-click .md files to open them in MarkWrite" -ForegroundColor White
Write-Host "- Launch MarkWrite from Start Menu or Desktop" -ForegroundColor White
Write-Host "- Right-click .md files and select 'Open with MarkWrite'" -ForegroundColor White
Write-Host ""

# Test the installation
Write-Host "Testing installation..." -ForegroundColor Yellow
$exePath = Join-Path $InstallDir "MarkWrite.exe"
if (Test-Path $exePath) {
    try {
        $version = & $exePath --version 2>&1
        Write-Host "Installation test successful: $version" -ForegroundColor Green
    } catch {
        Write-Host "WARNING: Could not test executable: $($_.Exception.Message)" -ForegroundColor Yellow
    }
} else {
    Write-Host "ERROR: Executable not found at: $exePath" -ForegroundColor Red
}

Write-Host ""
Read-Host "Press Enter to continue"
