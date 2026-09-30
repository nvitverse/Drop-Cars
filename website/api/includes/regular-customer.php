<?php
/**
 * Regular customer detection — loyal returning customers (same phone, all-time activity).
 */

if (!function_exists('dropcars_normalize_phone_digits')) {
    function dropcars_normalize_phone_digits(string $phone): string
    {
        $d = preg_replace('/\D/', '', $phone);
        if (strlen($d) > 10) {
            $d = substr($d, -10);
        }
        return $d;
    }
}

if (!function_exists('dropcars_count_phone_submissions_all_time')) {
    /**
     * Total enquiry + booking rows for this phone (all time).
     */
    function dropcars_count_phone_submissions_all_time(PDO $pdo, string $phone): int
    {
        $norm = dropcars_normalize_phone_digits($phone);
        if ($norm === '') {
            return 0;
        }
        $like = '%' . $norm;
        $n = 0;
        try {
            $q = $pdo->prepare('SELECT COUNT(*) FROM `enquiries` WHERE `phone` LIKE ?');
            $q->execute([$like]);
            $n += (int) $q->fetchColumn();
        } catch (Throwable $e) {
        }
        try {
            $q = $pdo->prepare('
                SELECT COUNT(*) FROM `bookings` b
                JOIN `customers` c ON c.id = b.customer_id
                WHERE c.`phone` LIKE ?
            ');
            $q->execute([$like]);
            $n += (int) $q->fetchColumn();
        } catch (Throwable $e) {
        }

        return $n;
    }
}

if (!function_exists('dropcars_is_regular_customer')) {
    /** True if 3+ total submissions (enquiries + bookings combined, all time). */
    function dropcars_is_regular_customer(PDO $pdo, string $phone): bool
    {
        return dropcars_count_phone_submissions_all_time($pdo, $phone) >= 3;
    }
}
