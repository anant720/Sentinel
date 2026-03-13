@echo off
title Acme Corp Portal Launcher
color 0A

echo.
echo  ==============================================
echo   🏢 Acme Corp Portal — Local Setup
echo  ==============================================
echo.

REM Step 1: Start Sentinel backend
echo  [1/3] Starting Sentinel backend...
start "Sentinel Backend" cmd /k "cd /d "%~dp0..\sentinel-core" && npm run dev"
timeout /t 5 /nobreak > nul

REM Step 2: Start Acme Portal
echo  [2/3] Starting Acme Corp Portal...
start "Acme Portal" cmd /k "cd /d "%~dp0" && node server.js"
timeout /t 2 /nobreak > nul

REM Step 3: Open browser
echo  [3/3] Opening browser...
start http://localhost:4000

echo.
echo  ✅ Done! The portal is running at http://localhost:4000
echo  🛡️  Sentinel is at http://localhost:3001
echo.
echo  NOTE: If events aren't reaching Sentinel, make sure you've:
echo    1. Created an API key in Sentinel Admin → Organizations
echo    2. Set SENTINEL_API_KEY in acme-portal/server.js
echo.
pause
