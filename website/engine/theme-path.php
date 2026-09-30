<?php
/**
 * Apache: resolve /{theme}/{segment} to city hub or route (matches router.php + theme-path-resolve).
 */
require_once __DIR__ . '/../includes/check-maintenance.php';
require_once __DIR__ . '/../includes/check-blocked-main.php';
require_once __DIR__ . '/../includes/paths.php';
require_once __DIR__ . '/../includes/theme-path-resolve.php';
require_once __DIR__ . '/theme-seo.php';

$themePart = isset($_GET['__theme']) ? (string) $_GET['__theme'] : '';
$secondPart = isset($_GET['__path']) ? (string) $_GET['__path'] : '';
$secondPart = trim(rawurldecode($secondPart), '/');

if (!preg_match('/^[a-zA-Z0-9-]+$/', $themePart)) {
    header('HTTP/1.0 404 Not Found');
    echo '<h1>404 Not Found</h1>';
    exit;
}

$sectionSegment = '';
$pathForResolve = $secondPart;
if (strpos($secondPart, '/') !== false) {
    $split = explode('/', $secondPart, 2);
    $pathForResolve = $split[0] ?? '';
    $sectionSegment = isset($split[1]) ? trim((string) $split[1], '/') : '';
    if ($sectionSegment !== '' && !preg_match('/^[a-zA-Z0-9-]+$/', $sectionSegment)) {
        header('HTTP/1.0 404 Not Found');
        echo '<h1>404 Not Found</h1>';
        exit;
    }
}

if (!preg_match('/^[a-zA-Z0-9-]+$/', $pathForResolve)) {
    header('HTTP/1.0 404 Not Found');
    echo '<h1>404 Not Found</h1>';
    exit;
}

$themesPath = __DIR__ . '/../data/themes.json';
$themesData = is_file($themesPath) ? json_decode(file_get_contents($themesPath), true) : [];
if (!is_array($themesData)) {
    $themesData = [];
}
$themes = [];
foreach ($themesData as $t) {
    if (isset($t['slug'])) {
        $themes[] = (string) $t['slug'];
    }
    if (isset($t['id'])) {
        $themes[] = (string) $t['id'];
    }
}
$themes = array_values(array_unique(array_merge($themes, ['intercity-drop-taxi', 'outstation-drop-taxi', 'city-to-city-cabs'])));

$citiesPath = __DIR__ . '/../data/cities.json';
$citiesData = is_file($citiesPath) ? json_decode(file_get_contents($citiesPath), true) : [];
$citySlugs = [];
if (is_array($citiesData)) {
    foreach ($citiesData as $c) {
        $citySlugs[] = (string) ($c['slug'] ?? '');
    }
}
$citySlugs = array_values(array_filter($citySlugs));

$resolved = dropcars_resolve_theme_second_segment($themePart, $pathForResolve, $themes, $citySlugs);
if ($resolved !== null) {
    if ($sectionSegment !== '') {
        if ($resolved['type'] === 'city' && dropcars_city_section_is_valid_slug($sectionSegment)) {
            $_GET['theme'] = $themePart;
            $_GET['city'] = $resolved['city'];
            $_GET['section'] = $sectionSegment;
            require __DIR__ . '/city.php';
            exit;
        }
        if ($resolved['type'] === 'route' && dropcars_route_section_is_valid_slug($sectionSegment)) {
            $_GET['theme'] = $themePart;
            $_GET['pickup'] = $resolved['pickup'];
            $_GET['drop'] = $resolved['drop'];
            $_GET['section'] = $sectionSegment;
            require __DIR__ . '/route.php';
            exit;
        }
        header('HTTP/1.0 404 Not Found');
        echo '<h1>404 Not Found</h1>';
        exit;
    }
    if ($resolved['type'] === 'city') {
        $_GET['theme'] = $themePart;
        $_GET['city'] = $resolved['city'];
        require __DIR__ . '/city.php';
        exit;
    }
    if ($resolved['type'] === 'route') {
        $_GET['theme'] = $themePart;
        $_GET['pickup'] = $resolved['pickup'];
        $_GET['drop'] = $resolved['drop'];
        require __DIR__ . '/route.php';
        exit;
    }
}

header('HTTP/1.0 404 Not Found');
echo '<h1>404 Not Found</h1>';
