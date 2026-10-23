@echo off
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 "%~dp0serve.py" --open
) else (
  python "%~dp0serve.py" --open
)
pause
