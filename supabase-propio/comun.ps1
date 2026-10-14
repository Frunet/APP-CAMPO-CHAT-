# Funciones y valores compartidos por los scripts de supabase-propio (no se ejecuta solo)
$ErrorActionPreference = "Stop"

# La base de datos NO va en OneDrive: sincronizar ficheros de Postgres en vivo los corrompe
$Script:DirSupabase = if ($env:SUPABASE_CAMPO_DIR) { $env:SUPABASE_CAMPO_DIR } else { "C:\supabase-campo" }
$Script:PuertoApi   = 8100                      # el 8000 lo usa la app de mantenimiento
$Script:PuertoApp   = 3000
$Script:Etiqueta    = "self-hosted/v0.8.2"      # versión oficial probada en conjunto por Supabase
$Script:Contenedor  = "supabase-db"

function Invoke-Nativo {
    # Ejecuta un comando externo sin que PowerShell 5.1 trate su salida de error como excepción; falla si el código de salida != 0
    param([scriptblock]$Comando, [string]$Mensaje = "El comando ha fallado")
    $anterior = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try { $salida = & $Comando 2>&1 | Out-String; $codigo = $LASTEXITCODE } finally { $ErrorActionPreference = $anterior }
    if ($codigo -ne 0) { throw "$Mensaje (código $codigo).`n$salida" }
    return $salida
}

function Test-Docker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw "Docker no está instalado. Instala Docker Desktop (ver LEEME.md, paso 1) y vuelve a ejecutar."
    }
    cmd /c "docker info >nul 2>&1"
    if ($LASTEXITCODE -ne 0) { throw "Docker está instalado pero no está en marcha. Abre Docker Desktop, espera a que diga «Engine running» y reintenta." }
}

function Get-Sh {
    # sh.exe de Git for Windows: los scripts oficiales de Supabase son de shell
    $git = Get-Command git -ErrorAction SilentlyContinue
    if (-not $git) { throw "Git no está instalado (https://git-scm.com/download/win)." }
    $raiz = Split-Path (Split-Path $git.Source)
    foreach ($c in @("bin\sh.exe", "usr\bin\sh.exe")) { $p = Join-Path $raiz $c; if (Test-Path $p) { return $p } }
    throw "No encuentro sh.exe junto a Git for Windows ($raiz)."
}

function Get-IpLocal {
    $ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -like "192.168.*" } | Select-Object -First 1).IPAddress
    if (-not $ip) { throw "No he podido detectar la IP de la red local. Indícala con -Ip 192.168.x.x" }
    return $ip
}

function Set-EnvVar {
    # Cambia (o añade) NOMBRE=valor en un .env, con saltos de línea LF y sin BOM (como esperan los scripts de shell)
    param([string]$Ruta, [string]$Nombre, [string]$Valor)
    $lineas = [System.Collections.Generic.List[string]]::new()
    $lineas.AddRange([string[]][System.IO.File]::ReadAllLines($Ruta))
    $patron = "^" + [regex]::Escape($Nombre) + "="
    $hecho = $false
    for ($i = 0; $i -lt $lineas.Count; $i++) { if ($lineas[$i] -match $patron) { $lineas[$i] = "$Nombre=$Valor"; $hecho = $true } }
    if (-not $hecho) { $lineas.Add("$Nombre=$Valor") }
    [System.IO.File]::WriteAllText($Ruta, (($lineas -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding($false)))
}

function Get-EnvVar {
    param([string]$Ruta, [string]$Nombre)
    $patron = "^" + [regex]::Escape($Nombre) + "=(.*)$"
    foreach ($l in [System.IO.File]::ReadAllLines($Ruta)) { if ($l -match $patron) { return $Matches[1].Trim().Trim('"') } }
    return $null
}

function Invoke-Psql {
    # Ejecuta SQL dentro del contenedor de la base de datos como superusuario (sin contraseña: conexión local del contenedor)
    param([string]$Sql)
    return (Invoke-Nativo { docker exec $Script:Contenedor psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -tA -c $Sql } "Error ejecutando SQL").Trim()
}
