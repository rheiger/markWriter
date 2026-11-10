!define MW_CLASSES "Software\Classes"
!define MW_PREVIEW "{8360D352-56CE-4C43-A12E-A73CF9D10214}"
!define MW_PREVIEW_IID "{8895b1c6-b41f-4c1c-a562-0d564250836f}"
!define MW_PREVHOST "{6D2B5079-2F0B-48DD-AB7F-97CEC514D30B}"
!define MW_PREVIEW_LIST "Software\Microsoft\Windows\CurrentVersion\PreviewHandlers"
!define MW_PROGID "MarkWriter.Markdown"
!define MW_APPLICATION "Applications\markwriter.exe"
!define MW_CAPABILITIES "Software\MarkWriter\Capabilities"
!define MW_REGISTERED_APPS "Software\RegisteredApplications"
!define MW_MACHINE_LOCATION "Software\markwriter\MarkWriter"
!define MW_PREVIEW_LABEL "MarkWriter Markdown Preview"
!define MW_CLASS "${MW_CLASSES}\CLSID\${MW_PREVIEW}"
!define MW_COMMAND "$\"$INSTDIR\markwriter.exe$\" $\"%1$\""
!define MW_ICON "$\"$INSTDIR\markwriter.exe$\",0"

!macro MW_Fail message
  DetailPrint "${message}"
  MessageBox MB_ICONSTOP|MB_OK "${message}" /SD IDOK
  SetErrorLevel 1
  Abort
!macroend

!macro MW_RequireClosed
  nsis_tauri_utils::FindProcess "markwriter.exe"
  Pop $R8
  ${If} $R8 == 0
    !insertmacro MW_Fail "Close MarkWriter in every Windows session, then run this operation again."
  ${EndIf}
!macroend

 ; Tauri includes its utilities before this file. Keep the template's check
 ; but make it refuse instead of killing editors in a silent install.
!macroundef CheckIfAppIsRunning
!macro CheckIfAppIsRunning executableName productName
  !insertmacro MW_RequireClosed
!macroend

