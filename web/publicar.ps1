# Publica la web en GitHub Pages igual que mantenimiento-web: compila y sube los ficheros al repositorio Frunet/campo-web (rama main, raíz).
# Uso (PowerShell, desde cualquier carpeta):  .\web\publicar.ps1
$ErrorActionPreference = "Stop"
$web = $PSScriptRoot
$destino = Join-Path (Split-Path (Split-Path $web)) "campo-web"   # ...\PROYECTOS APP\campo-web
$remoto = "https://github.com/Frunet/campo-web.git"

Push-Location $web
try {
  if (-not (Test-Path "node_modules")) { npm ci }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "La compilación ha fallado" }
} finally { Pop-Location }

if (-not (Test-Path $destino)) { New-Item -ItemType Directory -Path $destino | Out-Null }
Push-Location $destino
try {
  if (-not (Test-Path ".git")) { git init -b main; git remote add origin $remoto }
  Get-ChildItem -Force | Where-Object { $_.Name -ne ".git" } | Remove-Item -Recurse -Force
  Copy-Item -Path (Join-Path $web "dist\*") -Destination $destino -Recurse -Force
  New-Item -ItemType File -Path ".nojekyll" -Force | Out-Null
  git add -A
  git commit -m "Publicación $(Get-Date -Format 'yyyy-MM-dd HH:mm')" 2>$null
  git push -u origin main
  Write-Host "Publicado: https://frunet.github.io/campo-web/"
} finally { Pop-Location }
