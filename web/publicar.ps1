# Publica la web en GitHub Pages igual que mantenimiento-web (desde una rama, sin Actions):
# compila web/, copia el resultado a docs/ y sube todo al repositorio Frunet/APP-CAMPO-CHAT- (rama main).
# Uso (PowerShell):  .\web\publicar.ps1
$ErrorActionPreference = "Stop"
$web = $PSScriptRoot
$raiz = Split-Path $web
$docs = Join-Path $raiz "docs"

Push-Location $web
try {
  if (-not (Test-Path "node_modules")) { npm ci }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "La compilación ha fallado" }
} finally { Pop-Location }

if (Test-Path $docs) { Remove-Item $docs -Recurse -Force }
New-Item -ItemType Directory -Path $docs | Out-Null
Copy-Item -Path (Join-Path $web "dist\*") -Destination $docs -Recurse -Force
New-Item -ItemType File -Path (Join-Path $docs ".nojekyll") -Force | Out-Null

Push-Location $raiz
try {
  git add -A docs web
  git commit -m "Publicación de la web $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
  git push origin main
  Write-Host "Publicado: https://frunet.github.io/APP-CAMPO-CHAT-/"
} finally { Pop-Location }
