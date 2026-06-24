@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo [STELLATE v8.0.41] Cleaning foreign project files and local build output...

if exist "app" rmdir /s /q "app"
if exist "src\app" rmdir /s /q "src\app"
if exist ".next" rmdir /s /q ".next"
if exist "next-env.d.ts" del /f /q "next-env.d.ts"
if exist "middleware.ts" del /f /q "middleware.ts"
if exist "middleware.js" del /f /q "middleware.js"
if exist "lib\cron-auth.ts" del /f /q "lib\cron-auth.ts"
if exist "lib\cron-auth.js" del /f /q "lib\cron-auth.js"
if exist "lib\kisa-rss.ts" del /f /q "lib\kisa-rss.ts"
if exist "lib\kisa-rss.js" del /f /q "lib\kisa-rss.js"
if exist "lib\nvd-enrichment.ts" del /f /q "lib\nvd-enrichment.ts"
if exist "lib\nvd-enrichment.js" del /f /q "lib\nvd-enrichment.js"
if exist "lib\nvd-cve.ts" del /f /q "lib\nvd-cve.ts"
if exist "lib\nvd-cve.js" del /f /q "lib\nvd-cve.js"
if exist "lib\supabase-admin.ts" del /f /q "lib\supabase-admin.ts"
if exist "lib\supabase-admin.js" del /f /q "lib\supabase-admin.js"
if exist "scripts\backfill-nvd-details.ps1" del /f /q "scripts\backfill-nvd-details.ps1"
if exist "APPLY_STELLATE_v8.0.40_CLEANUP.bat" del /f /q "APPLY_STELLATE_v8.0.40_CLEANUP.bat"

where node >nul 2>nul
if errorlevel 1 goto cleanup_done
node "scripts\clean-stellate-repository.mjs" --local
if errorlevel 1 goto cleanup_failed

:cleanup_done
echo.
echo Cleanup completed.
echo Commit the deleted app and .next files in GitHub Desktop, then push.
pause
exit /b 0

:cleanup_failed
echo.
echo Cleanup failed. Run this file from the hotpick repository root.
pause
exit /b 1
