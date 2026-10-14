# Paso 4: conecta la aplicación con este Supabase. Escribe .env.local con las claves reales y QUITA el modo demo.
# Conserva lo que ya hubiera de ANTHROPIC_API_KEY, RESEND_API_KEY, EMAIL_FROM y CRON_SECRET, y guarda una copia del .env.local anterior.
param([string]$Ip = "", [string]$DirApp = "")
. "$PSScriptRoot\comun.ps1"

$envSup = Join-Path $Script:DirSupabase ".env"
if (-not (Test-Path $envSup)) { throw "No encuentro $envSup . ¿Has ejecutado 1_instalar.ps1?" }
if (-not $DirApp) { $DirApp = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path }
if (-not $Ip) { $Ip = Get-IpLocal }

$anon = Get-EnvVar $envSup "ANON_KEY"
$servicio = Get-EnvVar $envSup "SERVICE_ROLE_KEY"
if (-not $anon -or -not $servicio) { throw "Faltan ANON_KEY o SERVICE_ROLE_KEY en $envSup" }

$destino = Join-Path $DirApp ".env.local"
$previo = @{}
if (Test-Path $destino) {
    Copy-Item $destino "$destino.bak" -Force
    foreach ($l in [System.IO.File]::ReadAllLines($destino)) { if ($l -match "^([A-Z0-9_]+)=(.*)$") { $previo[$Matches[1]] = $Matches[2] } }
}
function Conservar($nombre, $pordefecto) { if ($previo.ContainsKey($nombre) -and $previo[$nombre]) { return $previo[$nombre] } else { return $pordefecto } }
$cron = Conservar "CRON_SECRET" (-join ((1..32) | ForEach-Object { "{0:x}" -f (Get-Random -Maximum 16) }))

$contenido = @"
# Generado por supabase-propio\4_configurar_app.ps1. NO se sube a git (.env.local está en .gitignore).
NEXT_PUBLIC_SUPABASE_URL=http://$($Ip):$($Script:PuertoApi)
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$anon
SUPABASE_SERVICE_ROLE_KEY=$servicio
ANTHROPIC_API_KEY=$(Conservar "ANTHROPIC_API_KEY" "")
CRON_SECRET=$cron
RESEND_API_KEY=$(Conservar "RESEND_API_KEY" "")
EMAIL_FROM=$(Conservar "EMAIL_FROM" "")
APP_URL=http://$($Ip):$($Script:PuertoApp)
"@
[System.IO.File]::WriteAllText($destino, ($contenido -replace "`r`n", "`n"), (New-Object System.Text.UTF8Encoding($false)))

Write-Host "Escrito $destino (modo demo desactivado)." -ForegroundColor Green
if (-not $previo["ANTHROPIC_API_KEY"]) { Write-Host "  AVISO: falta ANTHROPIC_API_KEY en .env.local: sin ella el chat y la lectura de documentos no funcionan." -ForegroundColor Yellow }
Write-Host "  Ahora hay que recompilar y reiniciar la app (las direcciones públicas se fijan al compilar):"
Write-Host "    cd `"$DirApp`" ; npm run build"
Write-Host "    y reinicia la tarea AppCampo (o cierra y abre iniciar.bat)"
