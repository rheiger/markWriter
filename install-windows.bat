@echo off
echo MarkWrite Windows Installer
echo =========================
echo.

REM Check if running as administrator
net session >nul 2>&1
if %errorLevel% == 0 (
    echo Running as Administrator - OK
) else (
    echo ERROR: This installer must be run as Administrator
    echo Right-click and select "Run as administrator"
    pause
    exit /b 1
)

REM Set installation directory - use hardcoded path to avoid environment variable issues
set INSTALL_DIR=C:\Program Files\MarkWrite
echo Installing to: %INSTALL_DIR%
echo.

REM Create directory
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

REM Copy files
echo Copying application files...
xcopy "dist\MarkWrite\*" "%INSTALL_DIR%\" /E /I /Y
if %errorLevel% neq 0 (
    echo ERROR: Failed to copy files
    pause
    exit /b 1
)

REM Create shortcuts
echo Creating shortcuts...
set SHORTCUT_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\MarkWrite
if not exist "%SHORTCUT_DIR%" mkdir "%SHORTCUT_DIR%"

REM Desktop shortcut
powershell "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%USERPROFILE%\Desktop\MarkWrite.lnk'); $Shortcut.TargetPath = '%INSTALL_DIR%\MarkWrite.exe'; $Shortcut.IconLocation = '%INSTALL_DIR%\MarkWrite.ico'; $Shortcut.Save()"

REM Start Menu shortcut
powershell "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%SHORTCUT_DIR%\MarkWrite.lnk'); $Shortcut.TargetPath = '%INSTALL_DIR%\MarkWrite.exe'; $Shortcut.IconLocation = '%INSTALL_DIR%\MarkWrite.ico'; $Shortcut.Save()"

REM Set file associations for .md files
echo Setting file associations...
assoc .md=Markdown.Document
ftype Markdown.Document="%INSTALL_DIR%\MarkWrite.exe" "%1"

echo.
echo Installation completed successfully!
echo.
echo MarkWrite has been installed to: %INSTALL_DIR%
echo Desktop and Start Menu shortcuts have been created
echo .md files are now associated with MarkWrite
echo.
echo You can now:
echo - Double-click .md files to open them in MarkWrite
echo - Launch MarkWrite from Start Menu or Desktop
echo - Right-click .md files and select "Open with MarkWrite"
echo.
pause
