@echo off
cd /d "%~dp0"
rem start server only if not already running, then open browser
netstat -ano | findstr ":3939 " | findstr LISTENING >nul
if errorlevel 1 start "SubReminder" /min node server.js
timeout /t 2 /nobreak >nul
start "" http://localhost:3939
