<?php
/**
 * Route Engine - Drop Cars
 * SECURE: DB + file cache. Cache fallback on DB fail. Auto-cleanup.
 */
defined('DROP_CARS_SAFE') || die('Direct access not permitted');

require_once __DIR__ . '/functions.php';

class RouteEngine {
    private $pdo;
    private $cacheDir;
    private $cacheTtl;
    private static $memoryCache = [];

    public function __construct(PDO $pdo, string $cacheDir = '', int $cacheTtl = 300) {
        $this->pdo = $pdo;
        $this->cacheDir = $cacheDir ?: (dirname(__DIR__) . '/tmp/cache');
        $this->cacheTtl = $cacheTtl;
    }

    public static function sanitizeInput(string $input): string {
        $s = strtolower(trim($input));
        $s = preg_replace('/\s+/', '-', $s);
        $s = preg_replace('/[^a-z0-9\-]/', '', $s);
        $s = preg_replace('/-+/', '-', $s);
        return trim($s, '-');
    }

    private function cacheKey(string $prefix, string $key): string {
        return $this->cacheDir . '/r_' . md5($prefix . $key) . '.cache';
    }

    private function cacheCleanup(): void {
        static $cleaned = false;
        if ($cleaned || !is_dir($this->cacheDir)) return;
        $cutoff = time() - $this->cacheTtl;
        $files = @glob($this->cacheDir . '/r_*.cache');
        if (is_array($files)) {
            foreach ($files as $f) {
                if (is_file($f) && filemtime($f) < $cutoff) @unlink($f);
            }
        }
        $cleaned = true;
    }

    private function cacheGet(string $prefix, string $key): ?array {
        $memKey = $prefix . '|' . $key;
        if (isset(self::$memoryCache[$memKey])) return self::$memoryCache[$memKey];

        $file = $this->cacheKey($prefix, $key);
        if (!is_file($file) || (time() - filemtime($file)) > $this->cacheTtl) {
            return null;
        }
        $raw = @file_get_contents($file);
        $data = $raw ? @json_decode($raw, true) : null;
        if (is_array($data)) self::$memoryCache[$memKey] = $data;
        return $data;
    }

    private function cacheSet(string $prefix, string $key, array $data): void {
        if (!is_dir($this->cacheDir)) @mkdir($this->cacheDir, 0750, true);
        $file = $this->cacheKey($prefix, $key);
        @file_put_contents($file, json_encode($data), LOCK_EX);
        self::$memoryCache[$prefix . '|' . $key] = $data;
    }

