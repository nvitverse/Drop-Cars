<?php
/**
 * Optional runtime permission check - Hostinger compatible.
 * Recommend: config/core/routes/logs=750, files=640, public_html=755
 */
defined('DROP_CARS_SAFE') || die('Direct access not permitted');

function dc_perms_check(string $baseDir): bool {
    $warn = [];
    $dirs = ['config', 'core', 'routes', 'logs'];
    foreach ($dirs as $d) {
        $path = $baseDir . '/' . $d;
        if (is_dir($path)) {
            $perms = fileperms($path) & 0777;
            if ($perms > 0750) $warn[] = $d . '=' . decoct($perms);
        }
    }
    if (!empty($warn) && is_dir($baseDir . '/logs')) {
        $line = date('Y-m-d H:i:s') . ' | perms_warn | ' . implode(',', $warn) . "\n";
        @file_put_contents($baseDir . '/logs/dc_' . date('Y-m-d') . '.log', $line, FILE_APPEND | LOCK_EX);
    }
    return empty($warn);
}
