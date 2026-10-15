<#
.SYNOPSIS
  The ONLY way to publish a Driver App phone update (OTA). Checks first, then publishes from a clean copy of the committed code.
.WHY
  An OTA replaces the app on every phone. On 2026-10-06 and 2026-10-11 updates published from stale folders removed work that was live.
  scripts\publish-guard.js refuses unless the folder is committed, pushed, contains the commit that is live, and no registered fix is undone.
.USAGE
  powershell -File scripts\publish-driver-ota.ps1 -Message "what changed"
#>
param([Parameter(Mandatory = $true)][string]$Message)
$ErrorActionPreference = "Stop"
$root = (git rev-parse --show-toplevel).Trim()
Set-Location $root
$out = node scripts\publish-guard.js --app driver 2>&1 | Out-String
Write-Host $out
if ($LASTEXITCODE -ne 0) { Write-Host "STOPPED - nothing was published." -ForegroundColor Red; exit 1 }
$sha = ([regex]::Match($out, "GITSHA=([0-9a-f]{40})")).Groups[1].Value
if (-not $sha) { Write-Host "STOPPED - could not read the commit." -ForegroundColor Red; exit 1 }

# type-check the app (a bundle that does not compile would brick the update)
Push-Location "$root\driver-app"; npx tsc --noEmit 2>&1 | Select-String -NotMatch "OfflineBanner|help/|DocumentCoachModal" | Select-Object -First 5 | ForEach-Object { Write-Host $_ }; Pop-Location

# a clean copy of what is committed (never the working folder), node_modules linked to the real folder
$tmp = "C:\gtmp\drv_ota\driver-app"
$real = "C:\Users\Administrator\Desktop\dropcars-review\vendor\Driver-App\node_modules"
if (Test-Path "$tmp\node_modules") { cmd /c rmdir "$tmp\node_modules" | Out-Null }
if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
New-Item -ItemType Directory -Force $tmp | Out-Null
git archive HEAD driver-app scripts/ota_text_diff.py scripts/hbc_strings.py | tar -x -C (Split-Path $tmp -Parent)
cmd /c mklink /J "$tmp\node_modules" "$real" | Out-Null
Set-Location $tmp
$env:OTA_MAX_WORKERS = "1"; $env:OTA_GUARD_SHA = $sha
node scripts/publish-ota.js --app driver --message $Message
cmd /c rmdir "$tmp\node_modules" | Out-Null
