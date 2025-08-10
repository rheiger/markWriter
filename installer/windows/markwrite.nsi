; NSIS installer script for MarkWrite (Windows)
; Requires NSIS and (optionally) Unicode build

!define APPNAME "MarkWrite"
!define COMPANY "MarkWrite"
!define VERSION "0.0.2"
!define EXENAME "MarkWrite.exe"
!define ICO_PATH "..\\..\\assets\\MarkWrite.ico"

OutFile "MarkWrite-${VERSION}-Setup.exe"
InstallDir "$PROGRAMFILES64\${APPNAME}"
RequestExecutionLevel user
ShowInstDetails show

Section "Install"
  SetOutPath "$INSTDIR\MarkWrite"
  File /r "dist\MarkWrite\*.*"

  ; Create shortcuts with icon
  !ifexist "${ICO_PATH}"
    CreateShortCut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\MarkWrite\${EXENAME}" "" "${ICO_PATH}"
    CreateShortCut "$SMPROGRAMS\${APPNAME}.lnk" "$INSTDIR\MarkWrite\${EXENAME}" "" "${ICO_PATH}"
  !else
    CreateShortCut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\MarkWrite\${EXENAME}"
    CreateShortCut "$SMPROGRAMS\${APPNAME}.lnk" "$INSTDIR\MarkWrite\${EXENAME}"
  !endif

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