    public function getRoute(string $fromSlug, string $toSlug): ?array {
        $from = self::sanitizeInput($fromSlug);
        $to = self::sanitizeInput($toSlug);

        if (strlen($from) < 2 || strlen($to) < 2 || $from === $to) return null;

        $ck = $from . '|' . $to;
        $cached = $this->cacheGet('route', $ck);
        if ($cached !== null) return $cached;

        try {
            $stmt = $this->pdo->prepare("
                SELECT r.id, r.from_city, r.to_city, r.from_slug, r.to_slug,
                       r.distance_km, r.travel_time, r.highway, r.status
                FROM routes r
                WHERE r.from_slug = :from AND r.to_slug = :to AND r.status = 'active'
                LIMIT 1
            ");
            $stmt->execute(['from' => $from, 'to' => $to]);
            $row = $stmt->fetch();
        } catch (Throwable $e) {
            $file = $this->cacheKey('route', $ck);
            if (is_file($file)) {
                $raw = @file_get_contents($file);
                $fallback = $raw ? @json_decode($raw, true) : null;
                if (is_array($fallback)) return $fallback;
            }
            return null;
        }

        if ($row) {
            $this->cacheSet('route', $ck, $row);
            return $row;
        }

        $fuzzy = $this->fuzzyMatch($from, $to);
        if ($fuzzy) $this->cacheSet('route', $ck, $fuzzy);
        return $fuzzy;
    }

    private function fuzzyMatch(string $from, string $to): ?array {
        $noHyphenFrom = str_replace('-', '', $from);
        $noHyphenTo = str_replace('-', '', $to);
        if ($noHyphenFrom === $from && $noHyphenTo === $to) return null;

        try {
            $stmt = $this->pdo->prepare("
                SELECT id, from_city, to_city, from_slug, to_slug,
                       distance_km, travel_time, highway, status
                FROM routes
                WHERE from_slug = :from AND to_slug = :to AND status = 'active'
                LIMIT 1
            ");
            $stmt->execute(['from' => $noHyphenFrom, 'to' => $noHyphenTo]);
            return $stmt->fetch() ?: null;
        } catch (Throwable $e) {
            return null;
        }
    }

    public function getRelatedRoutes(string $fromSlug, string $excludeToSlug, int $limit = 5): array {
        $from = self::sanitizeInput($fromSlug);
        $exclude = self::sanitizeInput($excludeToSlug);
        if (strlen($from) < 2) return [];

        try {
            $stmt = $this->pdo->prepare("
                SELECT id, from_city, to_city, from_slug, to_slug, distance_km, travel_time
                FROM routes
                WHERE from_slug = :from AND to_slug != :exclude AND status = 'active'
                ORDER BY distance_km ASC
                LIMIT :limit
            ");
            $stmt->bindValue(':from', $from, PDO::PARAM_STR);
            $stmt->bindValue(':exclude', $exclude, PDO::PARAM_STR);
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->execute();
            return $stmt->fetchAll();
        } catch (Throwable $e) {
            return [];
        }
    }

    public function getReverseRoute(string $fromSlug, string $toSlug): ?array {
        return $this->getRoute($toSlug, $fromSlug);
    }

    public function getRoutesForCity(string $citySlug, string $direction = 'from', int $limit = 50): array {
        $slug = self::sanitizeInput($citySlug);
        if (strlen($slug) < 2) return [];

        $col = $direction === 'to' ? 'to_slug' : 'from_slug';
        try {
            $stmt = $this->pdo->prepare("
                SELECT id, from_city, to_city, from_slug, to_slug,
                       distance_km, travel_time, highway
                FROM routes
                WHERE {$col} = :slug AND status = 'active'
                ORDER BY distance_km ASC
                LIMIT :limit
            ");
            $stmt->bindValue(':slug', $slug, PDO::PARAM_STR);
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->execute();
            return $stmt->fetchAll();
        } catch (Throwable $e) {
            return [];
        }
    }

    public function getPopularRoutes(int $limit = 20): array {
        $ck = 'popular_' . $limit;
        $cached = $this->cacheGet('popular', $ck);
        if ($cached !== null && is_array($cached)) return $cached;

        try {
            $stmt = $this->pdo->prepare("
                SELECT id, from_city, to_city, from_slug, to_slug,
                       distance_km, travel_time, highway
                FROM routes
                WHERE status = 'active' AND is_primary = 1
                ORDER BY sort_order ASC, distance_km ASC
                LIMIT :limit
            ");
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->execute();
            $rows = $stmt->fetchAll();
        } catch (Throwable $e) {
            return $cached ?? [];
        }

        $this->cacheSet('popular', $ck, $rows);
        $this->cacheCleanup();
        return $rows;
    }

    public function getCities(): array {
        try {
            $stmt = $this->pdo->query("
                SELECT DISTINCT from_slug AS slug, from_city AS city FROM routes WHERE status = 'active'
                UNION
                SELECT DISTINCT to_slug AS slug, to_city AS city FROM routes WHERE status = 'active'
                ORDER BY city
            ");
            return $stmt->fetchAll();
        } catch (Throwable $e) {
            return [];
        }
    }

    public static function buildSlug(string $from, string $to): string {
        return dc_sanitize_slug($from) . '-to-' . dc_sanitize_slug($to);
    }
}
