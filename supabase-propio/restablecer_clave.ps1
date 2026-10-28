# Pone una contrasena nueva a un usuario que ya existe (por ejemplo, si se ha olvidado la del administrador).
# La contrasena la escribes tu en la ventana: no se guarda en ningun archivo ni se muestra.
# Uso:  .\restablecer_clave.ps1 -Correo control@frunet.net
param([Parameter(Mandatory = $true)][string]$Correo)
. "$PSScriptRoot\comun.ps1"

$env_ = Join-Path $Script:DirSupabase ".env"
if (-not (Test-Path $env_)) { throw "No encuentro $env_" }
$url = Get-EnvVar $env_ "SUPABASE_PUBLIC_URL"
$servicio = Get-EnvVar $env_ "SERVICE_ROLE_KEY"
if (-not $servicio) { throw "Falta SERVICE_ROLE_KEY en $env_" }

if ($Correo -notmatch '^[^@\s'']+@[^@\s'']+$') { throw "Correo no valido." }
$id = (Invoke-Psql "select id from auth.users where lower(email) = lower('$Correo')" | Out-String).Trim()
if (-not $id) { throw "No existe ningun usuario con el correo $Correo" }

$clave = Read-Host "Contrasena nueva (minimo 10 caracteres)" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($clave)
try { $texto = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
if ($texto.Length -lt 10) { throw "La contrasena debe tener al menos 10 caracteres." }

$cuerpo = @{ password = $texto } | ConvertTo-Json
$cabeceras = @{ apikey = $servicio; Authorization = "Bearer $servicio" }
try {
    Invoke-RestMethod -Method Put -Uri "$url/auth/v1/admin/users/$id" -Headers $cabeceras -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($cuerpo)) | Out-Null
} catch {
    $detalle = if ($_.ErrorDetails.Message) { $_.ErrorDetails.Message } else { $_.Exception.Message }
    throw "No se pudo cambiar la contrasena: $detalle"
} finally { $texto = $null }
Write-Host "Contrasena cambiada para $Correo. Ya puedes entrar en la aplicacion." -ForegroundColor Green
