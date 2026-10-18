@echo off
setlocal
cd /d "%~dp0"

where docker >nul 2>&1
if errorlevel 1 (
    echo Docker CLI was not found. Install and start Docker Desktop, then run this file again.
    pause
    exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
    echo Docker Desktop is not running. Start it and wait for Engine running, then try again.
    pause
    exit /b 1
)

if not exist ".env" copy ".env.docker.example" ".env" >nul

echo Building and starting the invoice demo. The first run can take several minutes...
docker compose up --build --wait -d
if errorlevel 1 (
    echo Startup failed. Check the error above and Docker Desktop, then try again.
    pause
    exit /b 1
)

echo Demo address: http://localhost:8000
start "" "http://localhost:8000"
pause
