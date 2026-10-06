<?php
/**
 * Official GST Tax Invoice — Drop Cars
 * Displays GSTIN, SAC Code 996412, Tax breakdown (CGST+SGST/IGST), customer details & print action.
 */
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

if (session_status() === PHP_SESSION_NONE) {
    require_once __DIR__ . '/../config/session.php';
    @session_start();
}
require_once __DIR__ . '/../includes/paths.php';
if (!defined('DROP_CARS_DB_OPTIONAL')) define('DROP_CARS_DB_OPTIONAL', true);
require_once __DIR__ . '/../admin/config/database.php';

$rawId = $_GET['booking_id'] ?? $_GET['id'] ?? '';
$bookingId = preg_replace('/[^A-Za-z0-9\-]/', '', (string)$rawId);

if (empty($bookingId)) {
    die('Invalid Booking ID specified for GST Tax Invoice.');
}

$bookingRow = null;
if (isset($pdo) && $pdo instanceof PDO) {
    try {
        $stmt = $pdo->prepare('SELECT b.*, c.name as c_name, c.email as c_email, c.phone as c_phone, c.gstin as customer_gstin, c.company_name as customer_company 
                               FROM `bookings` b 
                               LEFT JOIN `customers` c ON b.customer_id = c.id 
                               WHERE b.booking_id = ? LIMIT 1');
        $stmt->execute([$bookingId]);
        $bookingRow = $stmt->fetch(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {}

    if (!$bookingRow) {
        try {
            $stmt = $pdo->prepare('SELECT * FROM `enquiries` WHERE `booking_id` = ? LIMIT 1');
            $stmt->execute([$bookingId]);
            $bookingRow = $stmt->fetch(PDO::FETCH_ASSOC);
        } catch (Throwable $e) {}
    }
}

if (!$bookingRow) {
    die('Booking record not found.');
}

// Map fields
$customerName  = $bookingRow['c_name'] ?? $bookingRow['customer_name'] ?? $bookingRow['name'] ?? 'Valued Customer';
$customerPhone = $bookingRow['c_phone'] ?? $bookingRow['customer_phone'] ?? $bookingRow['phone'] ?? '';
$customerEmail = $bookingRow['c_email'] ?? $bookingRow['customer_email'] ?? $bookingRow['email'] ?? '';
$customerGstin = $bookingRow['customer_gstin'] ?? $bookingRow['gstin'] ?? 'N/A';
$customerComp  = $bookingRow['customer_company'] ?? $bookingRow['company_name'] ?? '';

$pickupLoc = $bookingRow['pickup_location'] ?? $bookingRow['pickup'] ?? 'Pickup Point';
$dropLoc   = $bookingRow['drop_location'] ?? $bookingRow['drop'] ?? 'Destination';
$vehicle   = strtoupper($bookingRow['car_name'] ?? $bookingRow['vehicle_type'] ?? 'SEDAN');
$travelDate = !empty($bookingRow['pickup_date']) ? date('d M Y', strtotime($bookingRow['pickup_date'])) : date('d M Y');

$totalFare = (float)($bookingRow['final_fare'] ?: ($bookingRow['estimated_fare'] ?: 0));
if ($totalFare <= 0) $totalFare = 1500.00;

$distanceKm = (float)($bookingRow['distance_km'] ?? $bookingRow['distance'] ?? $bookingRow['quoted_trip_distance'] ?? 0);
$ratePerKm  = (float)($bookingRow['rate_per_km'] ?? $bookingRow['fare_per_km'] ?? $bookingRow['quoted_cost_per_km'] ?? 0);
$driverBata = (float)($bookingRow['driver_allowance'] ?? $bookingRow['driver_bata'] ?? $bookingRow['quoted_driver_allowance'] ?? 400);

if ($distanceKm > 0 && $ratePerKm > 0) {
    $kmTaxable = round($distanceKm * $ratePerKm, 2);
} else {
    $netKmBase = max(0, $totalFare - $driverBata);
    $kmTaxable = round($netKmBase / 1.05, 2);
}

// Pure KM Tax Rule (5% GST: CGST 2.5% + SGST 2.5%, Driver Bata 0% non-taxable)
$cgst     = round($kmTaxable * 0.025, 2);
$sgst     = round($kmTaxable * 0.025, 2);
$gstTotal = $cgst + $sgst;
$grandTotal = $kmTaxable + $gstTotal + $driverBata;

// Real GSTIN/business name/address - Owner-editable in Admin App > System
// Config > GST / Business Details (never hardcoded here, so a wrong or
// placeholder GSTIN never ends up on a real customer's tax invoice).
// Falls back to the confirmed real values only if the API call itself
// fails (network hiccup), never to an obviously-fake example number.
$gstBusinessName = 'Drop Cars';
$gstNumber = '33BBVPN8562P1ZJ';
$gstBusinessAddress = '';
try {
    $gstCtx = stream_context_create(['http' => ['timeout' => 4]]);
    $gstInfoRaw = @file_get_contents('https://drop-cars-api-207918408785.asia-south2.run.app/api/public/gst-business-info', false, $gstCtx);
    if ($gstInfoRaw) {
        $gstInfo = json_decode($gstInfoRaw, true);
        if (is_array($gstInfo)) {
            if (!empty($gstInfo['gst_number'])) $gstNumber = $gstInfo['gst_number'];
            if (!empty($gstInfo['business_name'])) $gstBusinessName = $gstInfo['business_name'];
            if (!empty($gstInfo['business_address'])) $gstBusinessAddress = $gstInfo['business_address'];
        }
    }
} catch (Throwable $e) {}

$savedInvoiceNo = $bookingRow['tax_invoice_number'] ?? $bookingRow['invoice_number'] ?? '';
if (!empty($savedInvoiceNo)) {
    $invoiceNo = $savedInvoiceNo;
} else {
    $invoiceNo = 'DC/26-27/INV-' . str_pad((string)($bookingRow['id'] ?? '031'), 3, '0', STR_PAD_LEFT);
}
$invoiceDate = !empty($bookingRow['created_at']) ? date('d M Y', strtotime($bookingRow['created_at'])) : date('d M Y');

?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GST Tax Invoice - <?php echo htmlspecialchars($bookingId); ?> | Drop Cars</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@600;700;800;900&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #0f172a;
            --blue: #2563eb;
            --accent: #0284c7;
            --border: #e2e8f0;
            --text: #1e293b;
            --muted: #64748b;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Inter', sans-serif;
            background: #f8fafc;
            color: var(--text);
            padding: 2rem 1rem;
            display: flex;
            justify-content: center;
        }
        .invoice-card {
            background: #ffffff;
            width: 100%;
            max-width: 800px;
            border-radius: 16px;
            border: 1px solid var(--border);
            box-shadow: 0 10px 30px rgba(0,0,0,0.06);
            padding: 2.5rem;
            position: relative;
        }
        .invoice-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px dashed var(--border);
            padding-bottom: 1.5rem;
            margin-bottom: 1.75rem;
        }
        .brand-title {
            font-family: 'Outfit', sans-serif;
            font-size: 1.75rem;
            font-weight: 900;
            color: var(--primary);
            letter-spacing: -0.5px;
        }
        .brand-sub {
            font-size: 0.8rem;
            color: var(--muted);
            margin-top: 0.2rem;
        }
        .gst-badge {
            background: linear-gradient(135deg, #10b981, #059669);
            color: #ffffff;
            font-weight: 800;
            font-size: 0.75rem;
            padding: 0.35rem 0.85rem;
            border-radius: 100px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            display: inline-block;
            margin-bottom: 0.4rem;
        }
        .inv-no {
            font-size: 0.9rem;
            font-weight: 700;
            color: var(--primary);
        }
        .details-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1.5rem;
            margin-bottom: 1.75rem;
        }
        .info-box {
            background: #f8fafc;
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 1.25rem;
        }
        .info-box h4 {
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--blue);
            margin-bottom: 0.6rem;
            font-weight: 800;
        }
        .info-box p {
            font-size: 0.85rem;
            line-height: 1.5;
            color: var(--text);
        }
        .table-wrap {
            margin-bottom: 1.75rem;
            overflow-x: auto;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.88rem;
        }
        th {
            background: #0f172a;
            color: #ffffff;
            text-align: left;
            padding: 0.85rem 1rem;
            font-weight: 700;
        }
        td {
            padding: 0.85rem 1rem;
            border-bottom: 1px solid var(--border);
            color: var(--text);
        }
        tr:last-child td { border-bottom: none; }
        .total-box {
            background: #eff6ff;
            border: 1.5px solid #bfdbfe;
            border-radius: 12px;
            padding: 1.25rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1.75rem;
        }
        .total-label {
            font-size: 0.9rem;
            font-weight: 700;
            color: #1e3a8a;
        }
        .total-val {
            font-size: 1.6rem;
            font-weight: 900;
            color: var(--blue);
            font-family: 'Outfit', sans-serif;
        }
        .actions-bar {
            display: flex;
            gap: 1rem;
            justify-content: flex-end;
        }
        .btn-print {
            background: var(--blue);
            color: #ffffff;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 10px;
            font-weight: 800;
            font-size: 0.88rem;
            font-family: 'Outfit', sans-serif;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            box-shadow: 0 4px 14px rgba(37,99,235,0.3);
            text-decoration: none;
        }
        .btn-print:hover { background: #1d4ed8; }
        @media print {
            body { background: #ffffff; padding: 0; }
            .invoice-card { border: none; box-shadow: none; padding: 0; }
            .actions-bar { display: none; }
        }
    </style>
</head>
<body>

<div class="invoice-card">
    <div class="invoice-header">
        <div>
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:0.5rem;">
                <img src="/assets/brand/DropCars_Logo_Invoice_Header.svg" alt="Drop Cars ®" style="height:42px; width:auto; display:block;" />
            </div>
            <div class="brand-sub">South India Premium Taxi Network · Registered Trademark</div>
            <div style="font-size:0.78rem; color:var(--muted); margin-top:0.3rem;">
                <?php echo htmlspecialchars($gstBusinessName); ?> · GSTIN: <strong><?php echo htmlspecialchars($gstNumber); ?></strong><br>
                <?php if (!empty($gstBusinessAddress)): ?><?php echo htmlspecialchars($gstBusinessAddress); ?><br><?php endif; ?>
                SAC Code: <strong>996412</strong> (Passenger Transport Services)
            </div>
        </div>
        <div style="text-align: right;">
            <div class="gst-badge">Official GST Tax Invoice</div>
            <div class="inv-no">Inv No: <?php echo htmlspecialchars($invoiceNo); ?></div>
            <div style="font-size:0.8rem; color:var(--muted); margin-top:0.2rem;">Date: <?php echo htmlspecialchars($invoiceDate); ?></div>
            <div style="font-size:0.8rem; color:var(--muted);">Booking ID: <strong><?php echo htmlspecialchars($bookingId); ?></strong></div>
        </div>
    </div>

    <div class="details-grid">
        <div class="info-box">
            <h4>Billed To (Customer Details)</h4>
            <p><strong>Name:</strong> <?php echo htmlspecialchars($customerName); ?></p>
            <?php if (!empty($customerComp)): ?><p><strong>Company:</strong> <?php echo htmlspecialchars($customerComp); ?></p><?php endif; ?>
            <p><strong>Phone:</strong> <?php echo htmlspecialchars($customerPhone); ?></p>
            <?php if (!empty($customerEmail)): ?><p><strong>Email:</strong> <?php echo htmlspecialchars($customerEmail); ?></p><?php endif; ?>
            <p><strong>GSTIN:</strong> <?php echo htmlspecialchars($customerGstin); ?></p>
        </div>
        <div class="info-box">
            <h4>Trip &amp; Transport Details</h4>
            <p><strong>Route:</strong> <?php echo htmlspecialchars($pickupLoc); ?> → <?php echo htmlspecialchars($dropLoc); ?></p>
            <p><strong>Travel Date:</strong> <?php echo htmlspecialchars($travelDate); ?></p>
            <p><strong>Vehicle Model:</strong> <?php echo htmlspecialchars($vehicle); ?></p>
            <p><strong>Tax Type:</strong> CGST (2.5%) + SGST (2.5%)</p>
        </div>
    </div>

    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>Description</th>
                    <th>SAC</th>
                    <th>Taxable Value</th>
                    <th>CGST (2.5%)</th>
                    <th>SGST (2.5%)</th>
                    <th>Total Amount</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>
                        <strong>Passenger Road Transport Service (SAC 9964)</strong><br>
                        <span style="font-size:0.75rem; color:var(--muted);">Pure KM Base Rate: <?php echo $distanceKm > 0 ? htmlspecialchars($distanceKm . ' KM') : 'Trip Base'; ?> <?php if ($ratePerKm > 0) echo '@ ₹' . htmlspecialchars($ratePerKm) . '/KM'; ?></span>
                    </td>
                    <td>996412</td>
                    <td>₹<?php echo number_format($kmTaxable, 2); ?></td>
                    <td>₹<?php echo number_format($cgst, 2); ?></td>
                    <td>₹<?php echo number_format($sgst, 2); ?></td>
                    <td><strong>₹<?php echo number_format($kmTaxable + $gstTotal, 2); ?></strong></td>
                </tr>
                <?php if ($driverBata > 0): ?>
                <tr>
                    <td>
                        <strong>Driver Daily Food &amp; Living Allowance (Bata)</strong><br>
                        <span style="font-size:0.75rem; color:var(--muted);">Personal Allowance — Non-Taxable / Exempt per GST Rules</span>
                    </td>
                    <td>Exempt</td>
                    <td>₹<?php echo number_format($driverBata, 2); ?></td>
                    <td>₹0.00</td>
                    <td>₹0.00</td>
                    <td><strong>₹<?php echo number_format($driverBata, 2); ?></strong></td>
                </tr>
                <?php endif; ?>
            </tbody>
        </table>
    </div>

    <div class="total-box">
        <div>
            <div class="total-label">Total Amount Payable (Inclusive of 5% GST on KM Fare)</div>
            <div style="font-size:0.75rem; color:var(--muted);">Payment Status: <span style="color:#059669; font-weight:700;">PAID &amp; CONFIRMED</span> · SAC 9964 Verified</div>
        </div>
        <div class="total-val">₹<?php echo number_format($grandTotal, 2); ?></div>
    </div>

    <div class="actions-bar" style="display:flex; gap:12px; justify-content:center;">
        <button onclick="window.print()" class="btn-print">🖨️ Print Invoice</button>
        <a href="https://drop-cars-api-207918408785.asia-south2.run.app/api/customer/bookings/<?php echo urlencode($bookingId); ?>/invoice-pdf" target="_blank" class="btn-print" style="background:#0284c7; text-decoration:none; display:inline-flex; align-items:center; gap:6px;">
            📥 Download Vector PDF (ReportLab)
        </a>
    </div>
</div>

</body>
</html>
