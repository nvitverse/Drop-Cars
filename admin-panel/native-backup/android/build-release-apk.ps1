$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot"
$env:ANDROID_HOME = "C:\Users\Administrator\AppData\Local\Android\Sdk"
$env:PATH = "$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:PATH"
New-Item -ItemType Directory -Force C:\jtmp | Out-Null
$env:TEMP = "C:\jtmp"
$env:TMP = "C:\jtmp"
$env:JAVA_TOOL_OPTIONS = "-Djava.io.tmpdir=C:\jtmp"
Set-Location "C:\Users\Administrator\Desktop\dropcars-review\admin\android"
.\gradlew.bat assembleRelease --no-daemon

$apkCandidates = @(
    "C:\b\app\outputs\apk\release\app-release.apk",
    "C:\Users\Administrator\Desktop\dropcars-review\admin\android\app\build\outputs\apk\release\app-release.apk"
)

foreach ($apk in $apkCandidates) {
    if (Test-Path $apk) {
        Copy-Item -Path $apk -Destination "C:\Users\Administrator\Desktop\DropCarsAdmin-release.apk" -Force
        Write-Host "SUCCESS: APK copied to C:\Users\Administrator\Desktop\DropCarsAdmin-release.apk"
        break
    }
}
