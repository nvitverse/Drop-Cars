<?php
/**
 * Resolve /{theme}/{secondSegment} to a city hub or a pickup-drop route (same rules as router.php).
 *
 * @param list<string> $themes
 * @param list<string> $citySlugs
 * @return array{type: 'city', city: string}|array{type: 'route', pickup: string, drop: string}|null
 */
/**
 * Find closest matching city slug for misspelled user queries/URLs (e.g. "kotkupm" -> "kottakuppam").
 */
function dropcars_find_closest_city_slug(string $slug, array $citySlugs): ?string
{
    $clean = strtolower(trim($slug));
    if ($clean === '') return null;
    if (in_array($clean, $citySlugs, true)) return $clean;

    $normQ = preg_replace('/[aeiou\-\_]/', '', $clean);
    $normQ = preg_replace('/([a-z])\1+/', '$1', $normQ);

    $bestSlug = null;
    $bestDist = 999;

    foreach ($citySlugs as $candidate) {
        $candClean = strtolower($candidate);
        if ($candClean === $clean) return $candidate;

        $normCand = preg_replace('/[aeiou\-\_]/', '', $candClean);
        $normCand = preg_replace('/([a-z])\1+/', '$1', $normCand);

        if ($normQ !== '' && $normQ === $normCand) {
            return $candidate;
        }

        $dist = levenshtein($clean, $candClean);
        if ($dist <= 2 && $dist < $bestDist) {
            $bestDist = $dist;
            $bestSlug = $candidate;
        }
    }
    return $bestSlug;
}

function dropcars_resolve_theme_second_segment(string $themePart, string $secondPart, array $themes, array $citySlugs): ?array
{
    $secondPart = trim($secondPart, '/');
    if ($secondPart === '' || !in_array($themePart, $themes, true)) {
        return null;
    }
    if (in_array($secondPart, $citySlugs, true)) {
        return ['type' => 'city', 'city' => $secondPart];
    }
    // A state/UT name (e.g. "tamil-nadu") must never reach the hyphen-split
    // fallbacks below - step 3 in particular splits at the last hyphen
    // completely unvalidated, so without this guard /{theme}/tamil-nadu
    // silently became a "Tamil to Nadu" route page (see
    // dropcars_indian_state_ut_slugs() in includes/paths.php for the same
    // bug on the theme-less /tamil-nadu URL).
    if (function_exists('dropcars_indian_state_ut_slugs') && in_array(strtolower($secondPart), dropcars_indian_state_ut_slugs(), true)) {
        return null;
    }

    // 1. Check for explicit '-to-' separator (used for custom/non-predefined routes)
    if (strpos($secondPart, '-to-') !== false) {
        $parts = explode('-to-', $secondPart, 2);
        $pickup = dropcars_find_closest_city_slug($parts[0], $citySlugs) ?? $parts[0];
        $drop = dropcars_find_closest_city_slug($parts[1], $citySlugs) ?? $parts[1];
        return ['type' => 'route', 'pickup' => $pickup, 'drop' => $drop];
    }

    // 2. Predefined routes might not have '-to-', e.g. /drop-cars/chennai-bangalore.
    // Try to split at hyphens where both segments are valid city slugs from cities.json.
    $parts = explode('-', $secondPart);
    $numParts = count($parts);
    if ($numParts >= 2) {
        // Try to split at hyphens where both segments are valid city slugs from cities.json.
        for ($i = 1; $i < $numParts; $i++) {
            $pickup = implode('-', array_slice($parts, 0, $i));
            $drop = implode('-', array_slice($parts, $i));
            if (in_array($pickup, $citySlugs, true) && in_array($drop, $citySlugs, true)) {
                return ['type' => 'route', 'pickup' => $pickup, 'drop' => $drop];
            }
        }

        // Smart fallback: split where at least one segment is a valid city slug from cities.json.
        // Check from left to right (preferring matching the first segment as a valid city).
        for ($i = 1; $i < $numParts; $i++) {
            $pickup = implode('-', array_slice($parts, 0, $i));
            $drop = implode('-', array_slice($parts, $i));
            if (in_array($pickup, $citySlugs, true)) {
                return ['type' => 'route', 'pickup' => $pickup, 'drop' => $drop];
            }
        }
        // Check from right to left (preferring matching the last segment as a valid city).
        for ($i = $numParts - 1; $i >= 1; $i--) {
            $pickup = implode('-', array_slice($parts, 0, $i));
            $drop = implode('-', array_slice($parts, $i));
            if (in_array($drop, $citySlugs, true)) {
                return ['type' => 'route', 'pickup' => $pickup, 'drop' => $drop];
            }
        }
    }

    // Check fuzzy single city slug match (e.g. /drop-cars/kotkupm -> /drop-cars/kottakuppam)
    $fuzzyCity = dropcars_find_closest_city_slug($secondPart, $citySlugs);
    if ($fuzzyCity !== null) {
        return ['type' => 'city', 'city' => $fuzzyCity];
    }

    // 3. Fallback: split at the last hyphen (greedy matching of the first segment).
    $lastHyphenPos = strrpos($secondPart, '-');
    if ($lastHyphenPos !== false) {
        $pickup = substr($secondPart, 0, $lastHyphenPos);
        $drop = substr($secondPart, $lastHyphenPos + 1);
        return ['type' => 'route', 'pickup' => $pickup, 'drop' => $drop];
    }

    return null;
}
