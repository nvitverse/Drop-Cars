$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Set-Location $root

function Write-Step($msg) {
  Write-Host ""
  Write-Host "==== $msg ====" -ForegroundColor Cyan
}

# ---------------------------------------------------------------------------
# 1. Ensure JDK 17 is available
# ---------------------------------------------------------------------------
Write-Step "Checking for JDK 17"
$javaOk = $false
try {
  $v = & java -version 2>&1 | Out-String
  if ($v -match '"17\.') { $javaOk = $true }
} catch {}

if (-not $javaOk) {
  Write-Step "Installing Eclipse Temurin JDK 17 via winget (a UAC prompt may appear - click Yes)"
  winget install --id EclipseAdoptium.Temurin.17.JDK -e --silent --accept-package-agreements --accept-source-agreements
}

$jdkBase = "C:\Program Files\Eclipse Adoptium"
$jdkDir = $null
if (Test-Path $jdkBase) {
  $jdkDir = Get-ChildItem $jdkBase -Directory -Filter "jdk-17*" -ErrorAction SilentlyContinue | Select-Object -First 1
}
if ($jdkDir) {
  $env:JAVA_HOME = $jdkDir.FullName
  $env:Path = "$($env:JAVA_HOME)\bin;$env:Path"
}
Write-Host "JAVA_HOME = $env:JAVA_HOME"

# ---------------------------------------------------------------------------
# 2. Ensure Android SDK (command-line tools only - no full Android Studio)
# ---------------------------------------------------------------------------
Write-Step "Checking for Android SDK"
$sdkRoot = $env:ANDROID_HOME
if (-not $sdkRoot -or -not (Test-Path $sdkRoot)) {
  $sdkRoot = "$env:LOCALAPPDATA\Android\Sdk"
}
$sdkManager = Join-Path $sdkRoot "cmdline-tools\latest\bin\sdkmanager.bat"

if (-not (Test-Path $sdkManager)) {
  Write-Step "Downloading Android SDK command-line tools (first-time only, ~150MB)"
  New-Item -ItemType Directory -Force -Path $sdkRoot | Out-Null
  $zipUrl = "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"
  $zipPath = "$env:TEMP\cmdline-tools.zip"
  Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath
  Expand-Archive -Path $zipPath -DestinationPath "$env:TEMP\cmdline-tools-extract" -Force
  New-Item -ItemType Directory -Force -Path (Join-Path $sdkRoot "cmdline-tools") | Out-Null
  Move-Item -Force "$env:TEMP\cmdline-tools-extract\cmdline-tools" (Join-Path $sdkRoot "cmdline-tools\latest")
}

$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:Path = "$sdkRoot\cmdline-tools\latest\bin;$sdkRoot\platform-tools;$env:Path"

Write-Step "Accepting SDK licenses and installing platform-tools / build-tools / platform 35"
$licenseAnswers = ("y`n" * 20)
$licenseAnswers | & $sdkManager --licenses --sdk_root="$sdkRoot" | Out-Null
& $sdkManager --sdk_root="$sdkRoot" "platform-tools" "platforms;android-35" "build-tools;35.0.0"

# ---------------------------------------------------------------------------
# 3. Point Gradle at the SDK
# ---------------------------------------------------------------------------
$localProps = Join-Path $root "android\local.properties"
# Forward slashes read correctly in a Java .properties file on Windows with
# no escaping needed - the previous single-to-quad-backslash regex replace
# produced a corrupted double-backslash path once Java's properties parser
# un-escaped it (e.g. "C:\\Users\\..." as a literal runtime string instead
# of "C:\Users\...").
$sdkDirEscaped = $sdkRoot -replace '\\', '/'
"sdk.dir=$sdkDirEscaped" | Set-Content -Path $localProps -Encoding ASCII

# ---------------------------------------------------------------------------
# 4. Build a standalone Release APK (standalone production app for phones)
# ---------------------------------------------------------------------------
Write-Step "Building standalone Release APK"
Set-Location (Join-Path $root "android")
& .\gradlew.bat assembleRelease --no-daemon
$buildExit = $LASTEXITCODE
Set-Location $root

# ---------------------------------------------------------------------------
# 5. Copy result to the Desktop so it's easy to find
# ---------------------------------------------------------------------------
$apkSrc = Join-Path $root "android\app\build\outputs\apk\release\app-release.apk"
if (-not (Test-Path $apkSrc)) {
  $apkSrc = Join-Path $root "android\app\build\outputs\apk\debug\app-debug.apk"
}
$desktop = [Environment]::GetFolderPath("Desktop")
$apkDest = Join-Path $desktop "DropCarsDriver-test.apk"

if ($buildExit -eq 0 -and (Test-Path $apkSrc)) {
  Copy-Item -Force $apkSrc $apkDest
  Write-Step "SUCCESS: APK is at $apkDest"

  $devices = & adb devices 2>&1 | Out-String
  if ($devices -match "device`r?`n") {
    Write-Step "Phone detected over USB - installing directly"
    & adb install -r $apkSrc
    Write-Host "Installed. Open the Drop Cars Driver app on the phone to test."
  } else {
    Write-Host "No phone detected over USB. Copy $apkDest to the driver's phone and tap it to install (allow install from this source when prompted)."
  }
} else {
  Write-Step "BUILD FAILED - scroll up to find the Gradle error"
}

Write-Host ""
Write-Host "Done."
