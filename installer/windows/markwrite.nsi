; NSIS installer script for MarkWrite (Windows)
; Requires NSIS and (optionally) Unicode build

!define APPNAME "MarkWrite"
!define COMPANY "MarkWrite"
!define VERSION "0.0.2"

OutFile "MarkWrite-${VERSION}-Setup.exe"
InstallDir "$PROGRAMFILES64\${APPNAME}"
RequestExecutionLevel user
ShowInstDetails show

Section "Install"
  SetOutPath "$INSTDIR"
  File /r "dist\MarkWrite\*.*"

  ; Create shortcuts
  CreateShortCut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\MarkWrite\MarkWrite.exe"
  CreateShortCut "$SMPROGRAMS\${APPNAME}.lnk" "$INSTDIR\MarkWrite\MarkWrite.exe"
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\${APPNAME}.lnk"
  Delete "$SMPROGRAMS\${APPNAME}.lnk"
  RMDir /r "$INSTDIR"
SectionEnd

