@echo off
rem يجيب — تشغيل بالنقر المزدوج
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\start.ps1"
pause
