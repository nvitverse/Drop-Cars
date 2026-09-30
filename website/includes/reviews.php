<?php
/**
 * Fetch reviews for display (used by index.php and other pages)
 * @param int $limit Max reviews to return (0 = no limit, default 6 for homepage)
 */
function dropcars_get_reviews($limit = 6) {
    require_once __DIR__ . '/../admin/config/database.php';
    $pdo = $GLOBALS['db'];
    if (!$pdo instanceof PDO) {
        return dropcars_get_reviews_fallback_defaults($limit);
    }

    $defaults = dropcars_get_reviews_fallback_defaults(0);

    try {
        $limitSql = $limit > 0 ? "LIMIT " . (int)$limit : "LIMIT 50";
        $stmt = $pdo->query("SELECT id, customer_name, rating, comment, trip_route, is_verified, created_at FROM reviews WHERE is_approved = 1 ORDER BY created_at DESC {$limitSql}");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        
        // Merge with defaults if we have fewer than expected real reviews to keep the UI full
        $result = $rows;
        if (count($result) < 3) {
            $needed = 6 - count($result);
            $padded = array_slice($defaults, 0, $needed);
            $result = array_merge($result, $padded);
        }
        
        if ($limit > 0) {
            $result = array_slice($result, 0, $limit);
        }
        
        return $result;
    } catch (Throwable $e) {
        return dropcars_get_reviews_fallback_defaults($limit);
    }
}

/**
 * @param int $limit
 * @return list<array<string, mixed>>
 */
function dropcars_get_reviews_fallback_defaults($limit) {
    $defaults = [
        ['customer_name' => 'Rajesh Kumar', 'rating' => 5, 'comment' => 'Excellent one-way drop taxi! The driver was professional and the Sedan was clean. Perfect for our Madurai to Rameshwaram trip. Got instant confirmation on WhatsApp.', 'trip_route' => 'Madurai to Rameshwaram', 'is_verified' => 1],
        ['customer_name' => 'Priya Sharma', 'rating' => 5, 'comment' => 'Drop Cars gave us transparent pricing with no hidden charges. Booked Chennai to Bangalore for a family trip. Highly recommended for intercity travel!', 'trip_route' => 'Chennai to Bangalore', 'is_verified' => 1],
        ['customer_name' => 'Venkatesh Iyer', 'rating' => 5, 'comment' => 'Booked through WhatsApp and got instant confirmation. Driver reached on time, car was comfortable. Best drop taxi service in Tamil Nadu.', 'trip_route' => 'Chennai to Pondicherry', 'is_verified' => 1],
        ['customer_name' => 'Lakshmi Menon', 'rating' => 5, 'comment' => 'Affordable one-way cab from Trichy to Madurai. No return fare charges—exactly what we needed. Clean Innova, courteous driver.', 'trip_route' => 'Trichy to Madurai', 'is_verified' => 1],
        ['customer_name' => 'Arun Patel', 'rating' => 5, 'comment' => 'Used Drop Cars for a multi-city trip. 24/7 support helped us change our pickup time. Professional service, well-maintained vehicles.', 'trip_route' => 'Coimbatore to Ooty', 'is_verified' => 1],
        ['customer_name' => 'Deepa Nair', 'rating' => 5, 'comment' => 'Best intercity taxi in South India! Clean cars, verified drivers, transparent fares. Will definitely book again for our next trip.', 'trip_route' => 'Madurai to Chennai', 'is_verified' => 1],
    ];
    return $limit > 0 ? array_slice($defaults, 0, $limit) : $defaults;
}

/**
 * Get all reviews for the "View more" page: real, admin-approved customer
 * reviews from the database first (these are the reviews customers actually
 * submitted via /api/reviews.php and admin moderated in admin/reviews.php),
 * followed by the curated data/reviews-extended.php set as supplementary
 * filler content.
 *
 * Previously this only ever returned the curated file and never touched the
 * database, so nothing an admin approved, edited, or removed in the
 * admin/reviews.php moderation panel had any effect on this page - real
 * customer reviews silently never appeared here even after approval.
 */
function dropcars_get_all_reviews() {
    $dbReviews = [];
    try {
        require_once __DIR__ . '/../admin/config/database.php';
        $pdo = $GLOBALS['db'] ?? null;
        if ($pdo instanceof PDO) {
            $stmt = $pdo->query("SELECT id, customer_name, rating, comment, trip_route, is_verified, created_at FROM reviews WHERE is_approved = 1 ORDER BY created_at DESC LIMIT 200");
            $dbReviews = $stmt->fetchAll(PDO::FETCH_ASSOC);
        }
    } catch (Throwable $e) {
        $dbReviews = [];
    }

    $curated = [];
    $extendedFile = __DIR__ . '/../data/reviews-extended.php';
    if (is_file($extendedFile)) {
        $curated = include $extendedFile;
    }

    return array_merge($dbReviews, $curated);
}

/**
 * Fetch reviews specifically for a given pickup and drop city route
 * Falls back to recent generic reviews if route-specific reviews are fewer than 3.
 */
function dropcars_get_route_reviews(string $pickupCity, string $dropCity, int $limit = 3): array {
    require_once __DIR__ . '/../admin/config/database.php';
    $pdo = $GLOBALS['db'] ?? null;
    if (!$pdo instanceof PDO) {
        return array_slice(dropcars_get_reviews_fallback_defaults(0), 0, $limit);
    }

    try {
        // Find reviews matching both pickup and drop (either direction)
        // Match formats like "Chennai to Bangalore" or "Bangalore to Chennai"
        $stmt = $pdo->prepare("
            SELECT id, customer_name, rating, comment, trip_route, is_verified, created_at 
            FROM reviews 
            WHERE is_approved = 1 
              AND (
                trip_route LIKE ? 
                OR trip_route LIKE ? 
                OR (trip_route LIKE ? AND trip_route LIKE ?)
              )
            ORDER BY created_at DESC 
            LIMIT ?
        ");
        
        $match1 = '%' . $pickupCity . '%to%' . $dropCity . '%';
        $match2 = '%' . $dropCity . '%to%' . $pickupCity . '%';
        $match3 = '%' . $pickupCity . '%';
        $match4 = '%' . $dropCity . '%';
        
        $stmt->execute([$match1, $match2, $match3, $match4, $limit]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Fall back to general reviews if we don't have enough route-specific reviews
        if (count($rows) < 3) {
            $general = dropcars_get_reviews(6);
            // Filter out reviews that might be duplicates
            $existingIds = array_column($rows, 'id');
            foreach ($general as $r) {
                if (isset($r['id']) && in_array($r['id'], $existingIds, true)) {
                    continue;
                }
                $rows[] = $r;
                if (count($rows) >= 6) {
                    break;
                }
            }
        }

        return array_slice($rows, 0, $limit);
    } catch (Throwable $e) {
        return array_slice(dropcars_get_reviews_fallback_defaults(0), 0, $limit);
    }
}
