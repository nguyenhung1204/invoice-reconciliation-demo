@echo off
setlocal
cd /d "%~dp0backend"

if not exist ".venv\Scripts\python.exe" (
    echo Python virtual environment was not found at backend\.venv.
    echo Please create it with: py -m venv .venv and install requirements.txt
    pause
    exit /b 1
)

if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
    )
)

echo Dang khoi dong may chu AutoInvoice (Local SQLite)...
start "" "http://127.0.0.1:8000/mock"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
