$ErrorActionPreference = "Stop"

$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot"
$env:ANDROID_HOME = "C:\Users\Administrator\AppData\Local\Android\Sdk"
$env:PATH = "$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:PATH"
New-Item -ItemType Directory -Force C:\jtmp | Out-Null
$env:TEMP = "C:\jtmp"
$env:TMP = "C:\jtmp"
$env:JAVA_TOOL_OPTIONS = "-Djava.io.tmpdir=C:\jtmp"
$env:NODE_OPTIONS = "--max-old-space-size=4096"

Set-Location "C:\Users\Administrator\Desktop\dropcars-review\vendor\Driver-App"

Write-Host "Step 1: Pre-bundling Expo Router Hermes JS Bundle..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force "android\app\src\main\assets" | Out-Null
npx expo export:embed --platform android --dev false --entry-file node_modules/expo-router/entry.js --bundle-output android\app\src\main\assets\index.android.bundle --assets-dest android\app\src\main\res\

Write-Host "Step 2: Assembling Release APK via Gradle..." -ForegroundColor Cyan
Set-Location "C:\Users\Administrator\Desktop\dropcars-review\vendor\Driver-App\android"
& .\gradlew.bat assembleRelease -x createBundleReleaseJsAndAssets --no-daemon

$apkSrc = "C:\Users\Administrator\Desktop\dropcars-review\vendor\Driver-App\android\app\build\outputs\apk\release\app-release.apk"
$apkDest = "C:\Users\Administrator\Desktop\DropCarsDriver-release.apk"

if (Test-Path $apkSrc) {
    Copy-Item -Path $apkSrc -Destination $apkDest -Force
    $sizeMb = ((Get-Item $apkDest).Length / 1MB).ToString("F2")
    Write-Host "SUCCESS! Driver Release APK generated at $apkDest ($sizeMb MB)" -ForegroundColor Green
} else {
    Write-Host "WARNING: APK not found at $apkSrc" -ForegroundColor Yellow
}
