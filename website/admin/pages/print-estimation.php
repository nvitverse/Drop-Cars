<?php
/**
 * Drop Cars – Fare Quotation / Print Estimation
 * Standalone print page. Breaks out of the admin layout wrapper and renders
 * a clean, professional A4 quotation document.
 */

// ── Session guard ────────────────────────────────────────────────────────────
if (empty($_SESSION['pending_fare_view'])) {
    while (ob_get_level() > 0) { ob_end_clean(); }
    $redir = function_exists('admin_url') ? admin_url('customize-booking') : '../customize-booking';
    header('Location: ' . $redir);
    exit;
}

// ── Extract data from session ────────────────────────────────────────────────
$printCfgPath = dirname(__DIR__, 2) . '/api/config.php';
$printCfg = is_file($printCfgPath) ? (include $printCfgPath) : [];
$printSupportPhone = $printCfg['supportPhone'] ?? '+91 7200217986';

$fareData        = $_SESSION['pending_fare_view'];
$bookingPayload  = $fareData['payload']          ?? [];
$pickup          = $fareData['pickup']           ?? 'N/A';
$drop            = $fareData['drop']             ?? 'N/A';
$serviceType     = $fareData['serviceType']      ?? 'one_way';
$urlVehicle      = isset($_GET['vehicle']) ? strtolower(trim((string)$_GET['vehicle'])) : '';
$isAllVehicles   = ($urlVehicle === 'all');
$selectedVehicle = $fareData['selectedVehicle']  ?? 'SEDAN';
if (!empty($urlVehicle) && !$isAllVehicles) {
    $selectedVehicle = strtoupper($urlVehicle);
}
$distanceHint    = (float)($fareData['distanceHint'] ?? 0);

// Customer
$customerName    = $bookingPayload['customerName']  ?? '';
$customerPhone   = $bookingPayload['contactValue']  ?? '';
$customerEmail   = $bookingPayload['contactEmail']  ?? '';

// Trip schedule
$travelDate      = $bookingPayload['travelDate']    ?? '';
$travelTime      = $bookingPayload['travelTime']    ?? '';
$endDate         = $bookingPayload['endDate']        ?? '';
$dropTime        = $bookingPayload['dropTime']       ?? '';
$durationHint    = $bookingPayload['durationHint']   ?? '';
$stops           = $bookingPayload['stops']          ?? [];
$dispatcherNotes = $bookingPayload['dispatcherNotes'] ?? '';

// Fare breakdown
$fb              = $bookingPayload['fareBreakdown']  ?? [];
$baseFare        = (float)($bookingPayload['baseFare'] ?? 0);

// Selected vehicle data
$vData           = $fb['vehicles'][$selectedVehicle] ?? [];
$effectiveKm     = (float)($vData['effectiveBillableKm'] ?? 0);
$minimumKm       = (float)($vData['minimumBillableKm']   ?? 0);
$actualRouteKm   = (float)($vData['actualRouteKmTotal']  ?? $distanceHint);
$perKmRate       = (float)($vData['perKmRate']           ?? 0);
$kmCharge        = (float)($vData['kmCharge']            ?? ($effectiveKm * $perKmRate));
$tripDays        = max(1, (int)($vData['tripDays'] ?? $fb['tripDays'] ?? 1));
$driverBataPerDay= (float)($vData['driverBataPerDay']    ?? $vData['driverBata'] ?? 0);
$driverBata      = (float)($vData['driverBataTotal']     ?? $vData['driverBata'] ?? 0);
$nightAllow      = (float)($vData['driverNightAllowance']?? $vData['multiCityNightAllowance'] ?? 0);
$parkingCharge   = (float)($vData['parkingCharges']      ?? $vData['parking']   ?? 0);
$waitingCharge   = (float)($vData['waitingCharges']      ?? $vData['waiting']   ?? 0);

// Tolls & taxes (admin overrides stored in fareBreakdown)
$includeTolls    = (bool)($fb['includeTolls']        ?? false);
$includeTaxes    = (bool)($fb['includeTaxes']        ?? false);
$tollAmount      = (float)($fb['overrideTollAmount'] ?? 0);
$taxRate         = (float)($fb['overrideTaxAmount']  ?? 0);
$taxCount        = (int)($fb['overrideTaxCount']     ?? 0);
$taxTotal        = $includeTaxes ? ($taxCount * $taxRate) : 0;
$tollTotal       = $includeTolls ? $tollAmount : 0;

// Compute base total from breakdown (kmCharge + driverBata + extras)
$baseTotal = $kmCharge + $driverBata + $nightAllow + $parkingCharge + $waitingCharge;
// Use stored baseFare if it deviates (admin manually adjusted)
if ($baseFare > 0 && $baseTotal > 0 && abs($baseFare - ($kmCharge + $driverBata)) > 2) {
    $baseTotal = $baseFare;
}
$grandTotal = $baseTotal + $tollTotal + $taxTotal;

// ── Comparative data for all vehicles (if requested) ────────────────────────
$allVehicles = ['SEDAN', 'SUV', 'INNOVA', 'CRYSTA'];
$vehicleEstimates = [];
foreach ($allVehicles as $vk) {
    $vkData           = $fb['vehicles'][$vk] ?? [];
    $vkEffectiveKm     = (float)($vkData['effectiveBillableKm'] ?? 0);
    $vkMinimumKm       = (float)($vkData['minimumBillableKm']   ?? 0);
    $vkPerKmRate       = (float)($vkData['perKmRate']           ?? 0);
    $vkKmCharge        = (float)($vkData['kmCharge']            ?? ($vkEffectiveKm * $vkPerKmRate));
    $vkTripDays        = max(1, (int)($vkData['tripDays'] ?? $fb['tripDays'] ?? 1));
    $vkDriverBata      = (float)($vkData['driverBataTotal']     ?? $vkData['driverBata'] ?? 0);
    $vkNightAllow      = (float)($vkData['driverNightAllowance']?? $vkData['multiCityNightAllowance'] ?? 0);
    $vkParkingCharge   = (float)($vkData['parkingCharges']      ?? $vkData['parking']   ?? 0);
    $vkWaitingCharge   = (float)($vkData['waitingCharges']      ?? $vkData['waiting']   ?? 0);
    
    // Tolls & taxes (using vehicle-specific overrides or falling back to top level)
    $vkTollAmount      = (float)($vkData['overrideTollAmount'] ?? $fb['overrideTollAmount'] ?? 0);
    $vkTaxRate         = (float)($vkData['overrideTaxAmount']  ?? $fb['overrideTaxAmount']  ?? 0);
    $vkTaxCount        = (int)($vkData['overrideTaxCount']     ?? $fb['overrideTaxCount']     ?? 0);
    
    $vkTollTotal       = $includeTolls ? $vkTollAmount : 0;
    $vkTaxTotal        = $includeTaxes ? ($vkTaxCount * $vkTaxRate) : 0;
    
    $vkBaseTotal = $vkKmCharge + $vkDriverBata + $vkNightAllow + $vkParkingCharge + $vkWaitingCharge;
    $vkGrandTotal = $vkBaseTotal + $vkTollTotal + $vkTaxTotal;
    
    $vehicleEstimates[$vk] = [
        'effectiveKm'   => $vkEffectiveKm,
        'perKmRate'     => $vkPerKmRate,
        'kmCharge'      => $vkKmCharge,
        'driverBata'    => $vkDriverBata,
        'nightAllow'    => $vkNightAllow,
        'parkingCharge' => $vkParkingCharge,
        'waitingCharge' => $vkWaitingCharge,
        'tollTotal'     => $vkTollTotal,
        'taxTotal'      => $vkTaxTotal,
        'grandTotal'    => $vkGrandTotal,
    ];
}


