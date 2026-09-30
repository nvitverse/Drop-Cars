$ErrorActionPreference = "Continue"
$root = $PSScriptRoot
Set-Location $root

function Log-Step($msg) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
}

# 1. Environment Setup
Log-Step "Setting up Java & Android Environment"
$jdkBase = "C:\Program Files\Eclipse Adoptium"
if (Test-Path $jdkBase) {
    $jdkDir = Get-ChildItem $jdkBase -Directory -Filter "jdk-17*" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($jdkDir) {
        $env:JAVA_HOME = $jdkDir.FullName
        $env:Path = "$($env:JAVA_HOME)\bin;$env:Path"
    }
}
Write-Host "JAVA_HOME: $env:JAVA_HOME"

$sdkRoot = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:Path = "$sdkRoot\cmdline-tools\latest\bin;$sdkRoot\platform-tools;$env:Path"
Write-Host "ANDROID_HOME: $env:ANDROID_HOME"

$localProps = Join-Path $root "android\local.properties"
$sdkDirEscaped = $sdkRoot -replace '\\', '/'
"sdk.dir=$sdkDirEscaped" | Set-Content -Path $localProps -Encoding ASCII

# 2. Build APK via Gradle
Log-Step "Building APK via Gradle assembleRelease"
Set-Location (Join-Path $root "android")

# Increase memory limit for node/metro during bundling
$env:NODE_OPTIONS = "--max-old-space-size=4096"

& .\gradlew.bat assembleRelease --no-daemon
$buildExit = $LASTEXITCODE

Set-Location $root

$apkSrc = Join-Path $root "android\app\build\outputs\apk\release\app-release.apk"

# Fallback to assembleDebug if assembleRelease encountered any issue
if (-not (Test-Path $apkSrc) -or $buildExit -ne 0) {
    Write-Warning "Release build returned exit code $buildExit. Attempting assembleDebug fallback..."
    Set-Location (Join-Path $root "android")
    & .\gradlew.bat assembleDebug --no-daemon
    Set-Location $root
    $apkSrc = Join-Path $root "android\app\build\outputs\apk\debug\app-debug.apk"
}

# 3. Verify APK Output
Log-Step "Verifying Built APK"
if (Test-Path $apkSrc) {
    $apkItem = Get-Item $apkSrc
    $apkSizeMB = [math]::Round($apkItem.Length / 1MB, 2)
    Write-Host "SUCCESS: APK created at: $apkSrc ($apkSizeMB MB)" -ForegroundColor Green

    # Copy to Desktop
    $desktop = [Environment]::GetFolderPath("Desktop")
    $desktopDest = Join-Path $desktop "DropCarsDriver-latest.apk"
    Copy-Item -Force $apkSrc $desktopDest
    Write-Host "Copied to Desktop: $desktopDest" -ForegroundColor Green

    # 4. Trigger Automatic Email Delivery
    Log-Step "Triggering Automated SMTP Email with APK Attachment"
    & powershell -ExecutionPolicy Bypass -File (Join-Path $root "send_apk_email.ps1") -ApkPath $desktopDest -Recipient "dropcarsbookings@gmail.com"
} else {
    Write-Error "CRITICAL: No APK file was generated in output directories."
}

Log-Step "Workflow Complete"
