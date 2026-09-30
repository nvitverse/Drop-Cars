<?php
/**
 * Dashboard "Live Mission Control" leads query + filter parsing.
 *
 * Shared by admin/pages/dashboard.php (normal render) and its
 * ?ajax=leads fragment endpoint. Expects $pdo in scope. Populates:
 *   $recentBookings, $totalCount, $totalPages, $page, $limit, $offset
 *   $dashStatusFilter, $dashSortFilter, $dashDateFilter, $startDate,
 *   $endDate, $dashDispatcherFilter, $dashTripTypeFilter, $allAdminNames
 */

// --- Status filter for Live Mission Control list ---------------------
$allowedStatuses = ['waiting', 'confirmed', 'completed', 'cancelled', 'fake'];
$dashStatusFilter = isset($_GET['status']) ? strtolower(trim((string) $_GET['status'])) : '';
if ($dashStatusFilter !== '' && !in_array($dashStatusFilter, $allowedStatuses, true)) {
    $dashStatusFilter = '';
}

// --- Date filter for Live Mission Control list -----------------------
$allowedDates = ['all', 'today', 'yesterday', 'this_week', 'this_month', 'custom'];
$dashDateFilter = isset($_GET['date_filter']) ? strtolower(trim((string) $_GET['date_filter'])) : 'all';
if (!in_array($dashDateFilter, $allowedDates, true)) {
    $dashDateFilter = 'all';
}

$startDate = '';
$endDate = '';
if ($dashDateFilter === 'custom') {
    $startDate = isset($_GET['start_date']) ? trim((string) $_GET['start_date']) : '';
    $endDate = isset($_GET['end_date']) ? trim((string) $_GET['end_date']) : '';
    if ($startDate !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $startDate)) {
        $startDate = '';
    }
    if ($endDate !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $endDate)) {
        $endDate = '';
    }
}

if (!function_exists('dropcars_get_dash_date_condition')) {
    function dropcars_get_dash_date_condition(PDO $pdo, string $alias, string $filter, string $start = '', string $end = ''): string {
        if ($filter === 'today') {
            return "DATE({$alias}.`created_at`) = CURDATE()";
        } elseif ($filter === 'yesterday') {
            return "DATE({$alias}.`created_at`) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)";
        } elseif ($filter === 'this_week') {
            return "YEARWEEK({$alias}.`created_at`, 1) = YEARWEEK(CURDATE(), 1)";
        } elseif ($filter === 'this_month') {
            return "MONTH({$alias}.`created_at`) = MONTH(CURDATE()) AND YEAR({$alias}.`created_at`) = YEAR(CURDATE())";
        } elseif ($filter === 'custom') {
            $conds = [];
            if ($start !== '') {
                $conds[] = "DATE({$alias}.`created_at`) >= " . $pdo->quote($start);
            }
            if ($end !== '') {
                $conds[] = "DATE({$alias}.`created_at`) <= " . $pdo->quote($end);
            }
            return count($conds) > 0 ? implode(" AND ", $conds) : "1=1";
        }
        return "1=1";
    }
}

// --- Staff filter for Live Mission Control list -----------------------
$allAdminNames = [];
try {
    $stmtAllAdmins = $pdo->query("SELECT DISTINCT name FROM admins ORDER BY id ASC");
    $allAdminNames = $stmtAllAdmins->fetchAll(PDO::FETCH_COLUMN);
} catch (Throwable $e) {}

$dashDispatcherFilter = isset($_GET['dispatcher']) ? trim((string) $_GET['dispatcher']) : '';

if (!function_exists('dropcars_get_dash_staff_condition')) {
    function dropcars_get_dash_staff_condition(PDO $pdo, string $alias, string $filter): string {
        if ($filter === '') {
            return "1=1";
        }
        if ($filter === 'unassigned') {
            if ($alias === 'e') {
                return "(e.`assigned_dispatcher` IS NULL OR e.`assigned_dispatcher` = '')";
            } else {
                return "(b.`responded_by` IS NULL OR b.`responded_by` = '')";
            }
        }
        $quoted = $pdo->quote($filter);
        if ($alias === 'e') {
            return "(e.`assigned_dispatcher` = $quoted OR e.`responded_by` = $quoted)";
        } else {
            return "b.`responded_by` = $quoted";
        }
    }
}

// --- Trip Type filter for Live Mission Control list -------------------
$dashTripTypeFilter = isset($_GET['trip_type']) ? strtolower(trim((string) $_GET['trip_type'])) : '';