// Booking ID
$bookingId = $bookingPayload['bookingId'] ?? '';
$fvSource  = $_GET['source'] ?? $fareData['_source'] ?? '';
$fvId      = (int)($_GET['id'] ?? $fareData['_id'] ?? 0);
if (empty($bookingId) && $fvId > 0) {
    $bookingId = ($fvSource === 'booking' ? 'BOOK-' : 'ENQ-') . $fvId;
}
$quoteRef      = !empty($bookingId) ? '#' . ltrim($bookingId, '#') : '#' . date('ymdHi');
$quoteDate     = date('d M Y');
$quoteValidity = date('d M Y', strtotime('+7 days'));

// Construct back URL
$backUrlParams = [];
if ($fvId > 0) {
    $backUrlParams['id'] = $fvId;
}
if (!empty($fvSource)) {
    $backUrlParams['source'] = $fvSource;
}
$backUrl = function_exists('admin_url') 
    ? admin_url('customize-booking', $backUrlParams) 
    : '../customize-booking' . ($backUrlParams ? '?' . http_build_query($backUrlParams) : '');

// Service label
$serviceLabels = [
    'one_way'          => 'One Way Trip',
    'round_trip'       => 'Round Trip',
    'hourly_rental'    => 'Hourly Rental',
    'multi_city'       => 'Multi-City Trip',
    'airport_transfer' => 'Airport Transfer',
];
$serviceLabel = $serviceLabels[$serviceType] ?? 'Standard Trip';

// Formatted dates
$travelDateFmt = $travelDate ? date('d M Y', strtotime($travelDate)) : '';
$travelTimeFmt = $travelTime ? date('h:i A', strtotime($travelTime)) : '';
$endDateFmt    = $endDate    ? date('d M Y', strtotime($endDate))    : '';
$dropTimeFmt   = $dropTime   ? date('h:i A', strtotime($dropTime))   : '';

// Inclusions list
$inclusions = [
    'Base Fare' . ($effectiveKm > 0 ? ' (up to ' . number_format($effectiveKm, 0) . ' km)' : ''),
    'Driver Allowance (Bata)',
    'Fuel &amp; Maintenance',
    'Clean Air-Conditioned Vehicle',
];
if ($includeTolls && $tollTotal > 0) {
    $inclusions[] = 'Highway Tolls / Fastag';
}
if ($includeTaxes && $taxTotal > 0) {
    $inclusions[] = 'Inter-State Entry Tax';
}

// Exclusions list
$exclusions = [
    ['item' => 'Parking Charges',    'note' => 'Actuals — paid at venue'],
    ['item' => 'Waiting Charges',    'note' => 'Extra after 30-min grace'],
];
if (!$includeTolls) {
    $exclusions[] = ['item' => 'Highway Tolls', 'note' => 'Actuals (Fastag)'];
}
if (!$includeTaxes) {
    $exclusions[] = ['item' => 'State Entry Tax', 'note' => 'Actuals per border'];
}
if ($perKmRate > 0 && $effectiveKm > 0) {
    $exclusions[] = ['item' => 'Extra KM Charge', 'note' => '₹' . number_format($perKmRate, 0) . '/km beyond ' . number_format($effectiveKm, 0) . ' km'];
}


