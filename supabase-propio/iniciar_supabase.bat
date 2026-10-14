@echo off
rem Arranca Supabase (Docker Desktop debe estar en marcha). Los contenedores tambien se reinician solos con Docker.
cd /d C:\supabase-campo || (echo No existe C:\supabase-campo: ejecuta antes 1_instalar.ps1 & pause & exit /b 1)
docker compose up -d --wait
if errorlevel 1 (echo Algun servicio no ha arrancado. Mira: docker compose logs & pause & exit /b 1)
echo Supabase en marcha en http://localhost:8100
pause
