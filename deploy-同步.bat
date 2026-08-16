@echo off
cd /d "%~dp0"

echo ==========================================
echo   RsfNotes - Deploy to GitHub Pages
echo ==========================================
echo.

echo [1/3] Updating cache version tags...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0version-bump.ps1"
if errorlevel 1 goto :fail_version

echo [2/3] Committing changes...
git add -A

git commit -m "update: %date% %time%"

echo [3/3] Pushing to GitHub...
git push origin main
if errorlevel 1 goto :fail_push

echo.
echo ==========================================
echo   [OK] Deployed successfully!
echo   Visit in 1-2 minutes:
echo       https://BH6RSF.github.io/
echo ==========================================
pause
exit /b 0

:fail_version
echo.
echo [FAIL] Cache version update failed.
echo        Check version-bump.ps1.
pause
exit /b 1

:fail_push
echo.
echo [FAIL] Push failed. Possible causes:
echo   1. Network issue
echo   2. GitHub login expired - delete the github.com
echo      entry in Credential Manager and retry
echo   3. Remote has new changes - run:
echo          git pull origin main
echo      then run this script again
echo.
echo If this is the FIRST deploy, run once:
echo       git push -u origin main
pause
exit /b 1
