# Paso 1: instala Supabase (versión de código abierto) con Docker en C:\supabase-campo y lo arranca.
# Requisitos: Docker Desktop en marcha y Git. No necesita ser administrador.
#   powershell -ExecutionPolicy Bypass -File .\1_instalar.ps1
# Si se interrumpe después de generar las claves, al repetirlo REANUDA sin regenerarlas.
param([string]$Ip = "")
. "$PSScriptRoot\comun.ps1"

Test-Docker
$sh = Get-Sh
if (-not $Ip) { $Ip = Get-IpLocal }
$Dir = $Script:DirSupabase
$Api = $Script:PuertoApi
$EnvFile = Join-Path $Dir ".env"
$MarcaClaves = Join-Path $Dir ".claves_generadas"
$MarcaFin = Join-Path $Dir ".instalado"

if (Test-Path $MarcaFin) {
    throw "Ya hay una instalación terminada en $Dir. No la toco para no perder claves ni datos. Para arrancarla usa iniciar_supabase.bat."
}
$reanudar = (Test-Path $EnvFile) -and (Test-Path $MarcaClaves)
if ((Test-Path $EnvFile) -and -not $reanudar) {
    throw "Hay un $EnvFile de un intento anterior que no terminó de generar las claves. Borra la carpeta $Dir (aún no tiene datos) y repite."
}
foreach ($p in @($Api, 8143, 5432, 6543)) {
    if (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue) {
        throw "El puerto $p ya está en uso en este PC. Ciérralo o cambia el puerto (ver LEEME.md)."
    }
}

if ($reanudar) {
    Write-Host "Reanudando una instalación anterior (las claves ya estaban generadas)..."
} else {
    Write-Host "1/5 Descargando la configuración oficial de Supabase ($Script:Etiqueta)..."
    $tmp = Join-Path $env:TEMP ("supabase-clone-" + [guid]::NewGuid().ToString("N"))
    # core.autocrlf=false: si no, los scripts y configuraciones se copian con saltos de línea de Windows y los contenedores fallan
    Invoke-Nativo { git -c core.autocrlf=false clone --depth 1 --branch $Script:Etiqueta https://github.com/supabase/supabase $tmp } "No se pudo descargar la configuración de Supabase" | Out-Null
    New-Item -ItemType Directory -Force $Dir | Out-Null
    Copy-Item -Path (Join-Path $tmp "docker\*") -Destination $Dir -Recurse -Force
    Copy-Item -Path (Join-Path $tmp "docker\.env.example") -Destination $Dir -Force
    Remove-Item $tmp -Recurse -Force
    [System.IO.File]::WriteAllText((Join-Path $Dir ".supabase-version"), "ref=$Script:Etiqueta`n")

    Set-Location $Dir
    Write-Host "2/5 Generando contraseñas y claves nuevas (nada de los valores de ejemplo)..."
    Copy-Item ".env.example" ".env"
    Invoke-Nativo { & $sh utils/generate-keys.sh --update-env } "No se pudieron generar las claves" | Out-Null
    Invoke-Nativo { & $sh utils/add-new-auth-keys.sh --update-env } "No se pudieron generar las claves de autenticación (hace falta Node.js o Docker)" | Out-Null
    [System.IO.File]::WriteAllText($MarcaClaves, "ok`n")
}
Set-Location $Dir

Write-Host "3/5 Ajustando direcciones y seguridad..."
$url = "http://$($Ip):$Api"
Set-EnvVar $EnvFile "SUPABASE_PUBLIC_URL" $url
Set-EnvVar $EnvFile "API_EXTERNAL_URL" "$url/auth/v1"
Set-EnvVar $EnvFile "SITE_URL" "http://$($Ip):$($Script:PuertoApp)"
Set-EnvVar $EnvFile "ADDITIONAL_REDIRECT_URLS" "http://localhost:$($Script:PuertoApp)"
Set-EnvVar $EnvFile "API_GW_HTTP_PORT" "$Api"
Set-EnvVar $EnvFile "KONG_HTTP_PORT" "$Api"
Set-EnvVar $EnvFile "KONG_HTTPS_PORT" "8143"
Set-EnvVar $EnvFile "DISABLE_SIGNUP" "true"                 # los usuarios los crea solo el administrador
Set-EnvVar $EnvFile "ENABLE_EMAIL_AUTOCONFIRM" "true"       # sin servidor de correo, el administrador los da de alta ya confirmados
Set-EnvVar $EnvFile "STUDIO_DEFAULT_ORGANIZATION" "Frunet"
Set-EnvVar $EnvFile "STUDIO_DEFAULT_PROJECT" "Control de Fincas"
# La base de datos NO debe ser accesible desde la red: los puertos de Postgres quedan solo en este PC (la API sí, por el 8100)
$compose = Join-Path $Dir "docker-compose.yml"
$c1 = [System.IO.File]::ReadAllText($compose)
$c2 = $c1.Replace('- ${POSTGRES_PORT}:5432', '- 127.0.0.1:${POSTGRES_PORT}:5432').Replace('- ${POOLER_PROXY_PORT_TRANSACTION}:6543', '- 127.0.0.1:${POOLER_PROXY_PORT_TRANSACTION}:6543')
if ($c2 -ne $c1) { [System.IO.File]::WriteAllText($compose, $c2, (New-Object System.Text.UTF8Encoding($false))) }

Write-Host "4/5 Descargando las imágenes de Docker (unos 2-3 GB; la primera vez tarda)..."
Invoke-Nativo { docker compose pull } "No se pudieron descargar las imágenes" | Out-Null

Write-Host "5/5 Arrancando Supabase (espera a que todos los servicios estén sanos)..."
Invoke-Nativo { docker compose up -d --wait } "Algún servicio no ha arrancado. Mira los registros con: docker compose logs" | Out-Null
[System.IO.File]::WriteAllText($MarcaFin, "ok`n")

Write-Host ""
Write-Host "Supabase está en marcha." -ForegroundColor Green
Write-Host "  API / Studio:   $url   (Studio pide el usuario y contraseña del panel)"
Write-Host "  Ver contraseñas: cd $Dir ; & '$sh' run.sh secrets   (GUÁRDALAS en un sitio seguro: el panel y la base de datos)"
Write-Host "  Siguiente paso: .\2_aplicar_migraciones.ps1"
