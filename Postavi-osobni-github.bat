@echo off
REM Ova skripta jednom postavlja i pusha kod na tvoj OSOBNI GitHub repozitorij.
REM 1. Otvori ovu datoteku desnim klikom -> Uredi (Edit / Notepad)
REM 2. Zamijeni rijec TVOJ_TOKEN dolje svojim stvarnim tokenom (github_pat_...)
REM 3. Spremi datoteku
REM 4. Dvoklikni ovu .bat datoteku da je pokrenes

set TOKEN=TVOJ_TOKEN

set "GIT_EXE=C:\Users\hr00013887\AppData\Local\github-copilot-git-2.53.0-4\cmd\git.exe"

cd /d "%~dp0"
"%GIT_EXE%" remote remove personal >nul 2>&1
"%GIT_EXE%" remote add personal "https://sonics7:%TOKEN%@github.com/sonics7/evidencija-radnog-vremena.git"
"%GIT_EXE%" push personal main

echo.
echo Gotovo. Pogledaj gornji ispis - ako pise "main -> main", push je uspio.
pause
