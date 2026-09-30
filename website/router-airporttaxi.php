<?php
/**
 * Local preview router for AirportTaxi.International — the genuinely
 * separate sister site, previewed on its own port (see dev-server-airporttaxi.ps1)
 * so it never shares a server process/URL with Drop Cars itself.
 *
 * There is no real DNS for airporttaxi.international in local dev, so this
 * spoofs the Host header to the production domain before handing off to the
 * normal router. Every existing host-based mechanism then just works
 * unmodified: dropcars_get_subdomain_theme_slug() resolves 'airporttaxi',
 * ThemeEngine::detectTheme() picks up that theme for every request, and
 * dropcars_is_native_airporttaxi_host() (includes/paths.php) returns true —
 * which is what puts the site in its native black/gold color scheme instead
 * of the blue used for the /airporttaxi page embedded under Drop Cars' own
 * domain (see engine/airporttaxi-home.php, assets/css/theme-airporttaxi.css).
 */

$_SERVER['HTTP_HOST'] = 'airporttaxi.international';

require __DIR__ . '/router.php';
