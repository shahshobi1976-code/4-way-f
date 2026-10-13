@echo off
rem ============================================================
rem   Ludo Emperor 4 Way  --  allow phones on your Wi-Fi
rem ============================================================
rem Opens one inbound TCP port so a phone/tablet on the same
rem Wi-Fi can load the game. Scoped to PRIVATE networks and to
rem the local subnet only.
rem
rem Needs Administrator rights - it will ask for them.
rem You only have to do this ONCE.
rem ============================================================

net session >nul 2>nul
if errorlevel 1 (
    echo Asking for Administrator rights...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo.
echo   Adding firewall rule for TCP port 8080 (private networks only)...
powershell -NoProfile -Command "if (-not (Get-NetFirewallRule -DisplayName 'Ludo Emperor*' -ErrorAction SilentlyContinue)) { New-NetFirewallRule -DisplayName 'Ludo Emperor game (TCP 8080)' -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow -Profile Private -RemoteAddress LocalSubnet | Out-Null; Write-Host 'Rule added.' } else { Write-Host 'Rule already existed.' }"

echo.
echo   Done. Now start the game with START-Ludo-Emperor.cmd and
echo   open the printed "On your phone" address on your phone.
echo.
pause
