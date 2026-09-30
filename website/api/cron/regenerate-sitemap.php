<?php
/**
 * Daily sitemap.xml regeneration for Drop Cars.
 *
 * sitemap.xml was previously a one-off static export that never tracked
 * new cities/routes - see engine/generate-sitemap.php for the actual
 * generation logic (walks data/cities.json + data/routes.json, the same
 * data the live city/route pages themselves render from). This cron
 * wrapper just re-runs that generator daily so the sitemap Google crawls
 * stays in sync automatically, without needing anyone to remember to run
 * it by hand after adding a city or route.
 *
 * Hostinger cron (hPanel → Advanced → Cron Jobs):
 *   Run PHP CLI on this file once per day (e.g. 3 AM IST, low-traffic time).
 *   Example schedule expression often shown as: 0 3 * * *
 *   Command (adjust path to your account):
 *   /usr/bin/php /home/USERNAME/domains/YOURDOMAIN/public_html/api/cron/regenerate-sitemap.php
 *
 * Or if document root is project root:
 *   /usr/bin/php /home/USERNAME/path/to/Drop Cars - Website/api/cron/regenerate-sitemap.php
 */

declare(strict_types=1);

$root = dirname(__DIR__, 2);
$generator = $root . '/engine/generate-sitemap.php';

if (!is_file($generator)) {
    fwrite(STDERR, "Missing engine/generate-sitemap.php.\n");
    exit(1);
}

require $generator;
