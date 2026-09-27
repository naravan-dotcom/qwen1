@echo off
rem ============================================================
rem  Office-Desktop - Simulasi Kantor 3D (karyawan = aplikasimu)
rem  Double-click file ini di Windows.
rem ============================================================
title Office-Desktop Launcher
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python tidak ditemukan. Install dulu dari https://python.org
    echo         (centang "Add Python to PATH" saat install).
    pause
    exit /b 1
)

if not exist ".venv" (
    echo [1/3] Membuat virtualenv...
    python -m venv .venv || (pause & exit /b 1)
)

echo [2/3] Memastikan dependensi...
".venv\Scripts\python.exe" -c "import psutil, websockets" 2>nul
if errorlevel 1 (
    ".venv\Scripts\python.exe" -m pip install --quiet -r requirements.txt
)

echo [3/3] Membuka kantor... browser akan otomatis terbuka di http://localhost:8000
start "" http://localhost:8000
".venv\Scripts\python.exe" run.py --no-browser

pause
