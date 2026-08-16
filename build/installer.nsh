!macro customInit
  ; 1. Check for 64-bit Architecture
  ${If} ${RunningX64}
    ; Good, it's 64-bit
  ${Else}
    MessageBox MB_OK|MB_ICONSTOP "Installation Aborted.$\r$\n$\r$\nScrapeForge requires a 64-bit Windows operating system to run local AI and telemetry operations."
    Quit
  ${EndIf}

  ; 2. Check for minimum CPU Cores (4 Cores Minimum)
  ReadEnvStr $0 "NUMBER_OF_PROCESSORS"
  ; Syntax: IntCmp val1 val2 [jump_equal] [jump_less] [jump_more]
  IntCmp $0 4 checks_passed insufficient_cpu checks_passed
  
  insufficient_cpu:
    MessageBox MB_OK|MB_ICONSTOP "Installation Aborted.$\r$\n$\r$\nScrapeForge Harvester Core requires a minimum of 4 CPU cores. Your system only reports $0 core(s), which will result in hardware overload."
    Quit
    
  checks_passed:
    ; 3. CRITICAL WARNING for Social Accounts
    MessageBox MB_OK|MB_ICONEXCLAMATION "CRITICAL SECURITY NOTE:$\r$\n$\r$\nWhen using ScrapeForge for social media telemetry, DO NOT log in using your personal social media accounts. Automated harvesting actions flag platform bot-detection and may result in permanent account bans.$\r$\n$\r$\nAlways use dedicated, isolated accounts (burner accounts) for data harvesting."
!macroend