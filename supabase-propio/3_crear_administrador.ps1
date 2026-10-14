# Paso 3: crea el primer usuario. El primero que se crea queda como ADMINISTRADOR (lo decide la base de datos).
# Los demás usuarios los crea después ese administrador desde la aplicación (Maestros > Usuarios).
param([Parameter(Mandatory = $true)][string]$Correo, [string]$Nombre = "Administrador")
. "$PSScriptRoot\comun.ps1"

$env_ = Join-Path $Script:DirSupabase ".env"
if (-not (Test-Path $env_)) { throw "No encuentro $env_ . ¿Has ejecutado 1_instalar.ps1?" }
$url = Get-EnvVar $env_ "SUPABASE_PUBLIC_URL"
$servicio = Get-EnvVar $env_ "SERVICE_ROLE_KEY"
if (-not $servicio) { throw "Falta SERVICE_ROLE_KEY en $env_" }

$clave = Read-Host "Contraseña del administrador (mínimo 10 caracteres)" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($clave)
try { $texto = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
if ($texto.Length -lt 10) { throw "La contraseña debe tener al menos 10 caracteres." }

$cuerpo = @{ email = $Correo; password = $texto; email_confirm = $true; user_metadata = @{ nombre = $Nombre } } | ConvertTo-Json -Depth 4
$cabeceras = @{ apikey = $servicio; Authorization = "Bearer $servicio" }
try {
    Invoke-RestMethod -Method Post -Uri "$url/auth/v1/admin/users" -Headers $cabeceras -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($cuerpo)) | Out-Null
} catch {
    $detalle = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
    throw "No se pudo crear el usuario: $detalle"
} finally { $texto = $null }

Write-Host "Usuario creado. Comprobación del rol:" -ForegroundColor Green
Invoke-Psql "select email, rol from public.profiles order by created_at" | Write-Host
Write-Host "  Siguiente paso: .\4_configurar_app.ps1"
