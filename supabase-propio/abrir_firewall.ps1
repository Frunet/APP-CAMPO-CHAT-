# Ejecutar UNA VEZ como Administrador: permite que los móviles y otros equipos de la red local (redes privadas) lleguen a Supabase.
# Solo se abre el puerto de la API (8100). La base de datos (5432/6543) NO se abre a la red.
$ErrorActionPreference = "Stop"
$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $esAdmin) { throw "Ejecútalo como administrador." }
if (-not (Get-NetFirewallRule -DisplayName "Supabase Campo (API)" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName "Supabase Campo (API)" -Direction Inbound -Protocol TCP -LocalPort 8100 -Action Allow -Profile Private, Domain | Out-Null
}
Write-Host "Puerto 8100 abierto en redes privadas." -ForegroundColor Green
Write-Host "Comprueba desde OTRO equipo que la base de datos NO es accesible:  Test-NetConnection <IP-de-este-PC> -Port 5432   (debe fallar)"
