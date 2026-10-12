@echo off
rem Stop the notebook. Double-click, or type `stop-notebook.cmd`.
setlocal
cd /d "%~dp0"

where node >nul 2>&1 || (
  echo.
  echo Node.js is not installed. Get it from https://nodejs.org ^(24 or newer^), then run this again.
  echo.
  pause
  exit /b 1
)

node scripts\stop-notebook.mjs %*
set "EXITCODE=%ERRORLEVEL%"
if not "%EXITCODE%"=="0" (
  echo.
  echo The notebook could not be stopped. See the error above.
  pause
)
exit /b %EXITCODE%