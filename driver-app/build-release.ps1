$ErrorActionPreference = "Stop"

$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot"
New-Item -ItemType Directory -Force C:\jtmp | Out-Null
$env:TEMP = "C:\jtmp"
$env:TMP = "C:\jtmp"
$env:JAVA_TOOL_OPTIONS = "-Djava.io.tmpdir=C:\jtmp"

Set-Location "C:\Users\Administrator\Desktop\dropcars-review\vendor\Driver-App\android"

Write-Host "Building release APK..." -ForegroundColor Cyan
& .\gradlew.bat assembleRelease --no-daemon

Write-Host "Building release AAB..." -ForegroundColor Cyan
& .\gradlew.bat bundleRelease --no-daemon

Write-Host "Copying output files..." -ForegroundColor Green
$apkSrc = "C:\Users\Administrator\Desktop\dropcars-review\vendor\Driver-App\android\app\build\outputs\apk\release\app-release.apk"
$apkDest = "C:\Users\Administrator\Desktop\DropCarsDriver-release.apk"
$aabSrc = "C:\Users\Administrator\Desktop\dropcars-review\vendor\Driver-App\android\app\build\outputs\bundle\release\app-release.aab"
$aabDest = "C:\Users\Administrator\Desktop\DropCarsDriver-release.aab"

if (Test-Path $apkSrc) {
    Copy-Item -Path $apkSrc -Destination $apkDest -Force
    Copy-Item -Path $apkSrc -Destination "C:\Users\Administrator\Desktop\DropCarsDriver-v1.0.7.apk" -Force
    Write-Host "Copied APK to $apkDest and DropCarsDriver-v1.0.7.apk" -ForegroundColor Green
} else {
    Write-Host "WARNING: APK not found at $apkSrc" -ForegroundColor Yellow
}

if (Test-Path $aabSrc) {
    Copy-Item -Path $aabSrc -Destination $aabDest -Force
    Copy-Item -Path $aabSrc -Destination "C:\Users\Administrator\Desktop\DropCarsDriver-v1.0.7.aab" -Force
    Write-Host "Copied AAB to $aabDest and DropCarsDriver-v1.0.7.aab" -ForegroundColor Green
} else {
    Write-Host "WARNING: AAB not found at $aabSrc" -ForegroundColor Yellow
}

Write-Host "Build and packaging completed successfully!" -ForegroundColor Green
