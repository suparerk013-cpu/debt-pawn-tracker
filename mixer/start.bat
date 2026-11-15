@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing Electron first time, please wait...
  call npm install
)
call npm start
