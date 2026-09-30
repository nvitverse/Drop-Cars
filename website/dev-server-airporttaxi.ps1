# AirportTaxi.International - PHP built-in server for local preview.
# Runs the SAME codebase/backend as Drop Cars (public_html/), but through
# router-airporttaxi.php, which spoofs Host: airporttaxi.international so the
# site resolves to its native black/gold branding on every page — exactly
# like the real production domain will, without needing local DNS.
#
# Run this ALONGSIDE dev-server.ps1 (Drop Cars, port 8001) on a different
# port so the two sites never share a server process or URL:
#   .\sync-public-html.ps1
#   .\dev-server.ps1                  # Drop Cars      -> http://localhost:8001/
#   .\dev-server-airporttaxi.ps1      # AirportTaxi    -> http://localhost:8002/
#
# Usage:
#   .\dev-server-airporttaxi.ps1
#   .\dev-server-airporttaxi.ps1 -Port 8010

param(
    [int]$Port = 8002,
    [string]$ListenHost = "localhost"
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$publicRoot = Join-Path $root "public_html"
Set-Location $root

function Resolve-DropCarsPhp {
    $explicit = $env:DROP_CARS_PHP
    if ($explicit -and (Test-Path -LiteralPath $explicit)) {
        return (Resolve-Path -LiteralPath $explicit).Path
    }
    $cmd = Get-Command php -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source) {
        return $cmd.Source
    }
    $candidates = @(
        "C:\xampp\php\php.exe",
        "C:\laragon\bin\php\php-8.3.12-Win32-vs16-x64\php.exe"
    )
    if (Test-Path "C:\laragon\bin\php") {
        $laragonPhp = Get-ChildItem -Path "C:\laragon\bin\php" -Filter "php.exe" -Recurse -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending | Select-Object -First 1
        if ($laragonPhp) {
            $candidates = @($laragonPhp.FullName) + $candidates
        }
    }
    foreach ($p in $candidates) {
        if ($p -and (Test-Path -LiteralPath $p)) {
            return (Resolve-Path -LiteralPath $p).Path
        }
    }
    return $null
}

$phpExe = Resolve-DropCarsPhp
if (-not $phpExe) {
    Write-Host "PHP was not found. Either add PHP to PATH, install XAMPP/Laragon, or set env var DROP_CARS_PHP to the full path of php.exe" -ForegroundColor Red
    exit 1
}
Write-Host "Using PHP: $phpExe" -ForegroundColor DarkGray

if (-not (Test-Path $publicRoot)) {
    Write-Host "public_html not found. Run .\sync-public-html.ps1 from the project root first." -ForegroundColor Red
    exit 1
}

$router = Join-Path $publicRoot "router-airporttaxi.php"
if (-not (Test-Path $router)) {
    Write-Host "public_html\router-airporttaxi.php not found. Run .\sync-public-html.ps1 from the project root first." -ForegroundColor Red
    exit 1
}

$env:APP_ENV = "development"

Write-Host ""
Write-Host "AirportTaxi.International - local server (native gold theme)" -ForegroundColor Yellow
Write-Host ('  Site:   http://{0}:{1}/' -f $ListenHost, $Port)
Write-Host "  Root:   public_html (same backend/DB as Drop Cars)"
Write-Host "  Host spoofed to: airporttaxi.international"
Write-Host "  Stop:   Ctrl+C"
Write-Host ""
Write-Host "Run Drop Cars' own server separately for the blue /airporttaxi page: .\dev-server.ps1" -ForegroundColor DarkGray
Write-Host ""

$listen = '{0}:{1}' -f $ListenHost, $Port
& $phpExe -S $listen -t $publicRoot $router
