<#
.SYNOPSIS
  The ONLY way to publish an Admin App phone update (EAS Update, preview AND production). Checks first.
.USAGE
  powershell -File scripts\publish-admin-ota.ps1 -Message "what changed"
#>
param([Parameter(Mandatory = $true)][string]$Message)
$ErrorActionPreference = "Stop"
$root = (git rev-parse --show-toplevel).Trim()
Set-Location $root
# the commit of the update that is live now = "[sha1234567]" in the newest update message of the production branch
$last = ""
try {
  Set-Location "$root\admin-panel"
  $json = (cmd /c "npx eas update:list --branch production --limit 1 --json --non-interactive 2>nul") | Out-String
  $m = [regex]::Match($json, "\[sha([0-9a-f]{7,40})\]"); if ($m.Success) { $last = $m.Groups[1].Value }
} catch {}
Set-Location $root
$guardArgs = @("scripts\publish-guard.js", "--app", "admin"); if ($last) { $guardArgs += @("--last-sha", $last) } else { Write-Host "note: the live Admin update has no recorded commit - ancestor check skipped this once." }
$out = (cmd /c ("node " + ($guardArgs -join " ") + " 2>&1")) | Out-String
Write-Host $out
if ($LASTEXITCODE -ne 0) { Write-Host "STOPPED - nothing was published." -ForegroundColor Red; exit 1 }
$sha = ([regex]::Match($out, "GITSHA=([0-9a-f]{40})")).Groups[1].Value
Set-Location "$root\admin-panel"
npx tsc --noEmit; if ($LASTEXITCODE -ne 0) { Write-Host "STOPPED - the Admin App does not type-check." -ForegroundColor Red; exit 1 }
foreach ($b in "preview", "production") {
  for ($i = 1; $i -le 4; $i++) {
    npx eas update --branch $b --message "$Message [sha$($sha.Substring(0,10))]" --non-interactive
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 20
  }
}
