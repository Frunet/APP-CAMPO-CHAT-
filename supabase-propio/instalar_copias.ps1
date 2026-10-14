# Ejecutar UNA VEZ como Administrador (clic derecho > Ejecutar con PowerShell): programa la copia de seguridad a las 02:00 y 13:00.
# La tarea se ejecuta con TU usuario (Docker Desktop solo es accesible con una sesión de usuario), así que el PC debe tener la sesión iniciada.
param([string]$Extra = "")
$ErrorActionPreference = "Stop"
$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $esAdmin) { throw "Ejecútalo como administrador." }

$script = Join-Path $PSScriptRoot "copia_seguridad.ps1"
$args_ = "-NoProfile -ExecutionPolicy Bypass -File `"$script`"" + $(if ($Extra) { " -Extra `"$Extra`"" } else { "" })
$accion = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $args_
$disparadores = @((New-ScheduledTaskTrigger -Daily -At "02:00"), (New-ScheduledTaskTrigger -Daily -At "13:00"))
$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)
$usuario = "$env:USERDOMAIN\$env:USERNAME"
Register-ScheduledTask -TaskName "SupabaseCampo-Copias" -Action $accion -Trigger $disparadores -Settings $ajustes -User $usuario -RunLevel Highest -Force | Out-Null
Write-Host "Tarea SupabaseCampo-Copias creada (02:00 y 13:00, usuario $usuario). Copias en C:\Backups\SupabaseCampo." -ForegroundColor Green
Write-Host "Prueba ahora:  Start-ScheduledTask -TaskName SupabaseCampo-Copias"
