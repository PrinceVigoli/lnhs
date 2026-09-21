@echo off
title Luna NHS Enrollment
cd /d "%~dp0"
echo Starting Luna NHS Enrollment...
echo Make sure MySQL is already running in Laragon.
echo.
call npm.cmd start
echo.
echo The server has stopped.
pause
