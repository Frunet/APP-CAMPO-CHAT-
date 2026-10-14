@echo off
rem Detiene Supabase SIN borrar datos (docker compose down no toca los volumenes).
cd /d C:\supabase-campo || (echo No existe C:\supabase-campo & pause & exit /b 1)
docker compose down
echo Supabase detenido. Los datos se conservan.
pause
