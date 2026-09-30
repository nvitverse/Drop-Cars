<?php
require_once dirname(__DIR__) . '/helpers/error-handler.php';
date_default_timezone_set('Asia/Kolkata');

/**
 * Optional URL prefix when the site is not at the domain root
 * (e.g. https://example.com/drop-cars/). See config/install-path.php
 */
if (!function_exists('dropcars_base_path')) {
    function dropcars_base_path(): string
    {
        static $cached = null;
        if ($cached !== null) {
            return $cached;
        }
        $env = getenv('DROP_CARS_BASE_PATH');
        if (is_string($env) && $env !== '') {
            $cached = '/' . trim($env, '/');
            return $cached;
        }
        $file = __DIR__ . '/../config/install-path.php';
        if (is_file($file)) {
            $seg = include $file;
            if (is_string($seg)) {
                // Strip UTF-8 BOM if the file/value was saved with one. A BOM here
                // would leak into Location: redirect headers as %EF%BB%BF.
                $seg = ltrim($seg, "\xef\xbb\xbf");
                $seg = trim($seg, "/ \t\n\r\0\x0B");
                if ($seg !== '') {
                    $cached = '/' . $seg;
                    return $cached;
                }
            }
        }
        $cached = '';
        return $cached;
    }
}

if (!function_exists('dropcars_main_origin')) {
    function dropcars_main_origin(): string
    {
        $hostWithPort = $_SERVER['HTTP_HOST'] ?? 'dropcars.in';
        $parts_host = explode(':', $hostWithPort);
        $host = $parts_host[0];
        $port = isset($parts_host[1]) ? ':' . $parts_host[1] : '';

        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || ((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
        $scheme = $https ? 'https' : 'http';

        if (preg_match('/^(localhost|127\.0\.0\.1|::1)$/i', $host)) {
            return $scheme . '://' . $host . $port;
        }
        if (substr(strtolower($host), -10) === '.localhost') {
            return $scheme . '://localhost' . $port;
        }

        $parts = explode('.', $host);
        $count = count($parts);
        if ($count > 2) {
            if (strtolower($parts[0]) !== 'www') {
                array_shift($parts);
                $host = implode('.', $parts);
            }
        }

        return $scheme . '://' . $host . $port;
    }
}

if (!function_exists('dropcars_url')) {
    function dropcars_url(string $path): string
    {
        $path = '/' . ltrim($path, '/');
        $b = dropcars_base_path();
        if ($b === '' || $b === '/') {
            return $path;
        }
        return rtrim($b, '/') . $path;
    }
}

/**
 * Path segments for the current request, with subdirectory base stripped (for theme / section routing).
 *
 * @return list<string>
 */
if (!function_exists('dropcars_request_path_segments')) {
    function dropcars_request_path_segments(): array
    {
        $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        $base = dropcars_base_path();
        if ($base !== '' && $base !== '/' && strpos($path, $base) === 0) {
            $path = substr($path, strlen(rtrim($base, '/')));
            if ($path === '' || $path === false) {
                $path = '/';
            }
        }
        $path = trim((string) $path, '/');
        if ($path === '') {
            return [];
        }

        return explode('/', $path);
    }
}

/**
 * Site origin for canonical / Open Graph (Google Ads: stable https apex on production).
 */
if (!function_exists('dropcars_public_origin')) {
    function dropcars_public_origin(): string
    {
        $host = $_SERVER['HTTP_HOST'] ?? 'dropcars.in';
        if (preg_match('/^(localhost|127\.0\.0\.1|::1)(:\d+)?$/i', $host)) {
            $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
                || ((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');

            return ($https ? 'https' : 'http') . '://' . $host;
        }

        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || ((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');

        return ($https ? 'https' : 'http') . '://' . $host;
    }
}

if (!function_exists('dropcars_get_cookie_domain')) {
    function dropcars_get_cookie_domain(): string
    {
        $host = $_SERVER['HTTP_HOST'] ?? '';
        $host = explode(':', $host)[0];
        
        if (filter_var($host, FILTER_VALIDATE_IP) || $host === 'localhost' || $host === '') {
            return '';
        }
        
        $parts = explode('.', $host);
        $count = count($parts);
        if ($count >= 2) {
            if ($parts[$count - 1] === 'localhost') {
                return '';
            }
            return '.' . $parts[$count - 2] . '.' . $parts[$count - 1];
        }
        
        return '';
    }
}

if (!function_exists('dropcars_get_subdomain_city_slug')) {
    function dropcars_get_subdomain_city_slug(): ?string
    {
        $host = $_SERVER['HTTP_HOST'] ?? '';
        $host = explode(':', $host)[0];

        if (filter_var($host, FILTER_VALIDATE_IP) || $host === 'localhost' || $host === '') {
            return null;
        }

        $parts = explode('.', $host);
        if (count($parts) >= 2) {
            $subdomain = strtolower($parts[0]);
            if (in_array($subdomain, ['www', 'admin', 'api', 'dev', 'staging', 'mail'], true)) {
                return null;
            }

            // Map subdomain aliases to primary city slugs
            $aliases = [
                'rameswaram'   => 'rameshwaram',
                'puducherry'   => 'pondicherry',
                'thirunelveli' => 'tirunelveli',
                'thiruppur'    => 'tiruppur',
                'kodaikkanal'  => 'kodaikanal',
                'nellai'       => 'tirunelveli',
                'thenkasi'     => 'tenkasi',
                'covai'        => 'coimbatore',
                'tuticorin'    => 'thoothukudi',
                'karaikkudi'   => 'karaikudi',
                'tirupathur'   => 'tirupattur',
            ];
            if (isset($aliases[$subdomain])) {
                $subdomain = $aliases[$subdomain];
            }

            static $citySlugs = null;
            if ($citySlugs === null) {
                $citySlugs = [];
                $citiesPath = __DIR__ . '/../data/cities.json';
                if (is_file($citiesPath)) {
                    $citiesData = json_decode(file_get_contents($citiesPath), true);
                    if (is_array($citiesData)) {
                        foreach ($citiesData as $c) {
                            if (isset($c['slug']) && $c['slug'] !== '') {
                                $citySlugs[] = (string)$c['slug'];
                            }
                        }
                    }
                }
            }

            if (in_array($subdomain, $citySlugs, true)) {
                return $subdomain;
            }
        }
        return null;
    }
}

if (!function_exists('dropcars_get_subdomain_theme_slug')) {
    function dropcars_get_subdomain_theme_slug(): ?string
    {
        $host = $_SERVER['HTTP_HOST'] ?? '';
        $host = explode(':', $host)[0];

        if (filter_var($host, FILTER_VALIDATE_IP) || $host === 'localhost' || $host === '') {
            return null;
        }

        $parts = explode('.', $host);
        if (count($parts) >= 2) {
            $subdomain = strtolower($parts[0]);
            if (in_array($subdomain, ['www', 'admin', 'api', 'dev', 'staging', 'mail'], true)) {
                return null;
            }

            $cleanSub = str_replace('-', '', $subdomain);

            $themeMap = [
                'dropcars'           => 'drop-cars',
                'droptaxi'           => 'drop-taxi',
                'droptaxiservice'    => 'drop-taxi-service',
                'onedroptaxi'        => 'one-drop-taxi',
                'onewaytaxi'         => 'one-way-taxi',
                'onewaycab'          => 'one-way-cab',
                'onedropcab'         => 'one-drop-cab',
                'outstationtaxi'     => 'outstation-taxi',
                'outstationcab'      => 'outstation-cab',
                'outstationcabs'     => 'outstation-cabs',
                'intercitytaxi'      => 'intercity-taxi',
                'citytocitytaxi'     => 'city-to-city-taxi',
                'intercitycabs'      => 'intercity-cabs',
                'intercitydroptaxi'  => 'drop-taxi',
                'outstationdroptaxi' => 'outstation-taxi',
                'citytocitycabs'     => 'intercity-taxi',
                'dropcarservice'     => 'drop-cars',
            ];

            if (isset($themeMap[$cleanSub])) {
                return $themeMap[$cleanSub];
            }

            static $themeSlugs = null;
            if ($themeSlugs === null) {
                $themeSlugs = [];
                $themesPath = __DIR__ . '/../data/themes.json';
                if (is_file($themesPath)) {
                    $themesData = json_decode(file_get_contents($themesPath), true);
                    if (is_array($themesData)) {
                        foreach ($themesData as $t) {
                            if (isset($t['slug'])) $themeSlugs[$t['slug']] = $t['slug'];
                            if (isset($t['id']))   $themeSlugs[$t['id']]   = $t['slug'] ?? $t['id'];
                        }
                    }
                }
            }
            if (isset($themeSlugs[$subdomain])) {
                return $themeSlugs[$subdomain];
            }
        }
        return null;
    }
}

/**
 * True only when this request is genuinely on the AirportTaxi.International
 * brand's own domain (production host, or a local preview server that spoofs
 * HTTP_HOST to simulate it) — i.e. resolved via real host/subdomain detection,
 * NOT via the /airporttaxi path or a ?theme=airporttaxi override under
 * dropcars.in. Pages use this to decide gold "native" branding vs Drop Cars'
 * own blue palette for the "airport taxi" page reached inside their own site.
 */
if (!function_exists('dropcars_is_native_airporttaxi_host')) {
    function dropcars_is_native_airporttaxi_host(): bool
    {
        return function_exists('dropcars_get_subdomain_theme_slug')
            && dropcars_get_subdomain_theme_slug() === 'airport-taxi';
    }
}

if (!function_exists('dropcars_redirect_to_subdomain_if_needed')) {
    function dropcars_redirect_to_subdomain_if_needed(string $targetCitySlug, ?string $section = null) {
        // Subdomain redirection is disabled to keep city and route page loads on the same domain.
        return;
    }
}

if (!function_exists('dropcars_canonical_request_url')) {
    function dropcars_canonical_request_url(): string
    {
        $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        if ($path === '') {
            $path = '/';
        }

        return rtrim(dropcars_public_origin(), '/') . $path;
    }
}

if (!function_exists('dropcars_theme_page_url')) {
    function dropcars_theme_page_url(string $themeSlug, string $pickup, ?string $drop = null): string
    {
        $subCity  = function_exists('dropcars_get_subdomain_city_slug') ? dropcars_get_subdomain_city_slug() : null;
        $subTheme = function_exists('dropcars_get_subdomain_theme_slug') ? dropcars_get_subdomain_theme_slug() : null;

        // On a city subdomain (e.g. chennai.dropcars.in):
        if ($subCity !== null) {
            if ($pickup === $subCity) {
                if ($drop !== null && $drop !== '') {
                    return dropcars_url($drop);
                }
                return dropcars_url('');
            }
            if ($drop !== null && $drop !== '') {
                return dropcars_url($pickup . '-' . $drop);
            }
            return dropcars_url($pickup);
        }

        // On a theme subdomain (e.g. droptaxi.dropcars.in):
        if ($subTheme !== null && $subTheme === $themeSlug) {
            if ($drop !== null && $drop !== '') {
                return dropcars_url($pickup . '-' . $drop);
            }
            return dropcars_url($pickup);
        }

        // Default main domain:
        if ($themeSlug === 'drop-cars' || $themeSlug === '') {
            if ($drop !== null && $drop !== '') {
                return dropcars_url($pickup . '-' . $drop);
            }
            return dropcars_url($pickup);
        }

        if ($drop !== null && $drop !== '') {
            return dropcars_url($themeSlug . '/' . $pickup . '-' . $drop);
        }

        return dropcars_url($themeSlug . '/' . $pickup);
    }
}

/**
 * Path segments that must never be treated as a dynamically-guessed city,
 * so a URL like /assets/xyz or /admin/xyz can't be swallowed by the
 * "any two words = a route page" fallback below.
 */
if (!function_exists('dropcars_reserved_path_segments')) {
    function dropcars_reserved_path_segments(): array
    {
        return [
            'admin', 'api', 'assets', 'blog', 'components', 'config', 'core',
            'data', 'engine', 'helpers', 'includes', 'pages', 'scratch', 'tmp',
            'vendor', 'deploy', 'backup-code', 'logs', 'docs',
            'booknow', 'cities', 'routes', 'guides', 'fleet', 'services',
            'about', 'why-us', 'reviews', 'faq', 'tariff', 'sitemap',
            'thank-you', 'track-booking', 'dashboard', 'customer-login',
            'developer', 'robots.txt', 'sitemap.xml', 'route-map', 'overview',
        ];
    }
}

/**
 * Multi-word Indian state/UT/country slugs - real places, but never a
 * bookable pickup/drop city on this platform. Only the multi-word ones are
 * listed: a single-word state name (goa, bihar, kerala...) can't trigger the
 * bug this guards against, since there's no hyphen for the route-guessing
 * fallbacks below to split on. A two-word one like "tamil-nadu" looks
 * exactly like a real "city-city" route slug once split at its hyphen, so
 * without this list a URL like /tamil-nadu silently rendered as a
 * "Tamil to Nadu Drop Cars" route page (synthesizing two fake half-word
 * "cities") and got indexed by Google with nonsense content.
 */
if (!function_exists('dropcars_indian_state_ut_slugs')) {
    function dropcars_indian_state_ut_slugs(): array
    {
        return [
            'andhra-pradesh', 'arunachal-pradesh', 'himachal-pradesh',
            'madhya-pradesh', 'uttar-pradesh', 'west-bengal', 'tamil-nadu',
            'jammu-kashmir', 'jammu-and-kashmir', 'andaman-nicobar',
            'andaman-and-nicobar', 'andaman-and-nicobar-islands',
            'dadra-nagar-haveli', 'dadra-and-nagar-haveli', 'daman-and-diu',
            'new-delhi',
        ];
    }
}

/**
 * True if $slug is shaped like a plausible city name (letters/numbers,
 * single hyphens, no reserved words) — used to let unrecognised-but-real
 * place names (not yet in cities.json) still generate a route/city page
 * on demand, via SEOCore::getCityBySlug()'s fallback synthesis.
 */
if (!function_exists('dropcars_looks_like_city_slug')) {
    function dropcars_looks_like_city_slug(string $slug): bool
    {
        if ($slug === '' || strlen($slug) > 40) {
            return false;
        }
        $lower = strtolower($slug);
        if (in_array($lower, dropcars_reserved_path_segments(), true)) {
            return false;
        }
        if (in_array($lower, dropcars_indian_state_ut_slugs(), true)) {
            return false;
        }
        return preg_match('/^[a-z0-9]+(-[a-z0-9]+){0,4}$/', strtolower($slug)) === 1;
    }
}

/**
 * True if $slug should be treated as a valid city for routing purposes:
 * either it's a known city in cities.json, or (when $allowDynamic is true)
 * it merely looks like a plausible city slug.
 */
if (!function_exists('dropcars_is_routable_city_slug')) {
    function dropcars_is_routable_city_slug(string $slug, array $knownCitySlugs, bool $allowDynamic = true): bool
    {
        if (in_array($slug, $knownCitySlugs, true)) {
            return true;
        }
        return $allowDynamic && dropcars_looks_like_city_slug($slug);
    }
}

/**
 * Render standard & theme-specific favicon link tags for all websites.
 */
if (!function_exists('dropcars_render_favicons')) {
    function dropcars_render_favicons(?string $themeSlug = null): void
    {
        if ($themeSlug === null || $themeSlug === '') {
            if (isset($_GET['theme']) && is_string($_GET['theme']) && $_GET['theme'] !== '') {
                $themeSlug = $_GET['theme'];
            } elseif (function_exists('dropcars_get_subdomain_theme_slug')) {
                $themeSlug = dropcars_get_subdomain_theme_slug();
            }
        }

        $themeSlug = is_string($themeSlug) ? rtrim(trim($themeSlug), '-') : '';
        // $themeSlug can come straight from ?theme= - reject anything that
        // isn't a plain slug so it can't be used for path traversal (e.g.
        // "../../something") when concatenated into $dirPath below.
        if ($themeSlug !== '' && !preg_match('/^[a-zA-Z0-9_-]+$/', $themeSlug)) {
            $themeSlug = '';
        }

        $aliases = [
            'intercity-drop-taxi'  => 'drop-taxi',
            'outstation-drop-taxi' => 'outstation-taxi',
            'city-to-city-cabs'    => 'intercity-taxi',
        ];
        if (isset($aliases[$themeSlug])) {
            $themeSlug = $aliases[$themeSlug];
        }

        if ($themeSlug === '' || $themeSlug === 'default') {
            $themeSlug = 'drop-cars';
        }

        $baseRel = 'assets/img/favicons/' . $themeSlug;
        $dirPath = dirname(__DIR__) . '/' . $baseRel;

        if (!is_dir($dirPath)) {
            $baseRel = 'assets/img';
        }

        $f32   = dropcars_url($baseRel . '/favicon-32x32.png');
        $f192  = dropcars_url($baseRel . '/favicon-192x192.png');
        $apple = dropcars_url($baseRel . '/apple-touch-icon.png');
        $ico   = dropcars_url($baseRel . '/favicon.ico');

        echo '    <!-- Favicons -->' . "\n";
        echo '    <link rel="icon" type="image/png" sizes="32x32" href="' . htmlspecialchars($f32, ENT_QUOTES, 'UTF-8') . '" />' . "\n";
        echo '    <link rel="icon" type="image/png" sizes="192x192" href="' . htmlspecialchars($f192, ENT_QUOTES, 'UTF-8') . '" />' . "\n";
        echo '    <link rel="apple-touch-icon" sizes="180x180" href="' . htmlspecialchars($apple, ENT_QUOTES, 'UTF-8') . '" />' . "\n";
        echo '    <link rel="shortcut icon" href="' . htmlspecialchars($ico, ENT_QUOTES, 'UTF-8') . '" />' . "\n";
    }
}

/**
 * Typo-tolerance for city/route URL slugs: given a slug that is NOT an
 * exact match in $knownSlugs, find the closest known slug within a small
 * edit distance so a misspelled URL (e.g. /kotkupm-to-chennai) can
 * 301-redirect to the real page (/kottakuppam-to-chennai) instead of either
 * hard-404ing or - worse - silently rendering a fake, thin synthesized page
 * for the misspelled name via SEOCore::getCityBySlug()'s dynamic fallback.
 *
 * Deliberately conservative: requires the first character to match (typo
 * corrections essentially never change the first letter of a place name)
 * and caps allowed edit distance relative to word length, so genuinely
 * novel-but-real place names that merely aren't in cities.json yet don't
 * get force-redirected to an unrelated city. Returns null when no
 * confident match exists - callers should fall through to their existing
 * behavior in that case.
 */
if (!function_exists('dropcars_find_closest_slug')) {
    function dropcars_find_closest_slug(string $slug, array $knownSlugs, float $maxDistanceRatio = 0.34): ?string
    {
        $slug = strtolower(trim($slug));
        if ($slug === '' || empty($knownSlugs)) {
            return null;
        }
        if (in_array($slug, $knownSlugs, true)) {
            return $slug;
        }

        $best = null;
        $bestDist = PHP_INT_MAX;
        $slugLen = strlen($slug);
        $firstChar = $slug[0];

        foreach ($knownSlugs as $candidate) {
            $candidate = strtolower((string) $candidate);
            if ($candidate === '' || $candidate[0] !== $firstChar) {
                continue;
            }
            $candidateLen = strlen($candidate);
            if (abs($candidateLen - $slugLen) > 4) {
                continue; // cheap guard before levenshtein() over 1000+ candidates
            }
            $dist = levenshtein($slug, $candidate);
            $maxAllowed = max(1, (int) round(max($slugLen, $candidateLen) * $maxDistanceRatio));
            if ($dist <= $maxAllowed && $dist < $bestDist) {
                $bestDist = $dist;
                $best = $candidate;
            }
        }

        return $best;
    }
}

/**
 * Calculate estimated highway travel duration for intercity route signboard.
 */
if (!function_exists('dropcars_calculate_highway_timing')) {
    function dropcars_calculate_highway_timing($distKm): string
    {
        $dist = (float) $distKm;
        if ($dist <= 0) {
            return 'N/A';
        }
        $totalMinutes = (int) round(($dist / 52.0) * 60) + 10;
        $hours = (int) floor($totalMinutes / 60);
        $mins = (int) round(($totalMinutes % 60) / 5) * 5;
        if ($mins === 60) {
            $hours += 1;
            $mins = 0;
        }
        if ($hours === 0) {
            return $mins . ' mins';
        }
        if ($mins === 0) {
            return $hours . ' hrs';
        }
        return $hours . ' hrs ' . $mins . ' mins';
    }
}


