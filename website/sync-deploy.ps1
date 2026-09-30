# Builds deploy/ as the upload package.
#
# Source of truth: project-root folders.
# Web-root upload: deploy/public_html/* -> Hostinger public_html/
# Private upload: deploy/database.local.php and/or deploy/secret.php -> Hostinger account root, next to public_html/
#
# Run after local changes:
#   .\sync-deploy.ps1

param(
    [switch]$Force,
    [switch]$SkipGuard
)

$ErrorActionPreference = "Stop"

$Source = $PSScriptRoot
$DeployRoot = Join-Path $Source "deploy"
$Target = Join-Path $DeployRoot "public_html"

# Windows PowerShell 5.1 `Set-Content -Encoding UTF8` writes UTF-8 *with* a BOM,
# which breaks Apache .htaccess parsing and corrupts PHP `include` output
# (the BOM bytes leak into Location: redirect headers as %EF%BB%BF).
# Use this helper to write plain UTF-8 (no BOM) for files the server reads.
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false
function Write-Utf8NoBom([string]$Path, [string]$Content) {
    [System.IO.File]::WriteAllText($Path, $Content, $script:Utf8NoBom)
}

if (!(Test-Path $Target)) {
    New-Item -ItemType Directory -Path $Target | Out-Null
    Write-Host "Created deployment target directory: $Target" -ForegroundColor Green
}

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

