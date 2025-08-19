; NSIS installer script for MarkWrite (Windows)
; Requires NSIS and (optionally) Unicode build

!define APPNAME "MarkWrite"
!define COMPANY "MarkWrite"
!ifndef VERSION
!define VERSION "0.2.3" ; default, can be overridden by /DVERSION=...
!endif
!define EXENAME "MarkWrite.exe"
!define ICO_NAME "MarkWrite.ico"

; Place installer into dist/ for CI artifact pickup
OutFile "..\\..\\dist\\MarkWrite-${VERSION}-Setup.exe"
InstallDir "$PROGRAMFILES64\${APPNAME}"
RequestExecutionLevel user
ShowInstDetails show

Section "Install"
  SetOutPath "$INSTDIR\MarkWrite"
  ; Use relative path from installer script to the PyInstaller output
  File /r "..\..\dist\MarkWrite\*"

  ; Include icon and create shortcuts with icon from install dir
  File "..\\..\\assets\\${ICO_NAME}"
  CreateShortCut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\MarkWrite\${EXENAME}" "" "$INSTDIR\MarkWrite\${ICO_NAME}"
  CreateShortCut "$SMPROGRAMS\${APPNAME}.lnk" "$INSTDIR\MarkWrite\${EXENAME}" "" "$INSTDIR\MarkWrite\${ICO_NAME}"

  ; Registry uninstall entry
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "UninstallString" "$INSTDIR\Uninstall.exe"

  ; Write uninstaller
  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\${APPNAME}.lnk"
  Delete "$SMPROGRAMS\${APPNAME}.lnk"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir /r "$INSTDIR"
SectionEnd

