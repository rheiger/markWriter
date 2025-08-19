@echo off
echo MarkWrite Windows Uninstaller
echo ============================
echo.

REM Check if running as administrator
net session >nul 2>&1
if %errorLevel% == 0 (
    echo Running as Administrator - OK
) else (
    echo ERROR: This uninstaller must be run as Administrator
    echo Right-click and select "Run as administrator"
    pause
    exit /b 1
)

REM Set installation directory
set INSTALL_DIR=%PROGRAMFILES64%\MarkWrite
echo Uninstalling from: %INSTALL_DIR%
echo.

REM Confirm uninstallation
set /p CONFIRM="Are you sure you want to uninstall MarkWrite? (y/N): "
if /i not "%CONFIRM%"=="y" (
    echo Uninstallation cancelled.
    pause
    exit /b 0
)

REM Remove shortcuts
echo Removing shortcuts...
if exist "%USERPROFILE%\Desktop\MarkWrite.lnk" del "%USERPROFILE%\Desktop\MarkWrite.lnk"
if exist "%APPDATA%\Microsoft\Windows\Start Menu\Programs\MarkWrite" rmdir /s /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\MarkWrite"

REM Remove file associations
echo Removing file associations...
assoc .md >nul 2>&1
if %errorLevel% == 0 (
    assoc .md=
    ftype Markdown.Document >nul 2>&1
    if %errorLevel% == 0 ftype Markdown.Document=
)

REM Remove installation directory
echo Removing application files...
if exist "%INSTALL_DIR%" rmdir /s /q "%INSTALL_DIR%"

echo.
echo Uninstallation completed successfully!
echo MarkWrite has been removed from your system.
echo.
pause
