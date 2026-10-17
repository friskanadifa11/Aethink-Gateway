@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Node.js 22.16+ is required. Download it from https://nodejs.org
 pause
 exit /b 1
)
if not exist ".env" (
 call npm run setup
 if errorlevel 1 (
  pause
  exit /b 1
 )
)
call npm start
pause
