<#
.SYNOPSIS
  The ONLY way to deploy the backend to Cloud Run. Refuses to deploy anything that would drop work that is already live.

.WHY
  Cloud Run runs exactly one version. `gcloud run deploy --source .` from any folder replaces the live API with that folder's code.
  On 2026-10-02 a deploy from a stale, uncommitted copy wiped a day of fixes. This script makes that impossible:
    1. backend/ must be fully committed (what is deployed is what is in git, never a half-edited working tree)
    2. your branch must contain the commit that is live right now (label `git-sha` on the Cloud Run service)
    3. your branch must be pushed (so the next person starts from it)
  After a successful deploy the new commit is written to the service label, so the next deploy is checked against it.

.USAGE
  powershell -File scripts\deploy-backend.ps1             # deploy
  powershell -File scripts\deploy-backend.ps1 -DryRun     # only run the checks
  powershell -File scripts\deploy-backend.ps1 -SkipTests  # skip the pytest run (not recommended)
#>
param(
  [switch]$DryRun,
  [switch]$SkipTests,
  [string]$Project = "drop-cars2",
  [string]$Region = "asia-south2",
  [string]$Service = "drop-cars-api"
)
$ErrorActionPreference = "Stop"
function Fail($m) { Write-Host "`nSTOPPED: $m`n" -ForegroundColor Red; exit 1 }

$root = (git rev-parse --show-toplevel).Trim()
Set-Location $root
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
$sha = (git rev-parse HEAD).Trim()
$short = $sha.Substring(0, 10)
Write-Host "Branch $branch  commit $short"

# 1. nothing uncommitted in backend/
$dirty = git status --porcelain -- backend
if ($dirty) { Fail "backend/ has uncommitted changes. Commit them first (git add backend; git commit), so the deploy matches git.`n$dirty" }

# 2. the live commit must be an ancestor of HEAD
$live = (gcloud run services describe $Service --region $Region --project $Project --format="value(metadata.labels.git-sha)" 2>$null)
if ($live) { $live = $live.Trim() }
if ($live) {
  git cat-file -e "$live^{commit}" 2>$null
  if ($LASTEXITCODE -ne 0) {
    git fetch --all --quiet 2>$null
    git cat-file -e "$live^{commit}" 2>$null
    if ($LASTEXITCODE -ne 0) { Fail "The live version was built from commit $live, which this clone does not have. Run: git fetch --all" }
  }
  git merge-base --is-ancestor $live $sha
  if ($LASTEXITCODE -ne 0) {
    Fail "Your branch does NOT contain what is live (commit $live). Deploying would delete that work.`nMerge it first:  git merge $live   (then run the tests and try again)"
  }
  Write-Host "OK: live commit $live is inside your branch."
} else {
  Write-Host "No git-sha label on the service yet (first guarded deploy). Continuing." -ForegroundColor Yellow
}

# 3. pushed
git fetch origin --quiet 2>$null
$remote = (git branch -r --contains $sha 2>$null)
if (-not $remote) { Fail "Commit $short is not pushed. Run: git push origin $branch" }

# 4. tests
if (-not $SkipTests) {
  Write-Host "Running backend tests..."
  Push-Location backend
  $env:TEMP = "C:\gtmp"; $env:TMP = "C:\gtmp"
  python -m pytest -q tests -W ignore
  $code = $LASTEXITCODE
  Pop-Location
  if ($code -ne 0) { Fail "Backend tests failed. Fix them before deploying." }
}

if ($DryRun) { Write-Host "`nDry run finished: every check passed." -ForegroundColor Green; exit 0 }

# 5. deploy and remember the commit
Push-Location backend
$env:TEMP = "C:\gtmp"; $env:TMP = "C:\gtmp"
gcloud run deploy $Service --source . --region $Region --project $Project --min-instances=1 --quiet --update-labels "git-sha=$sha,git-branch=$($branch -replace '[^a-z0-9-]','-')"
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { Fail "gcloud deploy failed." }
Write-Host "`nDeployed commit $short. Add a line to AI_COLLABORATION_LOG.md saying what went live." -ForegroundColor Green
