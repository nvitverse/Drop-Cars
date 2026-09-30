# Mirrors the source root into public_html/ for local live preview.
#
# Source of truth: project-root folders (admin, api, assets, etc.).
# Local preview target: public_html/ served by Antigravity / dev-server.ps1.
#
# After source changes:
#   .\sync-public-html.ps1
#
# Preview:
#   http://localhost:8001/
#
# Use sync-deploy.ps1 for the upload package in deploy/.

param(
    [string]$Target = "public_html",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$dirs = @(
    "admin",
    "api",
    "assets",
    "blog",
    "components",
    "config",
    "core",
    "data",
    "engine",
    "helpers",
    "includes",
    "pages"
)

# Safety Check: Prevent overwriting newer files in public_html/ unless -Force is used
if (!$Force -and (Test-Path $Target)) {
    Write-Host "Running safety checks on target directory '$Target'..." -ForegroundColor Cyan
    $newerFiles = @()
    foreach ($d in $dirs) {
        $destDir = Join-Path $Target $d
        if (Test-Path $destDir) {
            Get-ChildItem -Path $destDir -Recurse -File | ForEach-Object {
                $rel = $_.FullName.Substring((Resolve-Path $Target).Path.Length + 1)
                $srcFile = Join-Path $PSScriptRoot $rel
                if (Test-Path $srcFile) {
                    $srcTime = (Get-Item $srcFile).LastWriteTime
                    $destTime = $_.LastWriteTime
                    # Allow 2 second time drift/buffer
                    if ($destTime -gt $srcTime.AddSeconds(2)) {
                        $newerFiles += [PSCustomObject]@{
                            Path = $rel
                            RootTime = $srcTime
                            PubTime = $destTime
                        }
                    }
                }
            }
        }
    }
    
    if ($newerFiles.Count -gt 0) {
        Write-Host "ERROR: The following files in '$Target' are NEWER than the project root files:" -ForegroundColor Red
        foreach ($f in $newerFiles) {
            Write-Host " - $($f.Path) (Root: $($f.RootTime) | public_html: $($f.PubTime))" -ForegroundColor Yellow
        }
        Write-Host "`nRunning sync will OVERWRITE and destroy these newer changes! Aborting." -ForegroundColor Red
        Write-Host "Please copy these files back to project root first, or run: .\sync-public-html.ps1 -Force" -ForegroundColor Yellow
        exit 1
    }
}

if (!(Test-Path $Target)) {
    New-Item -ItemType Directory -Path $Target | Out-Null
}

foreach ($d in $dirs) {
    if (!(Test-Path $d)) {
        continue
    }
    $dest = Join-Path $Target $d
    New-Item -ItemType Directory -Path $dest -Force | Out-Null
    # Sync directories from root source of truth
    $null = & robocopy $d $dest /MIR /E /NP /NJH /NJS /NFL /NDL /NC /NS /R:1 /W:1
    if ($LASTEXITCODE -ge 8) {
        throw "robocopy failed for $d -> $dest (exit $LASTEXITCODE)"
    }
}

$rootFiles = @(
    ".htaccess",
    "index.php",
    "router.php",
    "router-airporttaxi.php",
    "robots.txt",
    "sitemap.xml",
    "index.html",
    "dbcheck.php",
    "404.php"
)

foreach ($f in $rootFiles) {
    if (Test-Path $f) {
        Copy-Item -Path $f -Destination $Target -Force
    }
}

# Never ship local DB overrides inside the preview/upload web root.
# Localhost code can still read the source-root local DB override.
$stripFromTarget = @(
    "config\db.local.php",
    "admin\config\database.local.php"
)

foreach ($rel in $stripFromTarget) {
    $p = Join-Path $Target $rel
    if (Test-Path -LiteralPath $p) {
        Remove-Item -LiteralPath $p -Force
        Write-Host "Removed local-only: $rel" -ForegroundColor DarkYellow
    }
}

Write-Host "Synced source root to $Target for local live preview" -ForegroundColor Green
Write-Host "Preview URL: http://localhost:8001/" -ForegroundColor Cyan
