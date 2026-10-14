# Copia de seguridad de Supabase: base de datos (pg_dump) + archivos subidos (volumes\storage) + claves (.env), en un zip con fecha.
# Se conservan las últimas 60. Manual:  powershell -ExecutionPolicy Bypass -File .\copia_seguridad.ps1
# Segunda ubicación (recomendado, otro disco o red):  -Extra "\\servidor\copias"
param([string]$Destino = "C:\Backups\SupabaseCampo", [string]$Extra = "", [int]$Conservar = 60)
. "$PSScriptRoot\comun.ps1"

Test-Docker
New-Item -ItemType Directory -Force $Destino | Out-Null
$marca = Get-Date -Format "yyyyMMdd_HHmm"
$trabajo = Join-Path $env:TEMP "copia_$marca"
New-Item -ItemType Directory -Force $trabajo | Out-Null
try {
    # La base de datos se vuelca dentro del contenedor y se copia fuera (redirigir con > estropearía el fichero binario)
    Invoke-Nativo { docker exec $Script:Contenedor pg_dump -U supabase_admin -d postgres -Fc -f /tmp/campo.dump } "No se pudo volcar la base de datos" | Out-Null
    Invoke-Nativo { docker cp "$($Script:Contenedor):/tmp/campo.dump" (Join-Path $trabajo "base_de_datos.dump") } "No se pudo copiar el volcado" | Out-Null
    cmd /c "docker exec $($Script:Contenedor) rm -f /tmp/campo.dump >nul 2>&1"

    $storage = Join-Path $Script:DirSupabase "volumes\storage"
    if (Test-Path $storage) { Copy-Item $storage (Join-Path $trabajo "storage") -Recurse -Force }
    Copy-Item (Join-Path $Script:DirSupabase ".env") (Join-Path $trabajo "env_supabase.txt") -Force   # sin las claves no se puede restaurar

    $zip = Join-Path $Destino "supabase_campo_$marca.zip"
    Compress-Archive -Path (Join-Path $trabajo "*") -DestinationPath $zip -Force
    Write-Host "Copia creada: $zip ($([math]::Round((Get-Item $zip).Length / 1MB, 1)) MB)" -ForegroundColor Green
    if ($Extra) { New-Item -ItemType Directory -Force $Extra | Out-Null; Copy-Item $zip $Extra -Force; Write-Host "Copia adicional en $Extra" }
} finally { Remove-Item $trabajo -Recurse -Force -ErrorAction SilentlyContinue }

# Rotación
foreach ($carpeta in @($Destino, $Extra) | Where-Object { $_ }) {
    Get-ChildItem $carpeta -Filter "supabase_campo_*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Conservar | Remove-Item -Force -ErrorAction SilentlyContinue
}
Write-Host "Aviso: el zip contiene las claves y los datos; guárdalo en un sitio con acceso restringido."
