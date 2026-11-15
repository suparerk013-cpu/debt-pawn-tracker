@echo off
rem Double-click this file to run the mixer on this PC.
rem It starts a small local server and opens http://localhost:8080 in the browser.
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
  set PY=py
  goto run
)
where python >nul 2>nul
if %errorlevel%==0 (
  python -c "import sys" >nul 2>nul
  if not errorlevel 1 (
    set PY=python
    goto run
  )
)

echo.
echo Python is not installed.
echo 1. Open https://www.python.org/downloads/ and install Python.
echo 2. In the installer, tick "Add python.exe to PATH".
echo 3. Then double-click start-windows.bat again.
echo.
pause
exit /b 1

:run
echo Mixer is running at http://localhost:8080
echo Keep this window open. Close it to stop the mixer.
start "" http://localhost:8080
%PY% -m http.server 8080
pause
