@echo off
rem One-click launcher: serves the game and opens your browser. Phones on the
rem same Wi-Fi can use the address printed in the console (run
rem ALLOW-PHONE-ACCESS.cmd once to let them through the firewall).
rem
rem Serves the multi-file web build by default. Pass a mode to pick another:
rem     serve.cmd 8080 web        multi-file web build   (default)
rem     serve.cmd 8081 mobile     single-file mobile build
rem     serve.cmd 8082 single     single-file web build
rem
rem Prefer no server at all? One folder up, double-click PLAY-WEB.html on a PC
rem or PLAY-MOBILE.html on a phone.
setlocal

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo   Node.js was not found on this PC.
    echo.
    echo   That is fine - you do not need it to play. Go up one folder and
    echo   double-click:
    echo       PLAY-WEB.html      ^(on a PC^)
    echo       PLAY-MOBILE.html   ^(on a phone^)
    echo.
    echo   Or install Node.js from https://nodejs.org and try again.
    echo.
    pause
    exit /b 1
)

echo.
echo   Starting Ludo Emperor 4 Way...
echo.
node "serve.mjs" %*

if errorlevel 1 (
    echo.
    echo   The game stopped with an error. See the message above.
    pause
)

endlocal
