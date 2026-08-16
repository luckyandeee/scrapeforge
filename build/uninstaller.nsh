!macro customUnInit
  MessageBox MB_YESNO|MB_ICONQUESTION "Do you want to delete all local user data, settings, and database files?" IDYES deleteData IDNO keepData

  deleteData:
    ; Clear the AppData Roaming folder for ScrapeForge where SQLite/local data lives
    RMDir /r "$APPDATA\ScrapeForge"
    Goto done

  keepData:
    ; Preserves user data and databases
    Goto done

  done:
!macroend