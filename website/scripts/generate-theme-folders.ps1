param()

$themes = @{
    'drop-cars'            = 'dropcars'
    'drop-taxi'            = 'droptaxi'
    'one-way-taxi'         = 'onewaytaxi'
    'outstation-taxi'      = 'outstationtaxi'
    'intercity-taxi'       = 'intercitytaxi'
    'intercity-cabs'       = 'intercitycabs'
    'one-way-cab'          = 'onewaycab'
    'drop-taxi-service'    = 'droptaxiservice'
    'drop-car-service'     = 'dropcarservice'
    'one-drop-taxi'        = 'onedroptaxi'
    'one-drop-cab'         = 'onedropcab'
    'city-to-city-taxi'    = 'citytocitytaxi'
    'city-to-city-cabs'    = 'citytocitycabs'
    'intercity-drop-taxi'  = 'intercitydroptaxi'
    'outstation-cab'       = 'outstationcab'
    'outstation-cabs'      = 'outstationcabs'
    'outstation-drop-taxi' = 'outstationdroptaxi'
}

$projectRoot = Split-Path $PSScriptRoot -Parent
$base = Join-Path $projectRoot 'Theme - Website'
New-Item -ItemType Directory -Path $base -Force | Out-Null

$utf8NoBom = New-Object System.Text.UTF8Encoding $false

foreach ($slug in $themes.Keys) {
    $folder = $themes[$slug]
    $dir    = Join-Path $base $folder
    New-Item -ItemType Directory -Path $dir -Force | Out-Null

    # .htaccess
    $ht = "RewriteEngine On`r`nRewriteBase /`r`n`r`n# Route all clean URLs to local index.php`r`nRewriteCond %{REQUEST_FILENAME} !-f`r`nRewriteCond %{REQUEST_FILENAME} !-d`r`nRewriteRule ^(.*)$ index.php?__path=`$1 [QSA,L]`r`n"
    [System.IO.File]::WriteAllText("$dir\.htaccess", $ht, $utf8NoBom)

    # index.php
    $php = "<?php`r`n/**`r`n * Entry point for $slug theme subdomain website.`r`n * Subdomain: $folder.dropcars.in`r`n */`r`n`$_GET['theme'] = '$slug';`r`nrequire_once __DIR__ . '/../../index.php';`r`n"
    [System.IO.File]::WriteAllText("$dir\index.php", $php, $utf8NoBom)

    Write-Host " + Theme - Website/$folder/  (slug: $slug)" -ForegroundColor Green
}

Write-Host "`nDone. Created $($themes.Count) theme subdomain folders in 'Theme - Website/'." -ForegroundColor Cyan
