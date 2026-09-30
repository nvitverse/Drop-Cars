<?php
/**
 * Theme Engine for Drop Cars
 * Manages keyword themes and dynamic wording.
 */

class ThemeEngine {
    private $themes = [];
    private $activeTheme = null;

    /** @var string|null URL segment after theme, e.g. booknow */
    private $homeSectionSlug = null;

    public function __construct() {
        $themesPath = __DIR__ . '/../data/themes.json';
        if (file_exists($themesPath)) {
            $this->themes = json_decode(file_get_contents($themesPath), true);
        }
    }

    public function detectTheme() {
        $aliases = [
            'intercity-drop-taxi' => 'drop-taxi',
            'outstation-drop-taxi' => 'outstation-taxi',
            'city-to-city-cabs' => 'intercity-taxi',
        ];

        $themeFromQuery = trim((string) ($_GET['theme'] ?? ''));
        if ($themeFromQuery === '' && function_exists('dropcars_get_subdomain_theme_slug')) {
            $subTheme = dropcars_get_subdomain_theme_slug();
            if ($subTheme !== null) {
                $themeFromQuery = $subTheme;
            }
        }
        $this->homeSectionSlug = null;

        $resolve = static function (string $slug) use ($aliases): string {
            return $aliases[$slug] ?? $slug;
        };

        if ($themeFromQuery !== '') {
            $targetSlug = $resolve($themeFromQuery);
            foreach ($this->themes as $theme) {
                if ($targetSlug === ($theme['slug'] ?? '') || $targetSlug === ($theme['id'] ?? '')) {
                    $this->activeTheme = $theme;

                    return $theme;
                }
            }
        }

        $segments = function_exists('dropcars_request_path_segments')
            ? dropcars_request_path_segments()
            : [];
        if ($segments !== []) {
            $first = $resolve($segments[0] ?? '');
            $second = isset($segments[1]) ? trim((string) $segments[1]) : '';

            // If the first segment is a valid home section slug, we treat it as default theme (drop-cars)
            if ($second === '') {
                $themesList = [];
                foreach ($this->themes as $t) {
                    if (isset($t['slug'])) $themesList[] = $resolve($t['slug']);
                    if (isset($t['id']))   $themesList[] = $resolve($t['id']);
                }
                $themesList = array_unique($themesList);
                if (!in_array($first, $themesList, true)) {
                    if (function_exists('dropcars_home_section_is_valid_slug') && dropcars_home_section_is_valid_slug($first)) {
                        $this->homeSectionSlug = $first;
                        foreach ($this->themes as $theme) {
                            if (($theme['id'] ?? '') === 'drop-cars') {
                                $this->activeTheme = $theme;
                                return $theme;
                            }
                        }
                    }
                }
            }

            foreach ($this->themes as $theme) {
                $slug = $theme['slug'] ?? '';
                $id = $theme['id'] ?? '';
                if ($first === $slug || $first === $id) {
                    $this->activeTheme = $theme;
                    if ($second !== '' && function_exists('dropcars_home_section_is_valid_slug') && dropcars_home_section_is_valid_slug($second)) {
                        $this->homeSectionSlug = $second;
                    }

                    return $theme;
                }
            }
        }

        // Legacy: single path segment as theme slug (no / in path)
        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        $path = trim(parse_url($uri, PHP_URL_PATH) ?: '/', '/');
        $targetSlug = $resolve($path);

        foreach ($this->themes as $theme) {
            if ($targetSlug === ($theme['slug'] ?? '') || $targetSlug === ($theme['id'] ?? '')) {
                $this->activeTheme = $theme;

                return $theme;
            }
        }

        // Default homepage theme: Drop Cars
        foreach ($this->themes as $theme) {
            if (($theme['id'] ?? '') === 'drop-cars') {
                $this->activeTheme = $theme;

                return $theme;
            }
        }

        // Fallback to the first available theme
        if (!empty($this->themes)) {
            $this->activeTheme = $this->themes[0];

            return $this->activeTheme;
        }

        return null;
    }

    /**
     * Second path segment on keyword home URLs, e.g. /drop-taxi/booknow → booknow.
     */
    public function getHomeSectionSlug(): ?string
    {
        return $this->homeSectionSlug;
    }

    public function getActiveTheme() {
        return $this->activeTheme;
    }

    public function getAllThemes() {
        return $this->themes;
    }

    public function getWording($key, $default = '') {
        if ($this->activeTheme && isset($this->activeTheme[$key])) {
            return $this->activeTheme[$key];
        }
        return $default;
    }
}
