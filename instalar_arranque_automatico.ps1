# Ejecutar UNA VEZ como Administrador (clic derecho > Ejecutar con PowerShell):
#  - abre el puerto 3000 en el firewall (para moviles de la red)
#  - arranca la app automaticamente al iniciar Windows, sin ventana
$ErrorActionPreference = "Stop"
$dir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$next = Join-Path $dir "node_modules\next\dist\bin\next"
if (-not (Test-Path (Join-Path $dir ".next\BUILD_ID"))) { throw "Primero ejecuta iniciar.bat para instalar y compilar." }
$node = (Get-Command node -ErrorAction Stop).Source

if (-not (Get-NetFirewallRule -DisplayName "App Campo" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName "App Campo" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private,Domain | Out-Null
}
$action  = New-ScheduledTaskAction -Execute $node -Argument "`"$next`" start -H 0.0.0.0 -p 3000" -WorkingDirectory $dir
$trigger = New-ScheduledTaskTrigger -AtStartup
$set     = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName "AppCampo" -Action $action -Trigger $trigger -Settings $set -User "SYSTEM" -RunLevel Highest -Force | Out-Null
Start-ScheduledTask -TaskName "AppCampo"
Write-Host "Listo. La app arranca sola con Windows. Acceso: http://$((Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like '192.168.*' } | Select-Object -First 1).IPAddress):3000"
