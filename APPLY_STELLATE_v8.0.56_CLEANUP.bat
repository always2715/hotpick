@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo [STELLATE v8.0.56] Cleaning foreign project files and local build output...

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
if exist "APPLY_STELLATE_v8.0.41_CLEANUP.bat" del /f /q "APPLY_STELLATE_v8.0.41_CLEANUP.bat"
if exist "APPLY_STELLATE_v8.0.42_CLEANUP.bat" del /f /q "APPLY_STELLATE_v8.0.42_CLEANUP.bat"
if exist "APPLY_STELLATE_v8.0.43_CLEANUP.bat" del /f /q "APPLY_STELLATE_v8.0.43_CLEANUP.bat"
if exist "APPLY_STELLATE_v8.0.44_CLEANUP.bat" del /f /q "APPLY_STELLATE_v8.0.44_CLEANUP.bat"
if exist "APPLY_STELLATE_v8.0.45_CLEANUP.bat" del /f /q "APPLY_STELLATE_v8.0.45_CLEANUP.bat"
if exist "APPLY_STELLATE_v8.0.46_CLEANUP.bat" del /f /q "APPLY_STELLATE_v8.0.46_CLEANUP.bat"
if exist "APPLY_STELLATE_v8.0.47_CLEANUP.bat" del /f /q "APPLY_STELLATE_v8.0.47_CLEANUP.bat"
if exist "APPLY_STELLATE_v8.0.48_CLEANUP.bat" del /f /q "APPLY_STELLATE_v8.0.48_CLEANUP.bat"
if exist "APPLY_STELLATE_v8.0.49_CLEANUP.bat" del /f /q "APPLY_STELLATE_v8.0.49_CLEANUP.bat"
if exist "APPLY_STELLATE_v8.0.50_CLEANUP.bat" del /f /q "APPLY_STELLATE_v8.0.50_CLEANUP.bat"
if exist "APPLY_STELLATE_v8.0.51_CLEANUP.bat" del /f /q "APPLY_STELLATE_v8.0.51_CLEANUP.bat"
if exist "APPLY_STELLATE_v8.0.52_CLEANUP.bat" del /f /q "APPLY_STELLATE_v8.0.52_CLEANUP.bat"
if exist "APPLY_STELLATE_v8.0.53_CLEANUP.bat" del /f /q "APPLY_STELLATE_v8.0.53_CLEANUP.bat"
if exist "APPLY_STELLATE_v8.0.54_CLEANUP.bat" del /f /q "APPLY_STELLATE_v8.0.54_CLEANUP.bat"
if exist "STELLATE_PROJECT_HANDOFF_v8.0.37.txt" del /f /q "STELLATE_PROJECT_HANDOFF_v8.0.37.txt"
if exist "STELLATE_PROJECT_HANDOFF_v8.0.39.txt" del /f /q "STELLATE_PROJECT_HANDOFF_v8.0.39.txt"
if exist "STELLATE_PROJECT_HANDOFF_v8.0.40.txt" del /f /q "STELLATE_PROJECT_HANDOFF_v8.0.40.txt"
if exist "STELLATE_PROJECT_HANDOFF_v8.0.38.txt" del /f /q "STELLATE_PROJECT_HANDOFF_v8.0.38.txt"
if exist "STELLATE_PROJECT_HANDOFF_v8.0.41.txt" del /f /q "STELLATE_PROJECT_HANDOFF_v8.0.41.txt"
if exist "STELLATE_PROJECT_HANDOFF_v8.0.42.txt" del /f /q "STELLATE_PROJECT_HANDOFF_v8.0.42.txt"
if exist "STELLATE_PROJECT_HANDOFF_v8.0.43.txt" del /f /q "STELLATE_PROJECT_HANDOFF_v8.0.43.txt"
if exist "STELLATE_PROJECT_HANDOFF_v8.0.44.txt" del /f /q "STELLATE_PROJECT_HANDOFF_v8.0.44.txt"
if exist "STELLATE_PROJECT_HANDOFF_v8.0.45.txt" del /f /q "STELLATE_PROJECT_HANDOFF_v8.0.45.txt"
if exist "STELLATE_PROJECT_HANDOFF_v8.0.46.txt" del /f /q "STELLATE_PROJECT_HANDOFF_v8.0.46.txt"
if exist "STELLATE_PROJECT_HANDOFF_v8.0.47.txt" del /f /q "STELLATE_PROJECT_HANDOFF_v8.0.47.txt"
if exist "STELLATE_PROJECT_HANDOFF_v8.0.48.txt" del /f /q "STELLATE_PROJECT_HANDOFF_v8.0.48.txt"
if exist "STELLATE_PROJECT_HANDOFF_v8.0.49.txt" del /f /q "STELLATE_PROJECT_HANDOFF_v8.0.49.txt"
if exist "STELLATE_PROJECT_HANDOFF_v8.0.50.txt" del /f /q "STELLATE_PROJECT_HANDOFF_v8.0.50.txt"
if exist "STELLATE_PROJECT_HANDOFF_v8.0.51.txt" del /f /q "STELLATE_PROJECT_HANDOFF_v8.0.51.txt"
if exist "STELLATE_PROJECT_HANDOFF_v8.0.52.txt" del /f /q "STELLATE_PROJECT_HANDOFF_v8.0.52.txt"

