<#
.SYNOPSIS
  The ONLY way to publish a Vendor App phone update (OTA). Checks first, then publishes from a clean copy of the committed code.
.USAGE
  powershell -File scripts\publish-vendor-ota.ps1 -Message "what changed"
#>
param([Parameter(Mandatory = $true)][string]$Message)
$ErrorActionPreference = "Stop"
$root = (git rev-parse --show-toplevel).Trim()
Set-Location $root
$out = (cmd /c "node scripts\publish-guard.js --app vendor 2>&1") | Out-String
Write-Host $out
if ($LASTEXITCODE -ne 0) { Write-Host "STOPPED - nothing was published." -ForegroundColor Red; exit 1 }
$sha = ([regex]::Match($out, "GITSHA=([0-9a-f]{40})")).Groups[1].Value
if (-not $sha) { Write-Host "STOPPED - could not read the commit." -ForegroundColor Red; exit 1 }

Push-Location "$root\vendor-app"; npx tsc --noEmit; Pop-Location

$tmp = "C:\gtmp\vnd_ota\vendor-app"
$real = "C:\VBuild\node_modules"
if (Test-Path "$tmp\node_modules") { cmd /c rmdir "$tmp\node_modules" | Out-Null }
if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
New-Item -ItemType Directory -Force $tmp | Out-Null
$tarFile = "C:\gtmp\vnd_ota_src.tar"
git archive HEAD vendor-app scripts/ota_text_diff.py scripts/hbc_strings.py -o $tarFile
tar -xf $tarFile -C (Split-Path $tmp -Parent)
cmd /c mklink /J "$tmp\node_modules" "$real" | Out-Null
Set-Location $tmp
$env:OTA_MAX_WORKERS = "1"; $env:OTA_GUARD_SHA = $sha
node scripts/publish-ota.js --app vendor --message $Message
cmd /c rmdir "$tmp\node_modules" | Out-Null
