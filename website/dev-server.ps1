# Drop Cars - PHP built-in server for local preview (site + admin + API).
# Serves public_html/ so local preview matches Antigravity/Hostinger web root.
# Uses public_html/router.php so URLs match production (.htaccess rules).
#
# Prerequisites: PHP (on PATH, or XAMPP/Laragon, or set DROP_CARS_PHP), MySQL running, admin/config/database.local.php.
#
# Usage:
#   .\sync-public-html.ps1
#   .\dev-server.ps1
#   .\dev-server.ps1 -StartMySql          # also start XAMPP MySQL if port 3306 is closed
#   .\dev-server.ps1 -Port 3000
#   .\dev-server.ps1 -ListenHost 0.0.0.0   # phone/other devices on LAN (DB override still works via cli-server)

param(
    [int]$Port = 8001,
    [string]$ListenHost = "localhost",
    [switch]$StartMySql
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

$router = Join-Path $publicRoot "router.php"
if (-not (Test-Path $router)) {
    Write-Host "public_html\router.php not found. Run .\sync-public-html.ps1 from the project root first." -ForegroundColor Red
    exit 1
}

$env:APP_ENV = "development"

if ($StartMySql) {
    $mysqlHelper = Join-Path $root "scripts\start-xampp-mysql.ps1"
    if (Test-Path $mysqlHelper) {
        try {
            powershell -ExecutionPolicy Bypass -File $mysqlHelper
        } catch {
            Write-Host $_.Exception.Message -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "Missing scripts\start-xampp-mysql.ps1" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "Drop Cars - local server" -ForegroundColor Cyan
Write-Host ('  Site:   http://{0}:{1}/' -f $ListenHost, $Port)
Write-Host ('  Admin:  http://{0}:{1}/admin/dashboard' -f $ListenHost, $Port)
Write-Host "  Root:   public_html"
Write-Host "  Stop:   Ctrl+C"
Write-Host "  MySQL: use XAMPP Control Panel → Start MySQL, or run: .\scripts\start-xampp-mysql.ps1" -ForegroundColor DarkYellow
Write-Host "         or one shot: .\dev-server.ps1 -StartMySql" -ForegroundColor DarkYellow
Write-Host ""

$listen = '{0}:{1}' -f $ListenHost, $Port
& $phpExe -S $listen -t $publicRoot $router