!macro MW_RequirePreviewUnlocked
  \${If} \${FileExists} "$INSTDIR\MarkWriterPreview.dll"
    System::Call 'kernel32::CreateFileW(w "$INSTDIR\MarkWriterPreview.dll", i 0x40000000, i 0, p 0, i 3, i 0, p 0) p.R8'
    \${If} $R8 == -1
      !insertmacro MW_Fail "Close the File Explorer Preview pane and windows using MarkWriter previews, then retry. If the preview host is still holding the DLL, sign out and back in first."
    \${EndIf}
    System::Call 'kernel32::CloseHandle(p R8)'
  \${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro MW_RequireClosed
  ${If} $INSTDIR != "$PROGRAMFILES64\MarkWriter"
    !insertmacro MW_Fail "MarkWriter and its machine-wide preview handler must be installed in Program Files\MarkWriter."
  ${EndIf}
  System::Call 'kernel32::GetFileAttributesW(w "$INSTDIR") i.R8'
  IntOp $R8 $R8 & 0x400
  ${If} $R8 != 0
    !insertmacro MW_Fail "The MarkWriter installation folder is a reparse point or cannot be inspected."
  ${EndIf}
  ReadRegStr $R8 HKLM "\${MW_MACHINE_LOCATION}" "ProtectedInstall"
  \${If} $R8 == "$INSTDIR"
    !insertmacro MW_RequirePreviewUnlocked
  \${Else}
    ; Recreate an empty destination so it inherits the protected Program Files ACL.
    SetOutPath "$PROGRAMFILES64"
    ClearErrors
    RMDir "$INSTDIR"
    \${If} \${Errors}
      !insertmacro MW_Fail "The Program Files\MarkWriter folder contains files. Move the existing installation aside before retrying."
    \${EndIf}
    ClearErrors
    SetOutPath "$INSTDIR"
    \${If} \${Errors}
      !insertmacro MW_Fail "The protected installation folder could not be created."
    \${EndIf}
  \${EndIf}
!macroend

!macro MW_RegisterExtension ext
  ReadRegStr $R8 HKLM "${MW_CLASSES}\${ext}" ""
  ${If} $R8 == ""
    WriteRegStr HKLM "${MW_CLASSES}\${ext}" "" "${MW_PROGID}"
  ${EndIf}
  WriteRegStr HKLM "${MW_CAPABILITIES}\FileAssociations" "${ext}" "${MW_PROGID}"
  WriteRegStr HKLM "${MW_CLASSES}\${ext}\OpenWithProgids" "${MW_PROGID}" ""
  WriteRegStr HKLM "${MW_CLASSES}\${MW_APPLICATION}\SupportedTypes" "${ext}" ""
  ReadRegStr $R8 HKLM "${MW_CLASSES}\SystemFileAssociations\${ext}\shellex\${MW_PREVIEW_IID}" ""
  ${If} $R8 == ""
    WriteRegStr HKLM "${MW_CLASSES}\SystemFileAssociations\${ext}\shellex\${MW_PREVIEW_IID}" "" "${MW_PREVIEW}"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKLM "\${MW_MACHINE_LOCATION}" "ProtectedInstall" "$INSTDIR"
  WriteRegStr HKLM "${MW_CLASSES}\${MW_PROGID}" "" "Markdown document"
  WriteRegStr HKLM "${MW_CLASSES}\${MW_PROGID}\DefaultIcon" "" "${MW_ICON}"
  WriteRegStr HKLM "${MW_CLASSES}\${MW_PROGID}\shell\open\command" "" "${MW_COMMAND}"
  WriteRegStr HKLM "${MW_CLASSES}\${MW_PROGID}\shellex\${MW_PREVIEW_IID}" "" "${MW_PREVIEW}"
  WriteRegStr HKLM "${MW_CLASSES}\${MW_APPLICATION}" "FriendlyAppName" "MarkWriter"
  WriteRegStr HKLM "${MW_CLASSES}\${MW_APPLICATION}\DefaultIcon" "" "${MW_ICON}"
  WriteRegStr HKLM "${MW_CLASSES}\${MW_APPLICATION}\shell\open\command" "" "${MW_COMMAND}"
  WriteRegStr HKLM "${MW_CLASS}" "" "${MW_PREVIEW_LABEL}"
  WriteRegStr HKLM "${MW_CLASS}" "AppID" "${MW_PREVHOST}"
  WriteRegStr HKLM "${MW_CLASS}\InprocServer32" "" "$INSTDIR\MarkWriterPreview.dll"
  WriteRegStr HKLM "${MW_CLASS}\InprocServer32" "ThreadingModel" "Apartment"
  WriteRegStr HKLM "${MW_PREVIEW_LIST}" "${MW_PREVIEW}" "${MW_PREVIEW_LABEL}"
  WriteRegStr HKLM "${MW_CAPABILITIES}" "ApplicationName" "MarkWriter"
  WriteRegStr HKLM "${MW_CAPABILITIES}" "ApplicationDescription" "Markdown editor with offline diagrams"
  WriteRegStr HKLM "${MW_REGISTERED_APPS}" "MarkWriter" "${MW_CAPABILITIES}"
  !insertmacro MW_RegisterExtension ".md"
  !insertmacro MW_RegisterExtension ".markdown"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  nsis_tauri_utils::RunAsUser "$INSTDIR\markwriter.exe" "--retire-legacy-install"
!macroend

!macro MW_RemoveValue key name expected
  ClearErrors
  ReadRegStr $R8 HKLM "${key}" "${name}"
  ${IfNot} ${Errors}
  ${AndIf} $R8 == "${expected}"
    DeleteRegValue HKLM "${key}" "${name}"
    DeleteRegKey /ifempty HKLM "${key}"
  ${EndIf}
!macroend

!macro MW_RemoveExtension ext
  !insertmacro MW_RemoveValue "${MW_CLASSES}\${ext}" "" "${MW_PROGID}"
  !insertmacro MW_RemoveValue "${MW_CAPABILITIES}\FileAssociations" "${ext}" "${MW_PROGID}"
  !insertmacro MW_RemoveValue "${MW_CLASSES}\${ext}\OpenWithProgids" "${MW_PROGID}" ""
  !insertmacro MW_RemoveValue "${MW_CLASSES}\${MW_APPLICATION}\SupportedTypes" "${ext}" ""
  !insertmacro MW_RemoveValue "${MW_CLASSES}\SystemFileAssociations\${ext}\shellex\${MW_PREVIEW_IID}" "" "${MW_PREVIEW}"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro MW_RequireClosed
  !insertmacro MW_RequirePreviewUnlocked
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro MW_RemoveExtension ".md"
  !insertmacro MW_RemoveExtension ".markdown"
  !insertmacro MW_RemoveValue "${MW_REGISTERED_APPS}" "MarkWriter" "${MW_CAPABILITIES}"
  !insertmacro MW_RemoveValue "${MW_CAPABILITIES}" "ApplicationName" "MarkWriter"
  !insertmacro MW_RemoveValue "${MW_CAPABILITIES}" "ApplicationDescription" "Markdown editor with offline diagrams"
  !insertmacro MW_RemoveValue "${MW_CLASSES}\${MW_PROGID}\shellex\${MW_PREVIEW_IID}" "" "${MW_PREVIEW}"
  !insertmacro MW_RemoveValue "${MW_CLASSES}\${MW_PROGID}\shell\open\command" "" "${MW_COMMAND}"
  !insertmacro MW_RemoveValue "${MW_CLASSES}\${MW_PROGID}\DefaultIcon" "" "${MW_ICON}"
  !insertmacro MW_RemoveValue "${MW_CLASSES}\${MW_PROGID}" "" "Markdown document"
  !insertmacro MW_RemoveValue "${MW_CLASSES}\${MW_APPLICATION}\shell\open\command" "" "${MW_COMMAND}"
  !insertmacro MW_RemoveValue "${MW_CLASSES}\${MW_APPLICATION}\DefaultIcon" "" "${MW_ICON}"
  !insertmacro MW_RemoveValue "${MW_CLASSES}\${MW_APPLICATION}" "FriendlyAppName" "MarkWriter"
  ReadRegStr $R8 HKLM "${MW_CLASS}\InprocServer32" ""
  ${If} $R8 == "$INSTDIR\MarkWriterPreview.dll"
    !insertmacro MW_RemoveValue "${MW_CLASS}\InprocServer32" "ThreadingModel" "Apartment"
    !insertmacro MW_RemoveValue "${MW_CLASS}\InprocServer32" "" "$INSTDIR\MarkWriterPreview.dll"
    !insertmacro MW_RemoveValue "${MW_CLASS}" "AppID" "${MW_PREVHOST}"
    !insertmacro MW_RemoveValue "${MW_CLASS}" "" "${MW_PREVIEW_LABEL}"
    !insertmacro MW_RemoveValue "${MW_PREVIEW_LIST}" "${MW_PREVIEW}" "${MW_PREVIEW_LABEL}"
  ${EndIf}
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