# Safety Check: Warn if the local preview target (public_html) has newer files than the project root (source)
$liveRoot = Join-Path $Source "public_html"
if (!$Force -and (Test-Path $liveRoot)) {
    Write-Host "Running safety checks on local preview '$liveRoot'..." -ForegroundColor Cyan
    $newerFiles = @()
    foreach ($d in $dirs) {
        $destDir = Join-Path $liveRoot $d
        if (Test-Path $destDir) {
            Get-ChildItem -Path $destDir -Recurse -File | ForEach-Object {
                $rel = $_.FullName.Substring($liveRoot.Length + 1)
                $srcFile = Join-Path $Source $rel
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
        Write-Host "ERROR: The following files in local preview '$liveRoot' are NEWER than project root:" -ForegroundColor Red
        foreach ($f in $newerFiles) {
            Write-Host " - $($f.Path) (Root: $($f.RootTime) | public_html: $($f.PubTime))" -ForegroundColor Yellow
        }
        Write-Host "`nDeploying now will package the OLDER root files and ignore your newer public_html/ changes!" -ForegroundColor Red
        Write-Host "Please copy these files back to project root first, or run: .\sync-deploy.ps1 -Force" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "1. Mirroring core project directories..." -ForegroundColor Cyan

foreach ($d in $dirs) {
    $srcDir = Join-Path $Source $d
    if (!(Test-Path $srcDir)) {
        continue
    }
    $destDir = Join-Path $Target $d
    if (!(Test-Path $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }

    # Sync directories from root source of truth (excluding build artifacts)
    $null = & robocopy $srcDir $destDir /MIR /E /XD node_modules .git .expo /NP /NJH /NJS /NFL /NDL /NC /NS /R:1 /W:1
    if ($LASTEXITCODE -ge 8) {
        throw "robocopy failed for $d -> $destDir (exit $LASTEXITCODE)"
    }
    Write-Host " - Synced directory: $d" -ForegroundColor Gray
}

Write-Host "`n2. Copying web-root files..." -ForegroundColor Cyan

$rootFiles = @(
    ".htaccess",
    "index.php",
    "router.php",
    "router-airporttaxi.php",
    "robots.txt",
    "sitemap.xml",
    "index.html",
    "dbcheck.php",
    "404.php",
    "favicon.ico",
    "maintenance.html"
)

foreach ($f in $rootFiles) {
    $srcFile = Join-Path $Source $f
    if (Test-Path $srcFile) {
        Copy-Item -Path $srcFile -Destination $Target -Force
        Write-Host " - Synced file: $f" -ForegroundColor Gray
    }
}

# Protected files (index.php, animations.js, stats-strip.css) are now copied directly from root in steps 1 and 2.

Write-Host "`n3. Stripping local-only credentials from deploy/public_html..." -ForegroundColor Cyan

$stripFromTarget = @(
    "config\db.local.php",
    "admin\config\database.local.php"
)

foreach ($rel in $stripFromTarget) {
    $p = Join-Path $Target $rel
    if (Test-Path -LiteralPath $p) {
        Remove-Item -LiteralPath $p -Force
        Write-Host " - Removed local secret: $rel" -ForegroundColor Yellow
    }
}

Write-Host "`n4. Normalizing deploy routes and DB paths..." -ForegroundColor Cyan

# Deploy is intended for the production web root:
#   /home/USERNAME/public_html/
# Keep install-path empty so clean URLs are /drop-cars/booknow, /admin, etc.
$deployInstallPath = Join-Path $Target "config\install-path.php"
$deployInstallPathContent = @'
<?php
/**
 * Deploy/production route base.
 *
 * Upload deploy/public_html/* directly into Hostinger public_html/.
 * Keep this empty for root-domain routes like:
 *   https://dropcars.in/drop-cars/booknow
 */
return '';
'@
Write-Utf8NoBom $deployInstallPath $deployInstallPathContent
Write-Host " - Set deploy config/install-path.php to production root routes" -ForegroundColor Gray

$deployHtaccess = Join-Path $Target ".htaccess"
if (Test-Path -LiteralPath $deployHtaccess) {
    $ht = Get-Content -Raw -Path $deployHtaccess
    if ($ht -match '(?m)^RewriteBase\s+') {
        $ht = $ht -replace '(?m)^RewriteBase\s+.*$', 'RewriteBase /'
    } else {
        $ht = $ht -replace '(?m)^RewriteEngine\s+On\s*$', "RewriteEngine On`r`nRewriteBase /"
    }
    if ($ht -match '(?m)^SetEnv\s+APP_ENV\s+') {
        $ht = $ht -replace '(?m)^SetEnv\s+APP_ENV\s+.*$', 'SetEnv APP_ENV production'
    } else {
        $ht = $ht -replace '(?m)^Options\s+-Indexes\s*$', "Options -Indexes`r`n`r`nSetEnv APP_ENV production"
    }
    Write-Utf8NoBom $deployHtaccess $ht
    Write-Host " - Set deploy .htaccess RewriteBase / and APP_ENV production" -ForegroundColor Gray
}

Write-Host "`n5. Preparing files that upload outside public_html..." -ForegroundColor Cyan

$outsideFiles = @(
    @{
        Name = "database.local.php"
        Template = "admin\config\database.example.php"
    },
    @{
        Name = "secret.php"
        Template = "secret.example.php"
    },
    @{
        Name = "hostinger-schema.sql"
        Template = "config\hostinger-schema.sql"
    }
)

foreach ($item in $outsideFiles) {
    $destFile = Join-Path $DeployRoot $item.Name
    $templateFile = Join-Path $Source $item.Template
    if (!(Test-Path -LiteralPath $destFile) -and (Test-Path -LiteralPath $templateFile)) {
        Copy-Item -Path $templateFile -Destination $destFile -Force
        Write-Host " - Created deploy\$($item.Name) from $($item.Template)" -ForegroundColor Gray
    } elseif (Test-Path -LiteralPath $destFile) {
        Write-Host " - Kept existing deploy\$($item.Name)" -ForegroundColor Gray
    }
}

Write-Host "`n6. Removing debug/temp files from deploy/public_html..." -ForegroundColor Cyan

$patterns = @("tmp_*.php", "debug_*.php", "test-*.php")
foreach ($pat in $patterns) {
    Get-ChildItem -Path $Target -File -Recurse -Filter $pat -ErrorAction SilentlyContinue | ForEach-Object {
        Remove-Item $_.FullName -Force
        Write-Host " - Removed leftover debug/temp file: $($_.Name)" -ForegroundColor Yellow
    }
}

Write-Host "`n7. Stripping test credentials and autofills from deploy/public_html..." -ForegroundColor Cyan

# 1. Strip from deploy/public_html/assets/js/ui-controls.js
$uiControlsPath = Join-Path $Target "assets\js\ui-controls.js"
if (Test-Path -LiteralPath $uiControlsPath) {
    $js = Get-Content -Raw -Path $uiControlsPath
    if ($js -match '(?s)/\* ===== TEMP TEST AUTO-FILL') {
        $js = $js -replace '(?s)/\* ===== TEMP TEST AUTO-FILL.*$', '// test auto-fill block removed for production'
        Write-Utf8NoBom $uiControlsPath $js
        Write-Host " - Stripped test auto-fill from assets\js\ui-controls.js" -ForegroundColor Yellow
    }
}

# 2. Strip from deploy/public_html/admin/pages/bookings-new.php
$bookingsNewPath = Join-Path $Target "admin\pages\bookings-new.php"
if (Test-Path -LiteralPath $bookingsNewPath) {
    $php = Get-Content -Raw -Path $bookingsNewPath
    if ($php -match '(?s)// Temporary autofill for faster admin QA testing') {
        $php = $php -replace '(?s)// Temporary autofill for faster admin QA testing\..*?(?=</script>)', "// QA autofill block removed for production`r`n"
        Write-Utf8NoBom $bookingsNewPath $php
        Write-Host " - Stripped test auto-fill from admin\pages\bookings-new.php" -ForegroundColor Yellow
    }
}

$uploadMap = @"
# Drop Cars Deploy Upload Order

Generated by sync-deploy.ps1.

## 1. Upload inside Hostinger public_html

Copy everything inside:

deploy/public_html/

to:

/home/USERNAME/public_html/

This includes:

- .htaccess
- index.php
- router.php
- robots.txt
- sitemap.xml
- admin/
- api/
- assets/
- components/
- config/
- core/
- data/
- engine/
- helpers/
- includes/
- pages/

## 2. Upload outside Hostinger public_html

Copy these from deploy/ to the Hostinger account root, next to public_html/:

- database.local.php
- secret.php if you use it for DB/secrets overrides

Target example:

/home/USERNAME/database.local.php
/home/USERNAME/secret.php

## 3. Do not upload as web files

- hostinger-schema.sql is for phpMyAdmin import only.
- README_UPLOAD_ORDER.md is your local checklist.

## Local Preview

Local server serves:

public_html/

Preview URL:

http://localhost:8001/

Use:

.\sync-public-html.ps1
.\dev-server.ps1

## Deploy Route And DB Rules

- deploy/public_html/config/install-path.php is forced to return an empty string.
- deploy/public_html/.htaccess is forced to `RewriteBase /` and `APP_ENV production`.
- DB credential override files stay outside public_html as deploy/database.local.php and deploy/secret.php.
"@

$uploadMapPath = Join-Path $DeployRoot "README_UPLOAD_ORDER.md"
Write-Utf8NoBom $uploadMapPath $uploadMap
Write-Host " - Wrote deploy\README_UPLOAD_ORDER.md" -ForegroundColor Gray

Write-Host "`n8. Pre-deploy safety guard: scanning deploy/ for leaked secrets/localhost/test markers..." -ForegroundColor Cyan

if ($SkipGuard) {
    Write-Host " - SKIPPED (-SkipGuard passed). deploy/ was NOT validated - only use this for a known, reviewed false positive." -ForegroundColor Yellow
} else {
    # Text-file extensions worth scanning. Binary assets (images/fonts) are
    # skipped - they can't leak text secrets and scanning them wastes time.
    $scanExtensions = @("*.php", "*.js", "*.css", "*.json", "*.htaccess", "*.html", "*.md")

    # Each entry: a human label + a regex checked against file content.
    # Kept intentionally broad (a few false positives you dismiss by eye
    # beats a real secret slipping through) - this is a safety net, not a
    # perfect scanner.
    $guardPatterns = @(
        @{ Label = "localhost URL/host reference"; Pattern = "localhost|127\.0\.0\.1" },
        @{ Label = "leftover diagnostic-endpoint token"; Pattern = "dc-diag-2024|dc-chain-2024" },
        @{ Label = "leftover QA/test auto-fill marker"; Pattern = "TEMP TEST AUTO-FILL|Temporary autofill|TEMP QA OVERRIDE" },
        @{ Label = "local-dev-only secret placeholder"; Pattern = "local-dev-only|localtestpw|localtest-secret" },
        @{ Label = "obvious placeholder credential"; Pattern = "password\s*=\s*['""](password123|changeme|admin123|test1234)['""]" },
        @{ Label = "display_errors left ON"; Pattern = "ini_set\(\s*['""]display_errors['""]\s*,\s*['""]?1['""]?\s*\)" }
    )

    $guardHits = @()
    foreach ($ext in $scanExtensions) {
        Get-ChildItem -Path $Target -Recurse -File -Filter $ext -ErrorAction SilentlyContinue | ForEach-Object {
            $file = $_
            $content = Get-Content -Raw -LiteralPath $file.FullName -ErrorAction SilentlyContinue
            if ($null -eq $content) { return }
            foreach ($check in $guardPatterns) {
                if ($content -match $check.Pattern) {
                    $rel = $file.FullName.Substring($Target.Length + 1)
                    $guardHits += [PSCustomObject]@{ File = $rel; Issue = $check.Label }
                }
            }
        }
    }
    # database.local.php / secret.php land outside public_html (deploy/ root) - scan those too.
    foreach ($item in $outsideFiles) {
        $destFile = Join-Path $DeployRoot $item.Name
        if (Test-Path -LiteralPath $destFile) {
            $content = Get-Content -Raw -LiteralPath $destFile -ErrorAction SilentlyContinue
            if ($null -ne $content) {
                foreach ($check in $guardPatterns) {
                    if ($content -match $check.Pattern) {
                        $guardHits += [PSCustomObject]@{ File = $item.Name; Issue = $check.Label }
                    }
                }
            }
        }
    }

    if ($guardHits.Count -gt 0) {
        Write-Host "`nDEPLOY BLOCKED - found $($guardHits.Count) potential issue(s) in deploy/:" -ForegroundColor Red
        $guardHits | Sort-Object File | ForEach-Object {
            Write-Host "  - $($_.File): $($_.Issue)" -ForegroundColor Red
        }
        Write-Host "`nFix these in the SOURCE files (not deploy/ directly - it gets overwritten next sync), then re-run .\sync-deploy.ps1." -ForegroundColor Yellow
        Write-Host "If a hit is a confirmed false positive, re-run with -SkipGuard to bypass this check for this run only." -ForegroundColor Yellow
        exit 1
    }
    Write-Host " - No leaked secrets/localhost/test markers found. deploy/ looks clean." -ForegroundColor Green
}

Write-Host "`nSync complete. deploy/ is ready for Hostinger." -ForegroundColor Green
Write-Host " - deploy/public_html/* -> upload inside Hostinger public_html/" -ForegroundColor Cyan
Write-Host " - deploy/database.local.php and deploy/secret.php -> upload outside public_html/" -ForegroundColor Cyan

# 9. Creating Hostinger-Ready Zip Files (Linux-Compatible Forward Slashes '/')
Write-Host "`n9. Generating Hostinger-ready zip archives..." -ForegroundColor Cyan

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function New-HostingerLinuxZip([string]$DirectoryToZip, [string]$OutputZipFile) {
    if (Test-Path $OutputZipFile) { Remove-Item $OutputZipFile -Force }
    $zipStream = [System.IO.Compression.ZipFile]::Open($OutputZipFile, [System.IO.Compression.ZipArchiveMode]::Create)

    # Unix permission bits go in the upper 16 bits of ExternalAttributes
    # (the Info-ZIP convention every Linux unzip/extractor reads). .NET's
    # ZipFile leaves this at 0 by default, which Hostinger's extractor turns
    # into unreadable files/dirs -> the whole site 403s even though the
    # content extracted "successfully". Learned this the hard way after a
    # deploy without these bits took the live site down.
    $fileMode = 0x81A4  # 0100644 octal: regular file, rw-r--r--
    $dirMode  = 0x41ED  # 040755  octal: directory,   rwxr-xr-x

    # Explicit directory entries (trailing slash) so extractors that read
    # per-entry directory permissions also get 755, not just the files.
    $dirs = Get-ChildItem -Path $DirectoryToZip -Recurse -Directory | Where-Object { $_.FullName -notmatch '\\node_modules\\|\\\.git\\|\\\.expo\\' }
    foreach ($dir in $dirs) {
        $entryName = $dir.FullName.Substring($DirectoryToZip.Length + 1).Replace("\", "/") + "/"
        $dirEntry = $zipStream.CreateEntry($entryName)
        $dirEntry.ExternalAttributes = $dirMode -shl 16
    }

    $files = Get-ChildItem -Path $DirectoryToZip -Recurse -File | Where-Object { $_.FullName -notmatch '\\node_modules\\|\\\.git\\|\\\.expo\\' }
    foreach ($file in $files) {
        $entryName = $file.FullName.Substring($DirectoryToZip.Length + 1).Replace("\", "/")
        $entry = [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zipStream, $file.FullName, $entryName, [System.IO.Compression.CompressionLevel]::Optimal)
        $entry.ExternalAttributes = $fileMode -shl 16
    }
    $zipStream.Dispose()
}

# A. public_html.zip (Clean Root Zip for Hostinger File Manager -> public_html/)
$pubHtmlZip = Join-Path $DeployRoot "public_html.zip"
New-HostingerLinuxZip -DirectoryToZip $Target -OutputZipFile $pubHtmlZip
$pubZipItem = Get-Item $pubHtmlZip
Write-Host " - Created deploy\public_html.zip ($([math]::Round($pubZipItem.Length/1MB, 2)) MB) [Linux-ready, extracts cleanly inside Hostinger public_html/]" -ForegroundColor Green

# B. outside_public_html.zip (For files outside public_html/)
$outsideZip = Join-Path $DeployRoot "outside_public_html.zip"
if (Test-Path $outsideZip) { Remove-Item $outsideZip -Force }
$outsideZipStream = [System.IO.Compression.ZipFile]::Open($outsideZip, [System.IO.Compression.ZipArchiveMode]::Create)
$outsideFilesToZip = Get-ChildItem -Path $DeployRoot -File | Where-Object { $_.Extension -ne ".zip" -and $_.Name -ne "README_UPLOAD_ORDER.md" }
foreach ($file in $outsideFilesToZip) {
    $outsideEntry = [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($outsideZipStream, $file.FullName, $file.Name, [System.IO.Compression.CompressionLevel]::Optimal)
    $outsideEntry.ExternalAttributes = 0x81A4 -shl 16  # rw-r--r--, same reasoning as New-HostingerLinuxZip above
}
$outsideZipStream.Dispose()
$outZipItem = Get-Item $outsideZip
Write-Host " - Created deploy\outside_public_html.zip ($([math]::Round($outZipItem.Length/1KB, 2)) KB) [Extract outside public_html/]" -ForegroundColor Green

# C. Root deploy.zip (Complete bundle)
$rootDeployZip = Join-Path $Source "deploy.zip"
New-HostingerLinuxZip -DirectoryToZip $DeployRoot -OutputZipFile $rootDeployZip
$rootZipItem = Get-Item $rootDeployZip
Write-Host " - Created root deploy.zip ($([math]::Round($rootZipItem.Length/1MB, 2)) MB) [Linux-ready]" -ForegroundColor Green

Write-Host "`nHostinger Upload Instructions:" -ForegroundColor Yellow
Write-Host " 1. Open Hostinger File Manager -> go inside public_html/" -ForegroundColor Yellow
Write-Host " 2. Upload and Extract 'deploy/public_html.zip' directly inside public_html/" -ForegroundColor Yellow
Write-Host " 3. Go to Hostinger root (/home/uXXXXXXXXX/) and upload 'deploy/outside_public_html.zip'" -ForegroundColor Yellow
