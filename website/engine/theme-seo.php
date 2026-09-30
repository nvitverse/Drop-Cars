<?php
/**
 * Theme-aware SEO copy: placeholders {{themeName}}, {{themeSlug}}, {{city}}, {{pickup}}, {{drop}}, {{distanceKm}}, {{fareEstimate}}
 */

function dropcars_theme_resolve(array $allThemes, ?string $themeSlug, ?array $fallbackTheme): ?array {
    $slug = trim((string) ($themeSlug ?? ''));
    if ($slug !== '') {
        foreach ($allThemes as $t) {
            if (($t['slug'] ?? '') === $slug || ($t['id'] ?? '') === $slug) {
                return $t;
            }
        }
    }
    return $fallbackTheme;
}

/**
 * @param array<string, string|int|float> $vars
 */
function dropcars_theme_expand(?array $theme, string $template, array $vars = []): string {
    $base = [
        'themeName' => $theme['name'] ?? 'Drop Cars',
        'brandName' => 'Drop Cars',
        'themeSlug' => $theme['slug'] ?? ($theme['id'] ?? 'drop-cars'),
        'seoFocusPhrase' => $theme['seoFocusPhrase'] ?? ($theme['name'] ?? 'intercity taxi'),
    ];
    $vars = array_merge($base, $vars);
    $out = $template;
    foreach ($vars as $k => $v) {
        $out = str_replace('{{' . $k . '}}', (string) $v, $out);
    }
    return $out;
}

function dropcars_theme_get(?array $theme, string $key, string $default = ''): string {
    if (!$theme || !isset($theme[$key]) || $theme[$key] === '') {
        return $default;
    }
    return (string) $theme[$key];
}

/** Merge per-theme SEO copy from data/theme-seo-by-theme.json */
/**
 * SEO-friendly home section path segments: /{theme}/booknow, /{theme}/cities, …
 *
 * @return array<string, string> slug => element id
 */
function dropcars_home_section_map(): array
{
    return [
        'booknow' => 'booking',
        'services' => 'home-services',
        'cities' => 'cities',
        'routes' => 'routes',
        'guides' => 'home-guides',
        'fleet' => 'services',
        'about' => 'about',
        'why-us' => 'features',
        'reviews' => 'reviews',
        'faq' => 'faq',
    ];
}

function dropcars_home_section_is_valid_slug(string $slug): bool
{
    return isset(dropcars_home_section_map()[$slug]);
}

function dropcars_home_section_element_id(string $slug): ?string
{
    $map = dropcars_home_section_map();

    return isset($map[$slug]) ? $map[$slug] : null;
}

/**
 * City hub: /{theme}/{city}/{slug} e.g. /drop-taxi/chennai/booknow
 *
 * @return array<string, string> slug => element id
 */
function dropcars_city_section_map(): array
{
    return [
        'booknow' => 'booking',
        'services' => 'city-services',
        'routes' => 'city-popular-routes',
        'fleet' => 'city-fleet',
        'guides' => 'city-guides',
        'faq' => 'faq',
    ];
}

function dropcars_city_section_is_valid_slug(string $slug): bool
{
    return isset(dropcars_city_section_map()[$slug]);
}

function dropcars_city_section_element_id(string $slug): ?string
{
    $map = dropcars_city_section_map();

    return $map[$slug] ?? null;
}

/**
 * Route page: /{theme}/{pickup-drop}/{slug} e.g. /drop-taxi/chennai-tiruvannamalai/faq
 *
 * @return array<string, string> slug => element id
 */
function dropcars_route_section_map(): array
{
    return [
        'booknow' => 'bookTaxi',
        'route-map' => 'route-map',
        'overview' => 'route-overview',
        'services' => 'route-services',
        'fleet' => 'route-fleet',
        'guides' => 'route-guides',
        'why-us' => 'route-why-us',
        'routes' => 'popular-routes',
        'reviews' => 'reviews',
        'faq' => 'faq',
    ];
}

function dropcars_route_section_is_valid_slug(string $slug): bool
{
    return isset(dropcars_route_section_map()[$slug]);
}

function dropcars_route_section_element_id(string $slug): ?string
{
    $map = dropcars_route_section_map();

    return $map[$slug] ?? null;
}

function dropcars_merge_theme_seo(?array $activeTheme): ?array {
    if (!$activeTheme || !is_array($activeTheme)) {
        return $activeTheme;
    }
    static $lib = null;
    if ($lib === null) {
        $path = __DIR__ . '/../data/theme-seo-by-theme.json';
        $lib = is_file($path) ? (json_decode(file_get_contents($path), true) ?: []) : [];
    }
    $id = $activeTheme['id'] ?? 'drop-cars';
    if (!empty($lib[$id]) && is_array($lib[$id])) {
        return array_merge($activeTheme, $lib[$id]);
    }
    return $activeTheme;
}
