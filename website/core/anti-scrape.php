<?php
/**
 * Anti-scraping: Behavior scoring. Silent blocking.
 */
defined('DROP_CARS_SAFE') || die('Direct access not permitted');

function dc_anti_scrape_check(string $storageDir, string $blockDir, int $maxRoutesPerMin = 15, int $blockMinutes = 30): bool {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    $ua = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 200);
    $routeKey = ($_GET['from'] ?? '') . '|' . ($_GET['to'] ?? '');

    $blockFile = rtrim($blockDir, '/') . '/b_' . md5($ip) . '.blk';
    if (is_file($blockFile)) {
        $until = (int) @file_get_contents($blockFile);
        if (time() < $until) return false;
        @unlink($blockFile);
    }

    if ($routeKey === '|') return true;

    $trackFile = rtrim($storageDir, '/') . '/t_' . md5($ip) . '.json';
    $now = time();
    $windowStart = floor($now / 60) * 60;

    $data = ['ts' => $windowStart, 'routes' => [], 'invalid' => 0, 'ua' => $ua];
    if (is_file($trackFile)) {
        $raw = @file_get_contents($trackFile);
        $decoded = $raw ? @json_decode($raw, true) : null;
        if (is_array($decoded) && isset($decoded['ts']) && $decoded['ts'] === $windowStart) {
            $data['routes'] = $decoded['routes'] ?? [];
            $data['invalid'] = (int) ($decoded['invalid'] ?? 0);
        }
    }

    $from = preg_replace('/[^a-z\-]/', '', strtolower($_GET['from'] ?? ''));
    $to = preg_replace('/[^a-z\-]/', '', strtolower($_GET['to'] ?? ''));
    $isInvalid = (strlen($from) < 2 || strlen($to) < 2 || $from === $to);
    if ($isInvalid) $data['invalid']++;

    $data['routes'][$routeKey] = ($data['routes'][$routeKey] ?? 0) + 1;
    $uniqueCount = count($data['routes']);
    $score = $uniqueCount * 2 + $data['invalid'] * 3;

    $suspiciousUA = preg_match('/^(curl|wget|python|scrapy|libwww|httpclient|java\/|go-http|bot|crawler)/i', $ua);

    if (!is_dir($storageDir)) @mkdir($storageDir, 0750, true);
    @file_put_contents($trackFile, json_encode($data), LOCK_EX);

    if ($score > 25 || $uniqueCount > $maxRoutesPerMin || ($suspiciousUA && $uniqueCount > 5)) {
        if (!is_dir($blockDir)) @mkdir($blockDir, 0750, true);
        @file_put_contents($blockFile, (string) ($now + $blockMinutes * 60), LOCK_EX);
        return false;
    }
    return true;
}
