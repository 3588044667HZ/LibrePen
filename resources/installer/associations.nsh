!macro customInstall
  WriteRegStr SHELL_CONTEXT "Software\Classes\.md" "" "LibrePen.Markdown"
  WriteRegStr SHELL_CONTEXT "Software\Classes\.markdown" "" "LibrePen.Markdown"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.md\UserChoice"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.markdown\UserChoice"
  System::Call 'shell32::SHChangeNotify(i,i,i,i) (0x08000000, 0x1000, 0, 0)'
!macroend