if (!function_exists('dropcars_get_dash_triptype_condition')) {
    function dropcars_get_dash_triptype_condition(PDO $pdo, string $alias, string $filter): string {
        if ($filter === '') {
            return "1=1";
        }
        // Normalise each of the 4 booking-form trip types to the spelling
        // variants that may appear in enquiries/bookings.trip_type.
        $variants = [
            'one_way'       => ['one_way', 'oneway', 'one-way', 'one_way_trip'],
            'round_trip'    => ['round_trip', 'round', 'round-trip', 'round_trip_trip', 'roundtrip'],
            'multi_city'    => ['multi_city', 'multicity', 'multi-city'],
            'hourly_rental' => ['hourly_rental', 'hourly', 'hourly-rental', 'local_package'],
        ];
        // Back-compat aliases for older saved/bookmarked filter values.
        $aliases = ['oneway' => 'one_way', 'round' => 'round_trip'];
        if (isset($aliases[$filter])) {
            $filter = $aliases[$filter];
        }
        $list = $variants[$filter] ?? [$filter];
        $col = ($alias === 'e') ? 'e.`trip_type`' : 'b.`trip_type`';
        $quoted = array_map(static function ($v) use ($pdo) { return $pdo->quote($v); }, $list);
        return "LOWER($col) IN (" . implode(', ', $quoted) . ")";
    }
}

// --- Sort filter for Live Mission Control list -----------------------
$allowedSorts = ['newest', 'oldest', 'travel_date', 'next_first'];
$dashSortFilter = isset($_GET['sort']) ? strtolower(trim((string) $_GET['sort'])) : 'newest';
if (!in_array($dashSortFilter, $allowedSorts, true)) {
    $dashSortFilter = 'newest';
}

$orderBy = "created_at DESC";
if ($dashSortFilter === 'oldest') {
    $orderBy = "created_at ASC";
} elseif ($dashSortFilter === 'travel_date') {
    $orderBy = "pickup_date ASC, pickup_time ASC, created_at DESC";
} elseif ($dashSortFilter === 'next_first') {
    $orderBy = "CASE WHEN CONCAT(pickup_date, ' ', pickup_time) >= NOW() THEN 1 ELSE 2 END ASC,
                CASE WHEN CONCAT(pickup_date, ' ', pickup_time) >= NOW() THEN CONCAT(pickup_date, ' ', pickup_time) END ASC,
                CASE WHEN CONCAT(pickup_date, ' ', pickup_time) < NOW() THEN CONCAT(pickup_date, ' ', pickup_time) END DESC,
                created_at DESC";
}

$page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
$limit = 30;
$offset = ($page - 1) * $limit;
$totalCount = 0;

$dateCondB = dropcars_get_dash_date_condition($pdo, 'b', $dashDateFilter, $startDate, $endDate);
$dateCondE = dropcars_get_dash_date_condition($pdo, 'e', $dashDateFilter, $startDate, $endDate);

// Multi-Site Context Filter
$activeSite = function_exists('dropcars_get_active_website') ? dropcars_get_active_website() : 'all';
if ($activeSite !== 'all') {
    $quotedSite = $pdo->quote($activeSite);
    $dateCondB .= " AND b.`website` = $quotedSite";
    $dateCondE .= " AND e.`website` = $quotedSite";
}

$staffCondB = dropcars_get_dash_staff_condition($pdo, 'b', $dashDispatcherFilter);
$staffCondE = dropcars_get_dash_staff_condition($pdo, 'e', $dashDispatcherFilter);
$tripCondB = dropcars_get_dash_triptype_condition($pdo, 'b', $dashTripTypeFilter);
$tripCondE = dropcars_get_dash_triptype_condition($pdo, 'e', $dashTripTypeFilter);