// ── Break out of admin router's output buffer ────────────────────────────────
while (ob_get_level() > 0) { ob_end_clean(); }
header('Content-Type: text/html; charset=UTF-8');
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Drop Cars – Fare Quotation <?php echo htmlspecialchars($quoteRef); ?></title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        /* ─── Base ────────────────────────────────────────────────────────── */
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
            --navy:   #0f172a;
            --navy2:  #1e293b;
            --gold:   #f7b733;
            --gold2:  #d97706;
            --green:  #16a34a;
            --red:    #dc2626;
            --slate:  #64748b;
            --light:  #f8fafc;
            --border: #e2e8f0;
            --text:   #1e293b;
        }
        body {
            font-family: 'Inter', sans-serif;
            background: #e8ecf0;
            color: var(--text);
            font-size: 14px;
            line-height: 1.5;
        }

        /* ─── Screen controls (hidden on print) ──────────────────────────── */
        .screen-controls {
            position: fixed;
            bottom: 2rem;
            right: 2rem;
            display: flex;
            flex-direction: column;
            gap: 0.6rem;
            z-index: 1000;
        }
        .btn-ctrl {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.7rem 1.4rem;
            border: none;
            border-radius: 10px;
            font-family: inherit;
            font-size: 0.9rem;
            font-weight: 700;
            cursor: pointer;
            text-decoration: none;
            transition: all 0.2s;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .btn-ctrl-primary {
            background: var(--navy);
            color: white;
        }
        .btn-ctrl-primary:hover { background: var(--navy2); transform: translateY(-1px); }
        .btn-ctrl-secondary {
            background: white;
            color: var(--slate);
            border: 1px solid var(--border);
        }
        .btn-ctrl-secondary:hover { color: var(--navy); }

        /* ─── Share Dropdown & Controls ──────────────────────────────────── */
        .btn-ctrl-success {
            background: #25d366 !important;
            color: white !important;
        }
        .btn-ctrl-success:hover {
            background: #128c7e !important;
            transform: translateY(-1px);
        }
        .share-dropdown {
            position: relative;
            display: inline-block;
            width: 100%;
        }
        .share-dropdown .btn-ctrl {
            width: 100%;
            justify-content: center;
        }
        .share-dropdown-menu {
            display: none;
            position: absolute;
            bottom: 115%;
            right: 0;
            background: white;
            min-width: 200px;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(15,23,42,0.15);
            border: 1px solid var(--border);
            overflow: hidden;
            z-index: 1005;
            flex-direction: column;
            padding: 6px;
            gap: 4px;
        }
        .share-dropdown-menu.show {
            display: flex;
            animation: slideUp 0.2s ease-out;
        }
        .share-dropdown-menu button {
            display: flex;
            align-items: center;
            gap: 12px;
            width: 100%;
            padding: 10px 14px;
            border: none;
            background: transparent;
            font-family: inherit;
            font-size: 0.85rem;
            font-weight: 600;
            color: var(--navy2);
            text-align: left;
            cursor: pointer;
            border-radius: 8px;
            transition: all 0.15s;
        }
        .share-dropdown-menu button:hover {
            background: #f1f5f9;
            color: var(--navy);
        }
        .share-dropdown-menu button i {
            font-size: 1rem;
            width: 18px;
            text-align: center;
        }
        .share-dropdown-menu button.opt-pdf i {
            color: #ef4444; /* PDF Red */
        }
        .share-dropdown-menu button.opt-link i {
            color: #25d366; /* WhatsApp Green */
        }
        .quotation-doc.pdf-rendering-active {
            border-radius: 0 !important;
            box-shadow: none !important;
            border: none !important;
        }

        @keyframes slideUp {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* ─── Document wrapper ────────────────────────────────────────────── */
        .quotation-wrapper {
            max-width: 850px;
            margin: 2rem auto;
            padding: 0 1rem;
        }
        .quotation-doc {
            background: white;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 20px 60px rgba(15,23,42,0.18);
        }

        /* ─── Document header ─────────────────────────────────────────────── */
        .doc-header {
            background: var(--navy);
            padding: 1.75rem 2rem;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 2rem;
        }
        .doc-logo {
            color: white;
            font-size: 2rem;
            font-weight: 900;
            letter-spacing: -0.04em;
            line-height: 1;
        }
        .doc-logo span { color: var(--gold); }
        .doc-logo-tagline {
            color: #94a3b8;
            font-size: 0.7rem;
            font-weight: 500;
            margin-top: 4px;
            letter-spacing: 0.02em;
        }
        .doc-logo-contacts {
            color: #cbd5e1;
            font-size: 0.72rem;
            margin-top: 6px;
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        .doc-logo-contacts i { width: 14px; color: #94a3b8; }
        .doc-title-block {
            text-align: right;
        }
        .doc-title {
            font-size: 0.7rem;
            font-weight: 800;
            letter-spacing: 0.15em;
            text-transform: uppercase;
            color: var(--gold);
            margin-bottom: 4px;
        }
        .doc-ref {
            font-size: 1.5rem;
            font-weight: 900;
            color: white;
            letter-spacing: -0.02em;
            line-height: 1;
        }
        .doc-meta-dates {
            margin-top: 6px;
            color: #94a3b8;
            font-size: 0.72rem;
            display: flex;
            flex-direction: column;
            gap: 2px;
            align-items: flex-end;
        }
        .doc-validity-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            background: rgba(247,183,51,0.15);
            border: 1px solid rgba(247,183,51,0.3);
            color: var(--gold);
            padding: 3px 10px;
            border-radius: 100px;
            font-size: 0.67rem;
            font-weight: 700;
            margin-top: 4px;
        }

        /* ─── Gold divider bar ────────────────────────────────────────────── */
        .doc-gold-bar {
            height: 4px;
            background: linear-gradient(90deg, var(--gold) 0%, var(--gold2) 100%);
        }

        /* ─── Info grid (Bill To + Trip Details) ──────────────────────────── */
        .doc-info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0;
            border-bottom: 1px solid var(--border);
        }
        .doc-info-cell {
            padding: 1.5rem 2rem;
        }
        .doc-info-cell:first-child {
            border-right: 1px solid var(--border);
        }
        .doc-section-label {
            font-size: 0.62rem;
            font-weight: 800;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            color: var(--slate);
            margin-bottom: 0.75rem;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .doc-section-label::after {
            content: '';
            flex: 1;
            height: 1px;
            background: var(--border);
        }
        .doc-customer-name {
            font-size: 1.1rem;
            font-weight: 800;
            color: var(--navy);
            margin-bottom: 0.35rem;
        }
        .doc-customer-detail {
            font-size: 0.8rem;
            color: var(--slate);
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 3px;
        }
        .doc-customer-detail i { width: 14px; color: #94a3b8; font-size: 0.75rem; }
        .doc-no-customer {
            font-size: 0.85rem;
            color: #94a3b8;
            font-style: italic;
        }
        .doc-kv-row {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            padding: 0.3rem 0;
            border-bottom: 1px dashed #f1f5f9;
            gap: 1rem;
        }
        .doc-kv-row:last-child { border-bottom: none; }
        .doc-kv-key {
            font-size: 0.75rem;
            color: var(--slate);
            white-space: nowrap;
        }
        .doc-kv-val {
            font-size: 0.78rem;
            font-weight: 700;
            color: var(--navy);
            text-align: right;
        }
        .doc-kv-val.highlight {
            font-size: 0.95rem;
            color: var(--green);
            font-weight: 900;
        }

        /* ─── Route section ───────────────────────────────────────────────── */
        .doc-route {
            padding: 1.25rem 2rem;
            background: linear-gradient(135deg, #f0f9ff 0%, #fffbeb 100%);
            border-bottom: 1px solid var(--border);
        }
        .doc-route-inner {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 0.4rem;
        }
        .rp {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .rp-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            flex-shrink: 0;
            position: relative;
        }
        .rp-dot::after {
            content: '';
            position: absolute;
            inset: -3px;
            border-radius: 50%;
            border: 1.5px solid currentColor;
            opacity: 0.25;
        }
        .rp-dot-start  { background: #22c55e; color: #22c55e; }
        .rp-dot-stop   { background: #6366f1; color: #6366f1; }
        .rp-dot-end    { background: var(--red); color: var(--red); }
        .rp-dot-return { background: var(--gold2); color: var(--gold2); }
        .rp-text { display: flex; flex-direction: column; }
        .rp-label {
            font-size: 0.55rem;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: #94a3b8;
            line-height: 1;
        }
        .rp-loc {
            font-size: 0.83rem;
            font-weight: 700;
            color: var(--navy);
            line-height: 1.2;
            max-width: 160px;
        }
        .rp-arrow {
            color: #cbd5e1;
            font-size: 0.65rem;
            flex-shrink: 0;
        }
        .rp-arrow.gold { color: var(--gold2); }

        /* ─── Route card layout ───────────────────────────────────────────── */
        .doc-route {
            padding: 0;
            border-bottom: 1px solid var(--border);
        }
        .doc-route-row {
            display: grid;
            grid-template-columns: 1fr auto 1fr;
            align-items: center;
            gap: 0;
        }
        .doc-route-point {
            padding: 1.1rem 1.5rem;
        }
        .doc-route-point-right {
            text-align: right;
        }
        .doc-route-pt-label {
            display: block;
            font-size: 0.6rem;
            font-weight: 800;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            color: var(--slate);
            margin-bottom: 0.3rem;
        }
        .doc-route-pt-name {
            font-size: 1rem;
            font-weight: 800;
            color: var(--navy);
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        .doc-route-point-right .doc-route-pt-name {
            justify-content: flex-end;
        }
        .doc-route-divider {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 0 0.75rem;
            color: #cbd5e1;
            font-size: 0.75rem;
            gap: 3px;
            border-left: 1px dashed var(--border);
            border-right: 1px dashed var(--border);
        }
        .doc-route-stops-row {
            border-top: 1px solid var(--border);
            padding: 0.75rem 1.5rem;
            background: #f8fafc;
            display: flex;
            align-items: flex-start;
            gap: 1rem;
        }
        .doc-route-stops-label {
            font-size: 0.62rem;
            font-weight: 800;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: var(--slate);
            white-space: nowrap;
            margin-top: 3px;
        }
        .doc-route-stops-label i { color: #6366f1; }
        .doc-route-stops-list {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
        }
        .doc-route-stop-item {
            display: flex;
            align-items: center;
            gap: 0.4rem;
            background: white;
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 0.25rem 0.7rem;
            font-size: 0.78rem;
            font-weight: 600;
            color: var(--navy2);
        }
        .doc-stop-num {
            background: #6366f1;
            color: white;
            font-size: 0.6rem;
            font-weight: 800;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        .doc-breakdown {
            padding: 0 2rem 1.5rem;
        }
        .doc-breakdown-title {
            padding: 1.25rem 0 0.75rem;
            font-size: 0.62rem;
            font-weight: 800;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            color: var(--slate);
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .doc-breakdown-title::after {
            content: '';
            flex: 1;
            height: 1px;
            background: var(--border);
        }
        .fare-table {
            width: 100%;
            border-collapse: collapse;
        }
        .fare-table thead tr {
            background: var(--navy);
            color: white;
        }
        .fare-table thead th {
            padding: 0.6rem 0.85rem;
            font-size: 0.68rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            text-align: left;
        }
        .fare-table thead th:last-child { text-align: right; }
        .fare-table tbody tr {
            border-bottom: 1px solid #f1f5f9;
            transition: background 0.1s;
        }
        .fare-table tbody tr:hover { background: #fafbfc; }
        .fare-table tbody tr.group-header td {
            background: #f8fafc;
            font-size: 0.65rem;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: var(--slate);
            padding: 0.5rem 0.85rem;
            border-top: 1px solid var(--border);
        }
        .fare-table tbody td {
            padding: 0.55rem 0.85rem;
            font-size: 0.83rem;
            vertical-align: middle;
        }
        .fare-table td.col-item { font-weight: 600; color: var(--navy); }
        .fare-table td.col-detail { color: var(--slate); font-size: 0.75rem; }
        .fare-table td.col-amount { text-align: right; font-weight: 700; color: var(--navy); }
        .fare-table td.col-amount.dash { color: #94a3b8; font-weight: 500; font-style: italic; font-size: 0.75rem; }
        .fare-table td.col-amount.inclusive { color: var(--slate); font-style: italic; font-size: 0.72rem; }

        /* Subtotal row */
        .fare-table tr.subtotal td {
            background: #f0f9ff;
            border-top: 2px solid #bfdbfe;
            padding: 0.6rem 0.85rem;
            font-weight: 700;
            color: #1d4ed8;
        }
        .fare-table tr.subtotal td.col-amount { font-size: 0.9rem; }

        /* Grand total row */
        .fare-table tr.grand-total td {
            background: var(--navy);
            color: white !important;
            padding: 0.85rem 0.85rem;
            font-weight: 800;
            font-size: 0.95rem;
            border-top: none;
        }
        .fare-table tr.grand-total td.col-amount {
            font-size: 1.3rem;
            font-weight: 900;
            color: var(--gold) !important;
            letter-spacing: -0.02em;
        }
        .min-km-note {
            font-size: 0.68rem;
            color: #f59e0b;
            background: #fffbeb;
            border: 1px solid #fde68a;
            border-radius: 6px;
            padding: 0.35rem 0.75rem;
            margin-top: 0.75rem;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        /* ─── Inclusions / Exclusions ────────────────────────────────────── */
        .doc-policy-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0;
            border-top: 1px solid var(--border);
        }
        .doc-policy-cell {
            padding: 1.25rem 2rem;
        }
        .doc-policy-cell:first-child {
            border-right: 1px solid var(--border);
        }
        .policy-list { list-style: none; margin-top: 0.75rem; }
        .policy-list li {
            display: flex;
            align-items: flex-start;
            gap: 0.5rem;
            font-size: 0.78rem;
            padding: 0.3rem 0;
            border-bottom: 1px dashed #f1f5f9;
            color: var(--navy2);
            font-weight: 500;
        }
        .policy-list li:last-child { border-bottom: none; }
        .policy-list li i.inc { color: var(--green); font-size: 0.75rem; margin-top: 2px; }
        .policy-list li i.exc { color: var(--red); font-size: 0.75rem; margin-top: 2px; }
        .exc-note { font-size: 0.68rem; color: var(--slate); font-weight: 400; display: block; }

        /* ─── Notes / Dispatcher notes ────────────────────────────────────── */
        .doc-notes {
            padding: 1rem 2rem;
            background: #fffbeb;
            border-top: 1px solid #fde68a;
            border-bottom: 1px solid var(--border);
            display: flex;
            align-items: flex-start;
            gap: 0.75rem;
        }
        .doc-notes i { color: var(--gold2); margin-top: 2px; flex-shrink: 0; }
        .doc-notes p { font-size: 0.8rem; color: #92400e; }

        /* ─── Terms ──────────────────────────────────────────────────────── */
        .doc-terms {
            padding: 1.25rem 2rem;
            border-top: 1px solid var(--border);
            background: var(--light);
        }
        .doc-terms-title {
            font-size: 0.62rem;
            font-weight: 800;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            color: var(--slate);
            margin-bottom: 0.6rem;
        }
        .doc-terms-list {
            list-style: none;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.3rem 2rem;
        }
        .doc-terms-list li {
            font-size: 0.72rem;
            color: #64748b;
            display: flex;
            align-items: flex-start;
            gap: 5px;
        }
        .doc-terms-list li::before {
            content: '•';
            color: var(--gold2);
            font-weight: 900;
            flex-shrink: 0;
        }

        /* ─── Signature section ──────────────────────────────────────────── */
        .doc-signature {
            padding: 1.5rem 2rem;
            border-top: 1px solid var(--border);
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 2rem;
        }
        .sig-block { display: flex; flex-direction: column; }
        .sig-line {
            border-bottom: 1.5px solid var(--navy);
            margin-bottom: 0.35rem;
            height: 36px;
        }
        .sig-label {
            font-size: 0.68rem;
            color: var(--slate);
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        /* ─── Document footer ─────────────────────────────────────────────── */
        .doc-footer {
            background: var(--navy);
            padding: 1rem 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .doc-footer-left {
            font-size: 0.7rem;
            color: #64748b;
        }
        .doc-footer-left strong { color: #94a3b8; }
        .doc-footer-right {
            font-size: 0.7rem;
            color: #475569;
            text-align: right;
        }

        /* ─── Print styles ────────────────────────────────────────────────── */
        @page {
            size: A4 portrait;
            margin: 0; /* Hides browser default header (page name/title) and footer (URL/date) */
        }
        @media print {
            body { 
                background: white !important; 
                -webkit-print-color-adjust: exact; 
                print-color-adjust: exact; 
                margin: 0;
                padding: 1.2cm 1.5cm; /* Re-introduce standard page margins inside the printable area */
            }
            .screen-controls { display: none !important; }
            .quotation-wrapper { max-width: 100%; margin: 0; padding: 0; }
            .quotation-doc { border-radius: 0; box-shadow: none; border: 1px solid var(--border); }

            .doc-header,
            .doc-gold-bar,
            .doc-info-grid,
            .doc-route,
            .doc-breakdown,
            .doc-policy-grid,
            .doc-terms,
            .doc-signature,
            .doc-footer { page-break-inside: avoid; }

            .fare-table tbody tr:hover { background: transparent; }
        }
    </style>
</head>
<body>

<!-- ── Screen-only controls ─────────────────────────────────────────────── -->
<div class="screen-controls">
    <div class="share-dropdown">
        <button class="btn-ctrl btn-ctrl-success btn-share-trigger">
            <i class="fa-brands fa-whatsapp"></i> Share Quotation
        </button>
        <div class="share-dropdown-menu">
            <button class="opt-pdf" onclick="shareQuotationPdf()"><i class="fa-solid fa-file-pdf"></i> Share as PDF</button>
            <button class="opt-link" onclick="shareQuotationLink()"><i class="fa-solid fa-link"></i> Share Link</button>
        </div>
    </div>
    <button class="btn-ctrl btn-ctrl-primary" onclick="window.print()">
        <i class="fa-solid fa-print"></i> Print / Save PDF
    </button>
    <a href="<?php echo htmlspecialchars($backUrl); ?>" class="btn-ctrl btn-ctrl-secondary" onclick="if(window.opener){ window.close(); return false; }">
        <i class="fa-solid fa-arrow-left"></i> Back to Booking
    </a>
</div>

<!-- ── Quotation Document ──────────────────────────────────────────────────── -->
<div class="quotation-wrapper">
<div class="quotation-doc">

    <!-- ── HEADER ──────────────────────────────────────────────────────── -->
    <div class="doc-header">
        <div>
            <div class="doc-logo"><img src="/assets/img/dropcars-logo-light.png" alt="Drop Cars Logo" style="height:38px; width:auto; max-width:180px; object-fit:contain; vertical-align:middle;" /></div>
            <div class="doc-logo-tagline">Outstation Cab &amp; Tour Services</div>
            <div class="doc-logo-contacts">
                <span><i class="fa fa-globe"></i> www.dropcars.in</span>
                <span><i class="fa fa-phone"></i> <?php echo htmlspecialchars($printSupportPhone); ?></span>
                <span><i class="fa fa-envelope"></i> bookings@dropcars.in</span>
            </div>
        </div>
        <div class="doc-title-block">
            <div class="doc-title">Fare Quotation</div>
            <div class="doc-ref"><?php echo htmlspecialchars($quoteRef); ?></div>
            <div class="doc-meta-dates">
                <span><i class="fa fa-calendar-day" style="width:12px;color:#64748b;"></i>&nbsp; Issued: <?php echo $quoteDate; ?></span>
                <span><i class="fa fa-clock" style="width:12px;color:#64748b;"></i>&nbsp; Valid until: <?php echo $quoteValidity; ?></span>
            </div>
            <div class="doc-validity-badge">
                <i class="fa fa-shield-check"></i> Official Estimation
            </div>
        </div>
    </div>

    <!-- ── GOLD BAR ─────────────────────────────────────────────────────── -->
    <div class="doc-gold-bar"></div>

    <!-- ── BILL TO + TRIP DETAILS ──────────────────────────────────────── -->
    <div class="doc-info-grid">
        <!-- Left: Bill To -->
        <div class="doc-info-cell">
            <div class="doc-section-label">Bill To</div>
            <?php if (!empty($customerName)): ?>
                <div class="doc-customer-name"><?php echo htmlspecialchars($customerName); ?></div>
            <?php else: ?>
                <div class="doc-no-customer">Walk-in / Unregistered Customer</div>
            <?php endif; ?>
            <?php if (!empty($customerPhone)): ?>
                <div class="doc-customer-detail"><i class="fa fa-phone"></i><?php echo htmlspecialchars($customerPhone); ?></div>
            <?php endif; ?>
            <?php if (!empty($customerEmail)): ?>
                <div class="doc-customer-detail"><i class="fa fa-envelope"></i><?php echo htmlspecialchars($customerEmail); ?></div>
            <?php endif; ?>
            <?php if (!empty($dispatcherNotes)): ?>
                <div class="doc-customer-detail" style="margin-top:0.5rem;align-items:flex-start;">
                    <i class="fa fa-note-sticky" style="margin-top:2px;"></i>
                    <span style="font-size:0.75rem;color:#475569;line-height:1.4;"><?php echo htmlspecialchars($dispatcherNotes); ?></span>
                </div>
            <?php endif; ?>
        </div>

        <!-- Right: Trip Details -->
        <div class="doc-info-cell">
            <div class="doc-section-label">Trip Details</div>
            <div class="doc-kv-row">
                <span class="doc-kv-key"><i class="fa fa-route" style="width:14px;color:#94a3b8;"></i> Trip Type</span>
                <span class="doc-kv-val"><?php echo htmlspecialchars($serviceLabel); ?></span>
            </div>
            <div class="doc-kv-row">
                <span class="doc-kv-key"><i class="fa fa-car" style="width:14px;color:#94a3b8;"></i> Vehicle</span>
                <span class="doc-kv-val"><?php echo $isAllVehicles ? 'All Fleet Options' : htmlspecialchars($selectedVehicle); ?></span>
            </div>
            <?php if ($distanceHint > 0): ?>
            <div class="doc-kv-row">
                <span class="doc-kv-key"><i class="fa fa-ruler-horizontal" style="width:14px;color:#94a3b8;"></i> Distance</span>
                <span class="doc-kv-val"><?php echo number_format($distanceHint, 0); ?> km</span>
            </div>
            <?php endif; ?>
            <?php if ($durationHint): ?>
            <div class="doc-kv-row">
                <span class="doc-kv-key"><i class="fa fa-clock" style="width:14px;color:#94a3b8;"></i> Est. Duration</span>
                <span class="doc-kv-val"><?php echo htmlspecialchars($durationHint); ?></span>
            </div>
            <?php endif; ?>
            <?php if ($travelDateFmt): ?>
            <div class="doc-kv-row">
                <span class="doc-kv-key"><i class="fa fa-calendar" style="width:14px;color:#94a3b8;"></i> Start Date</span>
                <span class="doc-kv-val"><?php echo htmlspecialchars($travelDateFmt . ($travelTimeFmt ? ' at ' . $travelTimeFmt : '')); ?></span>
            </div>
            <?php endif; ?>
            <?php if ($endDateFmt && $serviceType === 'round_trip'): ?>
            <div class="doc-kv-row">
                <span class="doc-kv-key"><i class="fa fa-calendar-check" style="width:14px;color:#94a3b8;"></i> Return Date</span>
                <span class="doc-kv-val"><?php echo htmlspecialchars($endDateFmt . ($dropTimeFmt ? ' at ' . $dropTimeFmt : '')); ?></span>
            </div>
            <?php endif; ?>
            <?php if ($serviceType === 'round_trip' && $tripDays > 1): ?>
            <div class="doc-kv-row">
                <span class="doc-kv-key"><i class="fa fa-moon" style="width:14px;color:#94a3b8;"></i> Trip Days</span>
                <span class="doc-kv-val"><?php echo $tripDays; ?> days</span>
            </div>
            <?php endif; ?>
            <div class="doc-kv-row" style="border-bottom:none;padding-top:0.5rem;border-top:1px solid var(--border);margin-top:0.35rem;">
                <span class="doc-kv-key" style="font-weight:700;color:var(--navy);"><i class="fa fa-indian-rupee-sign" style="width:14px;color:#94a3b8;"></i> Total Fare</span>
                <span class="doc-kv-val highlight">
                    <?php if ($isAllVehicles): ?>
                        Multiple Options (See below)
                    <?php else: ?>
                        ₹<?php echo number_format($grandTotal); ?>
                    <?php endif; ?>
                </span>
            </div>
        </div>
    </div>

    <!-- ── ROUTE ─────────────────────────────────────────────────────── -->
    <div class="doc-route">
        <!-- Pickup + Drop row -->
        <div class="doc-route-row">
            <div class="doc-route-point">
                <span class="doc-route-pt-label">Pickup Location</span>
                <div class="doc-route-pt-name">
                    <span class="rp-dot rp-dot-start" style="width:10px;height:10px;display:inline-block;border-radius:50%;flex-shrink:0;"></span>
                    <?php echo htmlspecialchars($pickup); ?>
                </div>
            </div>
            <div class="doc-route-divider">
                <i class="fa fa-chevron-right"></i>
                <?php if ($serviceType === 'round_trip'): ?>
                <i class="fa fa-chevron-left" style="color:var(--gold2);"></i>
                <?php endif; ?>
            </div>
            <div class="doc-route-point doc-route-point-right">
                <span class="doc-route-pt-label">Drop Destination</span>
                <div class="doc-route-pt-name">
                    <?php echo htmlspecialchars($drop); ?>
                    <span class="rp-dot rp-dot-end" style="width:10px;height:10px;display:inline-block;border-radius:50%;flex-shrink:0;"></span>
                </div>
                <?php if ($serviceType === 'round_trip'): ?>
                <div style="font-size:0.68rem;color:var(--gold2);font-weight:600;margin-top:3px;text-align:right;">
                    <i class="fa fa-rotate-right"></i> Returns to pickup
                </div>
                <?php endif; ?>
            </div>
        </div>

        <?php if (!empty($stops)): ?>
        <!-- Intermediate stops -->
        <div class="doc-route-stops-row">
            <span class="doc-route-stops-label"><i class="fa fa-map-pin"></i> Intermediate Stops</span>
            <div class="doc-route-stops-list">
                <?php foreach ($stops as $i => $stop): ?>
                <div class="doc-route-stop-item">
                    <span class="doc-stop-num"><?php echo $i + 1; ?></span>
                    <?php echo htmlspecialchars($stop); ?>
                </div>
                <?php endforeach; ?>
            </div>
        </div>
        <?php endif; ?>
    </div>

    <?php if (!empty($customerName) || !empty($customerPhone)): ?>
    <!-- ── CUSTOMER DETAIL STRIP (between Trip Details & Fare Breakdown) ── -->
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 0.65rem 1rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap;">
        <span style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; white-space: nowrap;">
            <i class="fa fa-user-circle" style="color: #94a3b8; margin-right: 4px;"></i> Passenger
        </span>
        <?php if (!empty($customerName)): ?>
        <span style="font-size: 0.88rem; font-weight: 700; color: #1e293b;">
            <?php echo htmlspecialchars($customerName); ?>
        </span>
        <?php endif; ?>
        <?php if (!empty($customerPhone)): ?>
        <span style="font-size: 0.82rem; color: #475569; display: flex; align-items: center; gap: 5px;">
            <i class="fa fa-phone" style="color: #94a3b8; font-size: 0.78rem;"></i>
            <?php echo htmlspecialchars($customerPhone); ?>
        </span>
        <?php endif; ?>
    </div>
    <?php endif; ?>

    <!-- ── FARE BREAKDOWN TABLE ───────────────────────────────────────── -->
    <div class="doc-breakdown">
        <div class="doc-breakdown-title"><i class="fa fa-calculator" style="color:var(--gold2);"></i> Fare Breakdown</div>
        
        <?php if ($isAllVehicles): ?>
        <table class="fare-table">
            <thead>
                <tr>
                    <th style="width:22%">Vehicle Class</th>
                    <th style="width:25%">Rate &amp; Distance</th>
                    <th style="width:15%; text-align:right;">Base KM Fare</th>
                    <th style="width:13%; text-align:right;">Driver Bata</th>
                    <th style="width:13%; text-align:right;">Other Charges*</th>
                    <th style="width:12%; text-align:right;">Grand Total</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($allVehicles as $vk): 
                    $est = $vehicleEstimates[$vk] ?? [];
                    if (empty($est)) continue;
                    $vkExtras = $est['nightAllow'] + $est['parkingCharge'] + $est['waitingCharge'];
                    $vkTollsTaxes = $est['tollTotal'] + $est['taxTotal'];
                    $otherCharges = $vkExtras + $vkTollsTaxes;
                ?>
                <tr>
                    <td class="col-item" style="font-weight:800; color:var(--navy); font-size:0.88rem;">
                        <i class="fa fa-car" style="color:#94a3b8; margin-right:6px; font-size:0.8rem;"></i><?php echo $vk; ?>
                    </td>
                    <td class="col-detail" style="font-size:0.78rem;">
                        ₹<?php echo number_format($est['perKmRate'], 1); ?>/km &times; <?php echo number_format($est['effectiveKm'], 0); ?> km
                    </td>
                    <td class="col-amount" style="font-weight:600; font-size:0.82rem;">₹<?php echo number_format($est['kmCharge']); ?></td>
                    <td class="col-amount" style="font-weight:600; font-size:0.82rem;">₹<?php echo number_format($est['driverBata']); ?></td>
                    <td class="col-amount" style="font-weight:600; font-size:0.82rem; color:var(--slate);">
                        <?php echo $otherCharges > 0 ? '₹' . number_format($otherCharges) : '—'; ?>
                    </td>
                    <td class="col-amount" style="font-weight:800; color:var(--green); font-size:0.92rem;">
                        ₹<?php echo number_format($est['grandTotal']); ?>
                    </td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
        <div style="font-size:0.68rem; color:var(--slate); margin-top:0.5rem; text-align:left; font-weight:500; font-style:italic;">
            * Other Charges includes applicable Tolls, State Border Taxes, Night Allowances, Parking, and Waiting charges.
        </div>
        <?php else: ?>
        <table class="fare-table">
            <thead>
                <tr>
                    <th style="width:40%">Item</th>
                    <th style="width:35%">Details</th>
                    <th style="width:25%">Amount</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="col-item"><i class="fa fa-gauge-high" style="color:#94a3b8;width:16px;"></i> Base KM Charge</td>
                    <td class="col-detail">
                        <?php echo number_format($effectiveKm, 0); ?> km
                        × ₹<?php echo number_format($perKmRate, 0); ?>/km
                    </td>
                    <td class="col-amount">₹<?php echo number_format($kmCharge); ?></td>
                </tr>

                <!-- Driver Bata -->
                <tr>
                    <td class="col-item"><i class="fa fa-user-tie" style="color:#94a3b8;width:16px;"></i> Driver Allowance</td>
                    <td class="col-detail">
                        <?php if ($tripDays > 1 && $driverBataPerDay > 0): ?>
                            <?php echo $tripDays; ?> day<?php echo $tripDays > 1 ? 's' : ''; ?> &times; &#8377;<?php echo number_format($driverBataPerDay, 0); ?>/day
                        <?php endif; ?>
                    </td>
                    <td class="col-amount">₹<?php echo number_format($driverBata); ?></td>
                </tr>

                <?php if ($nightAllow > 0): ?>
                <!-- Night Allowance -->
                <tr>
                    <td class="col-item"><i class="fa fa-moon" style="color:#94a3b8;width:16px;"></i> Night Allowance</td>
                    <td class="col-detail"></td>
                    <td class="col-amount">₹<?php echo number_format($nightAllow); ?></td>
                </tr>
                <?php endif; ?>

                <?php if ($parkingCharge > 0): ?>
                <!-- Parking -->
                <tr>
                    <td class="col-item"><i class="fa fa-square-p" style="color:#94a3b8;width:16px;"></i> Parking Charges</td>
                    <td class="col-detail"></td>
                    <td class="col-amount">₹<?php echo number_format($parkingCharge); ?></td>
                </tr>
                <?php endif; ?>

                <?php if ($waitingCharge > 0): ?>
                <!-- Waiting -->
                <tr>
                    <td class="col-item"><i class="fa fa-hourglass-half" style="color:#94a3b8;width:16px;"></i> Waiting Charges</td>
                    <td class="col-detail"></td>
                    <td class="col-amount">₹<?php echo number_format($waitingCharge); ?></td>
                </tr>
                <?php endif; ?>

                <!-- Subtotal -->
                <tr class="subtotal">
                    <td class="col-item" colspan="2">Sub-total (Base Fare)</td>
                    <td class="col-amount">₹<?php echo number_format($baseTotal); ?></td>
                </tr>

                <!-- Tolls -->
                <tr>
                    <td class="col-item"><i class="fa fa-road" style="color:#94a3b8;width:16px;"></i> Highway Tolls</td>
                    <?php if ($includeTolls && $tollTotal > 0): ?>
                        <td class="col-detail"></td>
                        <td class="col-amount">₹<?php echo number_format($tollTotal); ?></td>
                    <?php elseif ($includeTolls): ?>
                        <td class="col-detail"></td>
                        <td class="col-amount dash">—</td>
                    <?php else: ?>
                        <td class="col-detail"></td>
                        <td class="col-amount dash">—</td>
                    <?php endif; ?>
                </tr>

                <!-- State Entry Tax -->
                <tr>
                    <td class="col-item"><i class="fa fa-building-flag" style="color:#94a3b8;width:16px;"></i> State Entry Tax</td>
                    <?php if ($includeTaxes && $taxTotal > 0): ?>
                        <td class="col-detail"><?php echo $taxCount; ?> crossing<?php echo $taxCount > 1 ? 's' : ''; ?></td>
                        <td class="col-amount">₹<?php echo number_format($taxTotal); ?></td>
                    <?php else: ?>
                        <td class="col-detail"></td>
                        <td class="col-amount dash">—</td>
                    <?php endif; ?>
                </tr>

                <!-- Grand Total -->
                <tr class="grand-total">
                    <td class="col-item" colspan="2">
                        <i class="fa fa-star" style="color:var(--gold);margin-right:6px;font-size:0.8rem;"></i>
                        Grand Total
                    </td>
                    <td class="col-amount">₹<?php echo number_format($grandTotal); ?></td>
                </tr>
            </tbody>
        </table>
        <?php endif; ?>
    </div>

    </div>

    <!-- ── INCLUSIONS / EXCLUSIONS ────────────────────────────────────── -->
    <div class="doc-policy-grid">
        <!-- Inclusions -->
        <div class="doc-policy-cell">
            <div class="doc-section-label" style="color:var(--green);">
                <i class="fa fa-circle-check"></i> What's Included
            </div>
            <ul class="policy-list">
                <?php foreach ($inclusions as $inc): ?>
                <li><i class="fa fa-check inc"></i><?php echo $inc; ?></li>
                <?php endforeach; ?>
            </ul>
        </div>

        <!-- Exclusions -->
        <div class="doc-policy-cell">
            <div class="doc-section-label" style="color:var(--red);">
                <i class="fa fa-circle-xmark"></i> Not Included / Extra
            </div>
            <ul class="policy-list">
                <?php foreach ($exclusions as $exc): ?>
                <li>
                    <i class="fa fa-xmark exc"></i>
                    <span>
                        <?php echo htmlspecialchars($exc['item']); ?>
                        <span class="exc-note"><?php echo htmlspecialchars($exc['note']); ?></span>
                    </span>
                </li>
                <?php endforeach; ?>
            </ul>
        </div>
    </div>

    <?php if (!empty($dispatcherNotes)): ?>
    <!-- ── DISPATCHER NOTES ──────────────────────────────────────────── -->
    <div class="doc-notes">
        <i class="fa fa-sticky-note"></i>
        <p><strong>Note:</strong> <?php echo htmlspecialchars($dispatcherNotes); ?></p>
    </div>
    <?php endif; ?>

    <!-- ── TERMS & CONDITIONS ─────────────────────────────────────────── -->
    <div class="doc-terms">
        <div class="doc-terms-title"><i class="fa fa-file-contract" style="color:var(--gold2);"></i> Terms &amp; Conditions</div>
        <ul class="doc-terms-list">
            <li>This is an estimated fare. Actual charges may vary based on route conditions.</li>
            <li>Quotation valid for 7 days from the date of issue.</li>
            <li>Extra km beyond the minimum limit will be charged at the applicable per-km rate.</li>
            <li>Waiting charges apply after 30 minutes of grace period.</li>
            <li>Driver night allowance applies for outstation halts.</li>
            <li>Fare may be revised for travel on public holidays or long weekends.</li>
            <li>No refund on cancellation within 24 hours of scheduled pickup.</li>
            <li>Parking and toll (if not inclusive) will be charged at actuals.</li>
        </ul>
    </div>

    <!-- ── SIGNATURE AREA ─────────────────────────────────────────────── -->
    <div class="doc-signature">
        <div class="sig-block">
            <div class="sig-line"></div>
            <div class="sig-label">Prepared by (Drop Cars)</div>
        </div>
        <div class="sig-block">
            <div class="sig-line"></div>
            <div class="sig-label">Customer Acknowledgement</div>
        </div>
        <div class="sig-block">
            <div class="sig-line"></div>
            <div class="sig-label">Date</div>
        </div>
    </div>

    <!-- ── FOOTER ─────────────────────────────────────────────────────── -->
    <div class="doc-footer">
        <div class="doc-footer-left">
            <strong>Drop Cars</strong> · Outstation Cab &amp; Tour Services<br>
            www.dropcars.in · <?php echo htmlspecialchars($printSupportPhone); ?> · bookings@dropcars.in
        </div>
        <div class="doc-footer-right">
            <?php echo htmlspecialchars($quoteRef); ?> · Generated <?php echo $quoteDate; ?><br>
            <span style="color:#334155;">This is a computer-generated quotation.</span>
        </div>
    </div>

</div><!-- .quotation-doc -->
</div><!-- .quotation-wrapper -->

<?php if (isset($_GET['autoprint']) && $_GET['autoprint'] === '1'): ?>
<script>
    window.addEventListener('load', function() {
        setTimeout(function() {
            window.print();
        }, 300);
    });
</script>
<?php endif; ?>

<script>
// Load html2pdf dynamically to avoid blocking page load
function loadHtml2Pdf() {
    return new Promise((resolve, reject) => {
        if (window.html2pdf) {
            resolve(window.html2pdf);
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
        script.onload = () => resolve(window.html2pdf);
        script.onerror = () => reject(new Error('Failed to load html2pdf library'));
        document.head.appendChild(script);
    });
}

function shareQuotationPdf() {
    const triggerBtn = document.querySelector('.btn-share-trigger');
    const originalHtml = triggerBtn.innerHTML;
    triggerBtn.disabled = true;
    triggerBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Generating PDF...';
    
    // Close menu
    document.querySelector('.share-dropdown-menu').classList.remove('show');

    loadHtml2Pdf().then(html2pdf => {
        const element = document.querySelector('.quotation-doc');
        const quoteRef = <?php echo json_encode($quoteRef); ?>.replace('#', '');
        const opt = {
            margin:       [10, 10, 10, 10],
            filename:     'DropCars_Quotation_' + quoteRef + '.pdf',
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { 
                scale: 2, 
                useCORS: true,
                letterRendering: true
            },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        element.classList.add('pdf-rendering-active');
        return html2pdf().set(opt).from(element).outputPdf('blob');
    }).then(pdfBlob => {
        document.querySelector('.quotation-doc').classList.remove('pdf-rendering-active');
        
        const quoteRef = <?php echo json_encode($quoteRef); ?>.replace('#', '');
        const fileName = 'DropCars_Quotation_' + quoteRef + '.pdf';
        const file = new File([pdfBlob], fileName, { type: "application/pdf" });
        
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            return navigator.share({
                files: [file],
                title: 'Fare Quotation ' + <?php echo json_encode($quoteRef); ?>,
                text: 'Here is the fare quotation from Drop Cars for your trip.'
            });
        } else {
            // Web Share file sharing is not supported on this browser (desktop/unsupported)
            triggerBtn.disabled = false;
            triggerBtn.innerHTML = originalHtml;
            
            // Trigger download as fallback
            const link = document.createElement('a');
            link.href = URL.createObjectURL(pdfBlob);
            link.download = fileName;
            link.click();
            
            alert("Web sharing is not supported on this device/browser. The PDF has been downloaded to your device so you can share it manually on WhatsApp.");
        }
    }).then(() => {
        triggerBtn.disabled = false;
        triggerBtn.innerHTML = originalHtml;
    }).catch(err => {
        console.error('PDF sharing error:', err);
        document.querySelector('.quotation-doc').classList.remove('pdf-rendering-active');
        triggerBtn.disabled = false;
        triggerBtn.innerHTML = originalHtml;
        alert('An error occurred while generating or sharing the PDF.');
    });
}

function shareQuotationLink() {
    // Close menu
    document.querySelector('.share-dropdown-menu').classList.remove('show');
    
    const url = new URL(window.location.href);
    url.searchParams.delete('autoprint');
    const shareUrl = url.toString();
    
    const pickup = <?php echo json_encode($pickup); ?>;
    const drop = <?php echo json_encode($drop); ?>;
    const quoteRef = <?php echo json_encode($quoteRef); ?>;
    const grandTotal = <?php echo json_encode($grandTotal); ?>;
    const serviceLabel = <?php echo json_encode($serviceLabel); ?>;
    const selectedVehicle = <?php echo json_encode($selectedVehicle); ?>;
    
    const msg = `*Fare Quotation ${quoteRef}* from *Drop Cars*\n\n` +
                `*Trip Type:* ${serviceLabel}\n` +
                `*Vehicle:* ${selectedVehicle}\n` +
                `*Route:* ${pickup} ➔ ${drop}\n` +
                `*Total Fare:* ₹${Number(grandTotal).toLocaleString('en-IN')}\n\n` +
                `View full details and itinerary here:\n${shareUrl}`;

    const encodedMsg = encodeURIComponent(msg);
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodedMsg}`;
    window.open(whatsappUrl, '_blank');
}

// Dropdown toggle logic
document.addEventListener('DOMContentLoaded', function() {
    const trigger = document.querySelector('.btn-share-trigger');
    const menu = document.querySelector('.share-dropdown-menu');
    
    if (trigger && menu) {
        trigger.addEventListener('click', function(e) {
            e.stopPropagation();
            menu.classList.toggle('show');
        });
        
        document.addEventListener('click', function() {
            menu.classList.remove('show');
        });
    }
});
</script>

</body>
</html>
<?php exit; ?>
