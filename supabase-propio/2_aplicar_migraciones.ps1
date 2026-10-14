# Paso 2: crea las tablas de la aplicación aplicando supabase\migrations\*.sql en orden.
# Es repetible: apunta qué migraciones ya están aplicadas y salta esas. Cada migración se aplica entera o no se aplica (una transacción).
param([string]$Carpeta = "")
. "$PSScriptRoot\comun.ps1"

Test-Docker
if (-not $Carpeta) { $Carpeta = Join-Path $PSScriptRoot "..\supabase\migrations" }
$ficheros = Get-ChildItem $Carpeta -Filter *.sql | Sort-Object Name
if (-not $ficheros) { throw "No hay migraciones en $Carpeta" }
if ((Invoke-Nativo { docker ps --filter "name=^$Script:Contenedor$" --format "{{.Names}}" }).Trim() -ne $Script:Contenedor) {
    throw "El contenedor $Script:Contenedor no está en marcha. Arranca Supabase con iniciar_supabase.bat."
}

# Tabla de control (con RLS y sin políticas: no es accesible desde la API)
Invoke-Psql "create table if not exists public._migraciones_aplicadas (nombre text primary key, aplicada_at timestamptz not null default now()); alter table public._migraciones_aplicadas enable row level security;" | Out-Null

foreach ($f in $ficheros) {
    $ya = Invoke-Psql "select 1 from public._migraciones_aplicadas where nombre = '$($f.Name)'"
    if ($ya -eq "1") { Write-Host "  ya aplicada: $($f.Name)"; continue }

    Write-Host "  aplicando:   $($f.Name) ..."
    # Se copia el fichero al contenedor (así no hay problemas de codificación con tildes) y se ejecuta con -1 = una sola transacción
    $envoltorio = Join-Path $env:TEMP "envoltorio_migracion.sql"
    [System.IO.File]::WriteAllText($envoltorio, "\i /tmp/migracion.sql`ninsert into public._migraciones_aplicadas(nombre) values ('$($f.Name)');`n", (New-Object System.Text.UTF8Encoding($false)))
    Invoke-Nativo { docker cp $f.FullName "$($Script:Contenedor):/tmp/migracion.sql" } "No se pudo copiar la migración" | Out-Null
    Invoke-Nativo { docker cp $envoltorio "$($Script:Contenedor):/tmp/envoltorio.sql" } "No se pudo copiar la migración" | Out-Null
    try {
        Invoke-Nativo { docker exec $Script:Contenedor psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -1 -f /tmp/envoltorio.sql } "La migración $($f.Name) ha fallado y NO se ha aplicado" | Out-Null
    } finally {
        Remove-Item $envoltorio -ErrorAction SilentlyContinue
        cmd /c "docker exec $($Script:Contenedor) rm -f /tmp/migracion.sql /tmp/envoltorio.sql >nul 2>&1"
    }
}
Write-Host ""
Write-Host "Migraciones al día." -ForegroundColor Green
Write-Host "  Siguiente paso: .\3_crear_administrador.ps1"
