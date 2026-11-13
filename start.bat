@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Chua cai Node.js. Hay tai ban LTS tai https://nodejs.org roi chay lai tep nay.
  pause
  exit /b
)
if not exist node_modules (
  echo Dang cai thu vien lan dau, vui long doi...
  call npm install
)
start "" http://localhost:3000/admin
start "" http://localhost:3000
node server.js
pause
