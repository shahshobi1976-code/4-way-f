@echo off
rem ============================================================
rem   Ludo Emperor 4 Way  --  start the shared game server
rem ============================================================
rem Serves the game so this PC and any phone on the same Wi-Fi
rem can play. The console prints both addresses:
rem     this PC : http://127.0.0.1:8080/
rem     phone   : http://<your-ip>:8080/
rem Closing the console window stops the server.
rem
rem No Node.js? No problem - just double-click PLAY-WEB.html
rem (on a PC) or PLAY-MOBILE.html (on a phone). No server needed.
rem ============================================================
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo   Node.js was not found on this PC.
    echo.
    echo   That is fine - you do not need it to play. Just double-click:
    echo       PLAY-WEB.html      ^(on a PC^)
    echo       PLAY-MOBILE.html   ^(on a phone^)
    echo.
    pause
    exit /b 1
)
node "Run with local server\serve.mjs" %*
if errorlevel 1 pause
endlocal
