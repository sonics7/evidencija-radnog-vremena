@echo off
setlocal

set "APP_DIR=%~dp0"
set "NODE_DIR=C:\Program Files\nodejs"

echo Pokrecem backend server (port 4000)...
start "Evidencija - Backend" cmd /k "cd /d ""%APP_DIR%server"" && set PATH=%NODE_DIR%;%PATH% && node index.js"

echo Cekam da se backend pokrene...
timeout /t 3 /nobreak > nul

echo Pokrecem frontend (port 5173)...
start "Evidencija - Frontend" cmd /k "cd /d ""%APP_DIR%client"" && set PATH=%NODE_DIR%;%PATH% && npm run dev"

echo Cekam da se frontend pokrene...
timeout /t 5 /nobreak > nul

echo Otvaram aplikaciju u Chrome pregledniku...
set "CHROME_EXE="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%LocalAppData%\Google\Chrome\Application\chrome.exe"

if defined CHROME_EXE (
    start "" "%CHROME_EXE%" "http://localhost:5173/"
) else (
    echo Chrome nije pronaden na uobicajenim lokacijama, otvaram u zadanom pregledniku.
    start "" "http://localhost:5173/"
)

echo.
echo Aplikacija je pokrenuta. Ne zatvarajte prozore "Evidencija - Backend" i "Evidencija - Frontend" dok koristite aplikaciju.
echo Za zaustavljanje, zatvorite ta dva prozora ili pritisnite Ctrl+C u svakom od njih.
echo.
pause
