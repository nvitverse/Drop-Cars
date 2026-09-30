# 1-Click Sync from Drop Cars Admin to NV OS Embedded Taxi OPS
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  SYNCING DROP CARS ADMIN APP TO NV OS (TAXI OPS) ENGINE  " -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

$adminDir = "C:\Users\Administrator\Desktop\dropcars-review\admin"
$targetDir = "C:\Users\Administrator\Desktop\NV Digital Solutions\projects\nv-os-prototype\apps\taxi"

Set-Location $adminDir

Write-Host "1. Building React Native Web export..." -ForegroundColor Green
npx expo export -p web

if ($LASTEXITCODE -ne 0) {
    Write-Host "Web export failed with exit code $LASTEXITCODE" -ForegroundColor Red
    exit 1
}

Write-Host "2. Copying web build to NV OS apps directory..." -ForegroundColor Green
if (!(Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}

Copy-Item -Path "$adminDir\dist\*" -Destination $targetDir -Recurse -Force

Write-Host "3. Injecting route normalizer for subpath loading..." -ForegroundColor Green
node "C:\Users\Administrator\.gemini\antigravity-ide\brain\df90f759-b0aa-4f0d-aac5-c5eb54d6790f\scratch\inject_route_fix.js"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  SUCCESS: TAXI OPS EMBEDDED ENGINE UPDATED CLEANLY!     " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