if ($dashStatusFilter === 'confirmed') {
    // Include actual confirmed + customer-submitted "Pending Confirmation" (pending with no responded_by)
    $totalCount = (int)$pdo->query("SELECT COUNT(*) FROM `bookings` b
        JOIN `customers` c ON b.customer_id = c.id
        WHERE (
            b.`status` = 'confirmed'
            OR (b.`status` = 'pending' AND (b.`responded_by` IS NULL OR b.`responded_by` = ''))
        ) AND $dateCondB AND $staffCondB AND $tripCondB")->fetchColumn();
    $recentBookings = $pdo->query("SELECT * FROM (
        SELECT 'booking' AS record_type, b.id, b.booking_id, c.name AS customer_name, c.phone AS customer_phone, b.pickup_location, b.drop_location, b.trip_type, b.pickup_date, b.pickup_time, b.final_fare, b.status, b.fare_type, b.created_at, b.driver_name, b.driver_phone, b.car_name, b.car_number, b.responded_by, b.via_locations, '' AS fare_breakdown
        FROM `bookings` b
        JOIN `customers` c ON b.customer_id = c.id
        WHERE (
            b.status = 'confirmed'
            OR (b.status = 'pending' AND (b.responded_by IS NULL OR b.responded_by = ''))
        ) AND $dateCondB AND $staffCondB AND $tripCondB
    ) AS combined_leads
    ORDER BY $orderBy LIMIT $limit OFFSET $offset")->fetchAll();
} elseif ($dashStatusFilter === 'completed') {
    $totalCount = (int)$pdo->query("SELECT COUNT(*) FROM `bookings` b WHERE b.`status` = 'completed' AND $dateCondB AND $staffCondB AND $tripCondB")->fetchColumn();
    $recentBookings = $pdo->query("SELECT * FROM (
        SELECT 'booking' AS record_type, b.id, b.booking_id, c.name AS customer_name, c.phone AS customer_phone, b.pickup_location, b.drop_location, b.trip_type, b.pickup_date, b.pickup_time, b.final_fare, b.status, b.fare_type, b.created_at, b.driver_name, b.driver_phone, b.car_name, b.car_number, b.responded_by, b.via_locations, '' AS fare_breakdown
        FROM `bookings` b
        JOIN `customers` c ON b.customer_id = c.id
        WHERE b.status = 'completed' AND $dateCondB AND $staffCondB AND $tripCondB
    ) AS combined_leads
    ORDER BY $orderBy LIMIT $limit OFFSET $offset")->fetchAll();
} elseif ($dashStatusFilter === 'cancelled') {
    $totalCount = (int)$pdo->query("SELECT COUNT(*) FROM `bookings` b WHERE b.`status` = 'cancelled' AND $dateCondB AND $staffCondB AND $tripCondB")->fetchColumn();
    $recentBookings = $pdo->query("SELECT * FROM (
        SELECT 'booking' AS record_type, b.id, b.booking_id, c.name AS customer_name, c.phone AS customer_phone, b.pickup_location, b.drop_location, b.trip_type, b.pickup_date, b.pickup_time, b.final_fare, b.status, b.fare_type, b.created_at, b.driver_name, b.driver_phone, b.car_name, b.car_number, b.responded_by, b.via_locations, '' AS fare_breakdown
        FROM `bookings` b
        JOIN `customers` c ON b.customer_id = c.id
        WHERE b.status = 'cancelled' AND $dateCondB AND $staffCondB AND $tripCondB
    ) AS combined_leads
    ORDER BY $orderBy LIMIT $limit OFFSET $offset")->fetchAll();
} elseif ($dashStatusFilter === 'fake') {
    $totalCount = (int)$pdo->query("SELECT COUNT(*) FROM (
        SELECT e.id FROM `enquiries` e WHERE e.status = 'fake' AND $dateCondE AND $staffCondE AND $tripCondE
        UNION ALL
        SELECT b.id FROM `bookings` b JOIN `customers` c ON b.customer_id = c.id WHERE b.status = 'fake' AND $dateCondB AND $staffCondB AND $tripCondB
    ) AS combined_count")->fetchColumn();

    $recentBookings = $pdo->query("SELECT * FROM (
        SELECT
            'enquiry' AS record_type,
            e.id AS id,
            e.booking_id AS booking_id,
            e.name AS customer_name,
            e.phone AS customer_phone,
            e.pickup AS pickup_location,
            e.drop_location AS drop_location,
            e.trip_type AS trip_type,
            e.travel_date AS pickup_date,
            e.travel_time AS pickup_time,
            e.fare_estimate AS final_fare,
            e.status AS status,
            e.fare_type AS fare_type,
            e.created_at AS created_at,
            '' AS driver_name,
            '' AS driver_phone,
            e.vehicle_type AS car_name,
            '' AS car_number,
            e.responded_by AS responded_by,
            '' AS via_locations,
            e.fare_breakdown AS fare_breakdown
        FROM `enquiries` e
        WHERE e.status = 'fake' AND $dateCondE AND $staffCondE AND $tripCondE

        UNION ALL

        SELECT
            'booking' AS record_type,
            b.id AS id,
            b.booking_id AS booking_id,
            c.name AS customer_name,
            c.phone AS customer_phone,
            b.pickup_location AS pickup_location,
            b.drop_location AS drop_location,
            b.trip_type AS trip_type,
            b.pickup_date AS pickup_date,
            b.pickup_time AS pickup_time,
            b.final_fare AS final_fare,
            b.status AS status,
            b.fare_type AS fare_type,
            b.created_at AS created_at,
            b.driver_name AS driver_name,
            b.driver_phone AS driver_phone,
            b.car_name AS car_name,
            b.car_number AS car_number,
            b.responded_by AS responded_by,
            b.via_locations AS via_locations,
            '' AS fare_breakdown
        FROM `bookings` b
        JOIN `customers` c ON b.customer_id = c.id
        WHERE b.status = 'fake' AND $dateCondB AND $staffCondB AND $tripCondB
    ) AS combined_leads
    ORDER BY $orderBy LIMIT $limit OFFSET $offset")->fetchAll();
} elseif ($dashStatusFilter === 'waiting') {
    // Waiting — only admin-marked bookings (pending + responded_by is set)
    $totalCount = (int)$pdo->query("SELECT COUNT(*) FROM `bookings` b
        WHERE b.status = 'pending' AND (b.responded_by IS NOT NULL AND b.responded_by != '')
        AND $dateCondB AND $staffCondB AND $tripCondB")->fetchColumn();
    $recentBookings = $pdo->query("SELECT * FROM (
        SELECT
            'booking' AS record_type, b.id, b.booking_id, c.name AS customer_name, c.phone AS customer_phone, b.pickup_location, b.drop_location, b.trip_type, b.pickup_date, b.pickup_time, b.final_fare, b.status, b.fare_type, b.created_at, b.driver_name, b.driver_phone, b.car_name, b.car_number, b.responded_by, b.via_locations, '' AS fare_breakdown
        FROM `bookings` b
        JOIN `customers` c ON b.customer_id = c.id
        WHERE b.status = 'pending' AND (b.responded_by IS NOT NULL AND b.responded_by != '')
        AND $dateCondB AND $staffCondB AND $tripCondB
    ) AS combined_leads
    ORDER BY $orderBy LIMIT $limit OFFSET $offset")->fetchAll();
} else {
    // Default: Pending Response - unmarked enquiries (status not_confirmed) that staff did not respond to.
    // Customer-submitted pending bookings are now shown under "Confirmed" tab instead.
    $totalCount = (int)$pdo->query("SELECT COUNT(*) FROM (
        SELECT e.id FROM `enquiries` e WHERE e.status = 'not_confirmed' AND e.is_touched = 0 AND (e.dispatcher_notes IS NULL OR e.dispatcher_notes = '') AND (e.assigned_dispatcher IS NULL OR e.assigned_dispatcher = '') AND e.followup_time IS NULL AND $dateCondE AND $staffCondE AND $tripCondE
    ) AS combined_count")->fetchColumn();

    $recentBookings = $pdo->query("SELECT * FROM (
        SELECT
            'enquiry' AS record_type,
            e.id AS id,
            e.booking_id AS booking_id,
            e.name AS customer_name,
            e.phone AS customer_phone,
            e.pickup AS pickup_location,
            e.drop_location AS drop_location,
            e.trip_type AS trip_type,
            e.travel_date AS pickup_date,
            e.travel_time AS pickup_time,
            e.fare_estimate AS final_fare,
            e.status AS status,
            e.fare_type AS fare_type,
            e.created_at AS created_at,
            '' AS driver_name,
            '' AS driver_phone,
            e.vehicle_type AS car_name,
            '' AS car_number,
            e.responded_by AS responded_by,
            '' AS via_locations,
            e.fare_breakdown AS fare_breakdown
        FROM `enquiries` e
        WHERE e.status = 'not_confirmed' AND e.is_touched = 0 AND (e.dispatcher_notes IS NULL OR e.dispatcher_notes = '') AND (e.assigned_dispatcher IS NULL OR e.assigned_dispatcher = '') AND e.followup_time IS NULL AND $dateCondE AND $staffCondE AND $tripCondE
    ) AS combined_leads
    ORDER BY $orderBy LIMIT $limit OFFSET $offset")->fetchAll();
}
$totalPages = max(1, (int)ceil($totalCount / $limit));