if exist "STELLATE_PROJECT_HANDOFF_v8.0.53.txt" del /f /q "STELLATE_PROJECT_HANDOFF_v8.0.53.txt"
if exist "STELLATE_PROJECT_HANDOFF_v8.0.54.txt" del /f /q "STELLATE_PROJECT_HANDOFF_v8.0.54.txt"
if exist "README_v8.0.54.md" del /f /q "README_v8.0.54.md"
if exist "STELLATE_v8.0.54_CHANGED_FILES.txt" del /f /q "STELLATE_v8.0.54_CHANGED_FILES.txt"
if exist "STELLATE_v8.0.54_DEPLOY_GUIDE.txt" del /f /q "STELLATE_v8.0.54_DEPLOY_GUIDE.txt"
if exist "STELLATE_v8.0.54_RELEASE_MANIFEST.txt" del /f /q "STELLATE_v8.0.54_RELEASE_MANIFEST.txt"
if exist "STELLATE_v8.0.54_RUNTIME_MANIFEST.txt" del /f /q "STELLATE_v8.0.54_RUNTIME_MANIFEST.txt"
if exist "STELLATE_v8.0.54_TEST_REPORT.txt" del /f /q "STELLATE_v8.0.54_TEST_REPORT.txt"
for %%F in (README_v*.md) do if /I not "%%~nxF"=="README_v8.0.56.md" del /f /q "%%F"
for %%F in (STELLATE_PROJECT_HANDOFF_v*.txt) do if /I not "%%~nxF"=="STELLATE_PROJECT_HANDOFF_v8.0.56.txt" del /f /q "%%F"
for %%F in (STELLATE_THUMBNAIL_POOL_POLICY_v*.txt) do if /I not "%%~nxF"=="STELLATE_THUMBNAIL_POOL_POLICY_v8.0.43.txt" del /f /q "%%F"
for %%F in (STELLATE_v*_CHANGED_FILES.txt STELLATE_v*_DEPLOY_GUIDE.txt STELLATE_v*_RELEASE_MANIFEST.txt STELLATE_v*_RUNTIME_MANIFEST.txt STELLATE_v*_TEST_REPORT.txt STELLATE_v*_IMPLEMENTATION_CHECKLIST.md STELLATE_v*_IMPLEMENTATION_REPORT.md STELLATE_v*_OPERATING_RULES.md STELLATE_v*_OUTPUT_SAMPLE.md) do (
  echo %%~nxF | findstr /I /C:"v8.0.56_" >nul || del /f /q "%%F"
)
where node >nul 2>nul
if errorlevel 1 goto cleanup_done
node "scripts\clean-stellate-repository.mjs" --local
if errorlevel 1 goto cleanup_failed

:cleanup_done
echo.
echo Cleanup completed.
echo Commit all changed and deleted files in GitHub Desktop, then push.
pause
exit /b 0

:cleanup_failed
echo.
echo Cleanup failed. Run this file from the hotpick repository root.
pause
exit /b 1
