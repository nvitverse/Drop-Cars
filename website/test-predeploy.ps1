# Drop Cars - Permanent Pre-Deployment Verification & Sync Launcher
#
# Runs 9 automated test suites to ensure 100% site health before uploading to Hostinger.
#
# Usage:
#   .\test-predeploy.ps1                 # Runs all pre-deploy tests
#   .\test-predeploy.ps1 -Sync           # Runs pre-deploy tests AND syncs deploy/ package ONLY if tests pass
#   .\test-predeploy.ps1 -Port 8001      # Specify dev server port
#   .\test-predeploy.ps1 -SkipHttp       # Skip live HTTP checks (useful offline)

param(
    [int]$Port = 8001,
    [switch]$Sync,
    [switch]$SkipHttp
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
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
        "C:\laragon\bin\php\php-8.3.12-Win32-vs16-x64\php.exe",
        "C:\laragon\bin\php\php-8.2.0-Win32-vs16-x64\php.exe"
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
    Write-Host "PHP was not found. Either add PHP to PATH, install XAMPP/Laragon, or set env var DROP_CARS_PHP." -ForegroundColor Red
    exit 1
}

$testRunner = Join-Path $root "scripts\pre-deploy-test.php"
if (-not (Test-Path $testRunner)) {
    Write-Host "Pre-deploy test runner script not found at scripts\pre-deploy-test.php!" -ForegroundColor Red
    exit 1
}

$baseUrl = "http://localhost:$Port"
$phpArgs = @(
    $testRunner,
    "--base-url=$baseUrl",
    "--auto-start-server"
)

if ($SkipHttp) {
    $phpArgs += "--skip-http"
}

Write-Host "`nStarting Drop Cars Pre-Deployment Verification..." -ForegroundColor Cyan

& $phpExe $phpArgs
$exitCode = $LASTEXITCODE

if ($exitCode -eq 0) {
    Write-Host "`n========================================================" -ForegroundColor Green
    Write-Host " PRE-DEPLOYMENT VERIFICATION PASSED SUCCESSFULLY! " -ForegroundColor Green
    Write-Host "========================================================`n" -ForegroundColor Green

    if ($Sync) {
        $syncScript = Join-Path $root "sync-deploy.ps1"
        if (Test-Path $syncScript) {
            Write-Host "Auto-triggering sync-deploy.ps1..." -ForegroundColor Cyan
            & powershell -ExecutionPolicy Bypass -File $syncScript
        } else {
            Write-Host "sync-deploy.ps1 script not found!" -ForegroundColor Red
        }
    } else {
        Write-Host "To automatically build the deploy package next time, run:" -ForegroundColor DarkYellow
        Write-Host "  .\test-predeploy.ps1 -Sync`n" -ForegroundColor Yellow
    }
} else {
    Write-Host "`n========================================================" -ForegroundColor Red
    Write-Host " PRE-DEPLOYMENT VERIFICATION FAILED! DEPLOYMENT BLOCKED." -ForegroundColor Red
    Write-Host "========================================================`n" -ForegroundColor Red
    Write-Host "Please fix the failing tests listed above before deploying to production." -ForegroundColor Yellow
    exit 1
}
