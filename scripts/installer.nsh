!macro customInstall
  ; Official Evergreen runtime, only installed when absent. Keep existing
  ; machine/user installations and their normal Microsoft update channel.
  SetRegView 32
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ReadRegStr $1 HKCU "SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  SetRegView 64
  ${If} $0 == ""
  ${OrIf} $0 == "0.0.0.0"
    ${If} $1 == ""
    ${OrIf} $1 == "0.0.0.0"
      DetailPrint "Microsoft Edge WebView2 installeren voor Spotify..."
      ExecWait '"$INSTDIR\resources\native\webview2\MicrosoftEdgeWebview2Setup.exe" /silent /install' $2
      ${If} $2 != 0
        MessageBox MB_OK|MB_ICONINFORMATION "Nexus Hub is geïnstalleerd. WebView2 kon niet worden geïnstalleerd. Voor Spotify: controleer je internetverbinding en voer MicrosoftEdgeWebview2Setup.exe uit in resources\native\webview2."
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend
