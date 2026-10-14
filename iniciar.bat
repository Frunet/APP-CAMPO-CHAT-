@echo off
rem Arranca la app de Control de Fincas (dejar la ventana abierta)
cd /d "%~dp0"
if not exist "node_modules\next" (
  echo Instalando dependencias...
  call npm install
)
if not exist ".next\BUILD_ID" (
  echo Compilando la aplicacion...
  call npm run build
)
echo.
echo App en http://localhost:3000  (desde otros equipos: http://IP-de-este-PC:3000)
node_modules\.bin\next start -H 0.0.0.0 -p 3000
pause
