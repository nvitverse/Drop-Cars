<?php
/**
 * Printable invoice for a completed booking (admin).
 */
$bookingIdParam = isset($_GET['id']) ? (int) $_GET['id'] : 0;
if ($bookingIdParam <= 0) {
    header('Location: ' . admin_url('bookings'));
    exit;
}

$stmt = $pdo->prepare(
    'SELECT b.*, c.name AS customer_name, c.phone AS customer_phone
     FROM `bookings` b
     JOIN `customers` c ON b.customer_id = c.id
     WHERE b.id = ?'
);
$stmt->execute([$bookingIdParam]);
$inv = $stmt->fetch();
if (!$inv) {
    header('Location: ' . admin_url('bookings'));
    exit;
}

$bid = $inv['booking_id'] ?: ('#' . $inv['id']);
$tripLabels = ['oneway' => 'One-way', 'round' => 'Round trip', 'multi' => 'Multi-city'];
$tripLabel = $tripLabels[$inv['trip_type'] ?? 'oneway'] ?? strtoupper((string) ($inv['trip_type'] ?? ''));
$driverName = trim((string) ($inv['driver_name'] ?? ($inv['driver'] ?? '')));
$driverContact = trim((string) ($inv['driver_phone'] ?? ($inv['driver_contact'] ?? '')));
$cabName = trim((string) ($inv['car_name'] ?? ''));
$cabNumber = trim((string) ($inv['car_number'] ?? ''));

// Load settings config to default GSTIN if not supplied in GET
$configPath = dirname(__DIR__) . '/api/config.php';
if (!is_file($configPath)) {
    $configPath = dirname(__DIR__) . '/api/config.example.php';
}
$config = is_file($configPath) ? (include $configPath) : [];
$pricingRules = $config['pricingRules'] ?? [];
$defaultGstin = $pricingRules['gstNumber'] ?? '';

// Manual Charge Inputs from GET
$toll = (float) ($_GET['toll'] ?? 0);
$parking = (float) ($_GET['parking'] ?? 0);
$stateTax = (float) ($_GET['state_tax'] ?? 0);
$waiting = (float) ($_GET['waiting'] ?? 0);
$hills = (float) ($_GET['hills'] ?? 0);
$night = (float) ($_GET['night'] ?? 0);
$extraCharges = (float) ($_GET['extra_charges'] ?? 0);
$received = $_GET['received'] ?? '';
$gst_udyam = $_GET['gst_udyam'] ?? '';

if ($gst_udyam === '' && $defaultGstin !== '') {
    $gst_udyam = 'GSTIN: ' . $defaultGstin;
}

$baseFare = (float) ($inv['base_fare'] ?? 0);
$discount = (float) ($inv['discount_amount'] ?? 0);

$includeGst = isset($inv['include_gst']) && (int)$inv['include_gst'] === 1;
$gstPercent = isset($inv['gst_percent']) ? (float)$inv['gst_percent'] : 5.00;

if (isset($_GET['gst_amount'])) {
    $gstAmount = (float)$_GET['gst_amount'];
} else {
    $gstAmount = $includeGst ? (float)($inv['gst_amount'] ?? ($baseFare * ($gstPercent / 100))) : 0.00;
}

// Calculate Total
$totalAmount = $baseFare + $gstAmount + $toll + $parking + $stateTax + $waiting + $hills + $night + $extraCharges - $discount;

echo "<title>Invoice ".htmlspecialchars($bid)."</title>";
?>

<style>
  :root {
    --primary-color: #f7b733;
    --secondary-color: #1a2b48;
    --text-main: #344767;
    --text-muted: #8392ab;
  }
  
  html, body { 
    margin: 0; padding: 0;
    font-family: Arial, sans-serif;
    color: var(--text-main);
  }

  @media print {
    @page { margin: 6mm; size: auto; }
    html, body {
      height: auto !important;
      overflow: visible !important;
      background: white !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      padding: 0 !important;
      font-size: 11px !important;
      line-height: 1.25 !important;
    }
    .sidebar, .admin-header, .mobile-header, .navbar, .no-print, .manual-entry-box, .main-footer, header, footer { display: none !important; }
    .main-content {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      overflow: visible !important;
    }
    .admin-content {
      max-width: none !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    .invoice-wrap {
      max-width: 100% !important;
      width: 100% !important;
      padding: 0 !important;
      margin: 0 !important;
      overflow: visible !important;
    }
    .invoice-sheet {
      box-shadow: none !important;
      border: none !important;
      border-radius: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      min-height: auto !important;
      overflow: visible !important;
      break-inside: auto;
      page-break-inside: auto;
    }
    .invoice-header {
      padding-bottom: 0.7rem !important;
      margin-bottom: 0.65rem !important;
      border-bottom-width: 1px !important;
    }
    .brand-block { max-width: 60% !important; }
    .brand-title { font-size: 1.15rem !important; }
    .brand-tagline { margin-top: 0.18rem !important; font-size: 0.58rem !important; }
    .invoice-id-block h1 { font-size: 1.45rem !important; }
    .invoice-gst { margin-top: 0.2rem !important; font-size: 0.56rem !important; }

    .bill-grid {
      gap: 0.45rem !important;
      margin-bottom: 0.55rem !important;
    }
    .info-group h4,
    .trip-table-title {
      padding: 0.28rem 0.5rem !important;
      font-size: 0.62rem !important;
      letter-spacing: 0.03em !important;
    }
    .info-group p,
    .trip-table th,
    .trip-table td {
      padding: 0.22rem 0.5rem !important;
      font-size: 0.67rem !important;
      line-height: 1.25 !important;
    }
    .charge-table { margin-bottom: 0.55rem !important; }
    .charge-table th {
      padding: 0.28rem 0.35rem !important;
      font-size: 0.62rem !important;
    }
    .charge-table td {
      padding: 0.25rem 0.35rem !important;
      font-size: 0.68rem !important;
      line-height: 1.2 !important;
    }
    .invoice-footer {
      margin-top: 0.55rem !important;
      gap: 0.65rem !important;
    }
    .vehicle-badge {
      min-width: 130px !important;
      padding: 0.45rem 0.55rem !important;
    }
    .totals-box { width: 220px !important; }
    .total-row {
      padding: 0.2rem 0 !important;
      font-size: 0.7rem !important;
    }
    .total-row.grand {
      margin-top: 0.25rem !important;
      padding-top: 0.4rem !important;
      font-size: 0.86rem !important;
    }
    .total-row.grand span:last-child { font-size: 1.02rem !important; }
    .received-highlight {
      padding: 0.38rem 0.58rem !important;
      margin-top: 0.4rem !important;
      font-size: 0.7rem !important;
    }
    .received-highlight span:last-child { font-size: 0.9rem !important; }

    .invoice-sheet > div[style*="margin-top: 3.5rem"] {
      margin-top: 0.75rem !important;
      padding-top: 0.45rem !important;
    }
    .invoice-sheet > p[style*="margin-top: 3rem"] {
      margin-top: 0.55rem !important;
      font-size: 0.7rem !important;
    }

    .bill-grid,
    .trip-table-wrap,
    .charge-table,
    .invoice-footer,
    .received-highlight {
      break-inside: avoid-page;
      page-break-inside: avoid;
    }
    .charge-table thead { display: table-header-group; }
    .charge-table tfoot { display: table-footer-group; }
  }

  .invoice-wrap { max-width: 800px; margin: 0 auto; padding: 2rem; }
  
  /* Manual Entry - Screen Only */
  .manual-entry-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1.5rem; margin-bottom: 2rem; }
  .manual-entry-box h2 { font-size: 0.9rem; margin-top: 0; margin-bottom: 1rem; color: var(--secondary-color); text-transform: uppercase; letter-spacing: 1px; }
  .grid-entry { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 1rem; }
  .entry-field { display: flex; flex-direction: column; gap: 0.35rem; }
  .entry-field label { font-size: 0.7rem; font-weight: bold; color: var(--text-muted); text-transform: uppercase; }
  .entry-field input { border: 1px solid #e2e8f0; padding: 0.4rem 0.6rem; border-radius: 6px; font-size: 0.85rem; }
  .invoice-toolbar.no-print { display: flex; gap: 0.5rem; justify-content: flex-end; margin-bottom: 1rem; }

  /* Invoice Main Styling */
  .invoice-sheet {
    background: #fff;
    border: 1px solid #f1f1f1;
    border-radius: 12px;
    padding: 3rem;
    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    min-height: 1000px;
  }
  
  .invoice-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #f8fafc;
    padding-bottom: 1.15rem;
    margin-bottom: 1.2rem;
    gap: 1rem;
  }
  .brand-block { max-width: 58%; }
  .brand-title { font-size: 2rem; font-weight: 800; color: var(--secondary-color); line-height: 1.05; letter-spacing: -0.01em; }
  .brand-title span { color: var(--primary-color); }
  .brand-tagline {
    margin: 0.42rem 0 0;
    font-size: 0.72rem;
    color: #6b7280;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .invoice-id-block { text-align: right; }
  .invoice-id-block h1 {
    margin: 0;
    font-size: 3.05rem;
    color: var(--secondary-color);
    font-weight: 900;
    letter-spacing: -0.02em;
    line-height: 0.9;
  }
  .invoice-gst {
    margin: 0.5rem 0 0;
    font-size: 0.72rem;
    font-weight: 800;
    color: #7a8ca9;
    letter-spacing: 0.015em;
  }

  .bill-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.25rem; }
  .info-group {
    border: 1px solid #dbe5f0;
    border-radius: 8px;
    overflow: hidden;
    background: #fff;
  }
  .info-group h4 {
    margin: 0;
    padding: 0.45rem 0.65rem;
    font-size: 0.72rem;
    text-transform: uppercase;
    color: var(--secondary-color);
    background: #f1f5f9;
    letter-spacing: 0.04em;
  }
  .info-group p {
    margin: 0;
    padding: 0.35rem 0.65rem;
    font-size: 0.8rem;
    border-top: 1px solid #edf2f7;
    line-height: 1.35;
  }
  .info-group p strong {
    color: var(--secondary-color);
    display: inline;
    margin: 0;
    font-size: 0.82rem;
  }

  .trip-table-wrap {
    border: 1px solid #dbe5f0;
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 1.25rem;
  }
  .trip-table-title {
    margin: 0;
    padding: 0.45rem 0.65rem;
    font-size: 0.72rem;
    text-transform: uppercase;
    color: var(--secondary-color);
    background: #f1f5f9;
    letter-spacing: 0.04em;
    font-weight: 700;
  }
  .trip-table {
    width: 100%;
    border-collapse: collapse;
  }
  .trip-table th,
  .trip-table td {
    font-size: 0.8rem;
    padding: 0.4rem 0.65rem;
    border-top: 1px solid #edf2f7;
    vertical-align: top;
  }
  .trip-table th {
    width: 28%;
    text-align: left;
    color: #64748b;
    font-weight: 700;
    background: #fcfdff;
  }
  .trip-table td {
    color: var(--secondary-color);
    font-weight: 600;
  }

  .charge-table { width: 100%; border-collapse: collapse; margin-bottom: 2rem; }
  .charge-table th {
    text-align: left;
    padding: 0.6rem 0.5rem;
    border-bottom: 2px solid #e2e8f0;
    font-size: 0.72rem;
    text-transform: uppercase;
    color: var(--text-muted);
    letter-spacing: 0.03em;
  }
  .charge-table td {
    padding: 0.55rem 0.5rem;
    border-bottom: 1px solid #f1f5f9;
    font-size: 0.84rem;
  }
  .charge-table .text-right { text-align: right; }

  .invoice-footer { display: flex; justify-content: flex-end; margin-top: 0.75rem; align-items: flex-start; gap: 1rem; }
  .vehicle-badge {
    border: 1px solid #e5e7eb;
    background: #fafafa;
    padding: 0.75rem 0.85rem;
    border-radius: 8px;
    min-width: 175px;
  }
  .vehicle-badge i { font-size: 1rem; margin-right: 0.4rem; color: var(--primary-color); }
  
  .totals-box { width: 300px; }
  .total-row { display: flex; justify-content: space-between; padding: 0.45rem 0; font-size: 0.84rem; }
  .total-row.grand { 
    border-top: 2px solid var(--secondary-color); 
    margin-top: 0.75rem; 
    padding-top: 1.25rem; 
    font-size: 1.2rem; 
    font-weight: 900; 
    color: var(--secondary-color); 
    display: flex; 
    justify-content: space-between; 
    align-items: center; 
  }
  .total-row.grand span:last-child { font-size: 1.45rem; letter-spacing: -0.02em; }
  .received-highlight { 
    background: #f0fdf4; 
    color: #166534; 
    padding: 0.85rem 1.25rem; 
    border-radius: 8px; 
    margin-top: 1.25rem; 
    border: 1px solid #bbf7d0; 
    display: flex; 
    justify-content: space-between; 
    align-items: center; 
    font-weight: bold;
    font-size: 0.95rem;
  }
  .received-highlight span:last-child { 
    font-size: 1.25rem; 
    color: #15803d; 
    text-shadow: 0 1px 0 rgba(255,255,255,0.5);
  }

  .terms-section { margin-top: 4rem; border-top: 1px solid #eee; padding-top: 2rem; display: grid; grid-template-columns: 2fr 1fr; gap: 2rem; }
  .terms-section h5 { margin: 0 0 0.5rem; font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; }
  .terms-section ul { padding: 0; margin: 0; list-style: none; font-size: 0.8rem; color: #777; line-height: 1.5; }
  .signature { text-align: right; }
  .sig-line { border-top: 1px solid #ccc; width: 180px; margin-left: auto; margin-top: 3rem; padding-top: 0.5rem; font-size: 0.8rem; font-weight: bold; }
</style>

<div class="invoice-wrap">
  <!-- Manual Entry Form (On Screen Only) -->
  <div class="manual-entry-box no-print">
    <h2><i class="fa fa-calculator"></i> Customize Invoice Charges</h2>
    <form method="GET" action="booking-invoice">
      <input type="hidden" name="id" value="<?php echo (int)$bookingIdParam; ?>">
      <div class="grid-entry">
        <div class="entry-field"><label>GST/UDYAM</label><input type="text" name="gst_udyam" value="<?php echo htmlspecialchars($gst_udyam); ?>" placeholder="Enter Optionally"></div>
        <div class="entry-field"><label>GST Amount</label><input type="number" name="gst_amount" step="0.01" value="<?php echo $gstAmount; ?>"></div>
        <div class="entry-field"><label>Toll Charges</label><input type="number" name="toll" step="0.01" value="<?php echo $toll; ?>"></div>
        <div class="entry-field"><label>Parking</label><input type="number" name="parking" step="0.01" value="<?php echo $parking; ?>"></div>
        <div class="entry-field"><label>State Tax</label><input type="number" name="state_tax" step="0.01" value="<?php echo $stateTax; ?>"></div>
        <div class="entry-field"><label>Waiting</label><input type="number" name="waiting" step="0.01" value="<?php echo $waiting; ?>"></div>
        <div class="entry-field"><label>Hills Charges</label><input type="number" name="hills" step="0.01" value="<?php echo $hills; ?>"></div>
        <div class="entry-field"><label>Night Charges</label><input type="number" name="night" step="0.01" value="<?php echo $night; ?>"></div>
        <div class="entry-field"><label>Extra Charges</label><input type="number" name="extra_charges" step="0.01" value="<?php echo $extraCharges; ?>"></div>
        <div class="entry-field"><label>Received (Text)</label><input type="text" name="received" value="<?php echo htmlspecialchars($received); ?>"></div>
      </div>
      <div style="margin-top: 1rem; display: flex; justify-content: flex-end;"><button type="submit" class="btn btn-primary">Update Invoice</button></div>
    </form>
  </div>

  <div class="invoice-toolbar no-print">
    <button type="button" class="btn btn-secondary" onclick="window.print()"><i class="fa fa-print"></i> Print Invoice</button>
    <a href="customize-booking?id=<?php echo (int) $bookingIdParam; ?>&amp;source=booking" class="btn btn-outline">Back</a>
  </div>

  <div class="invoice-sheet">
    <div class="invoice-header">
      <div class="brand-block">
        <div class="brand-title">Drop <span>Cars</span></div>
        <p class="brand-tagline">Your Trusted Travel Partner</p>
      </div>
      <div class="invoice-id-block">
        <h1>INVOICE</h1>
        <?php if ($gst_udyam): ?>
          <p class="invoice-gst"><?php echo htmlspecialchars($gst_udyam); ?></p>
        <?php endif; ?>
      </div>
    </div>

    <div class="bill-grid">
      <div class="info-group">
        <h4>Driver & Cab Details</h4>
        <p><strong>Driver: <?php echo htmlspecialchars($driverName !== '' ? $driverName : 'To be assigned'); ?></strong></p>
        <p>Contact: <?php echo htmlspecialchars($driverContact !== '' ? $driverContact : 'Pending'); ?></p>
        <p>Cab: <?php echo htmlspecialchars($cabName !== '' ? $cabName : 'To be assigned'); ?><?php echo $cabNumber !== '' ? ' | ' . htmlspecialchars($cabNumber) : ''; ?></p>
      </div>
      <div class="info-group">
        <h4>Receiver Details</h4>
        <p><strong><?php echo htmlspecialchars($inv['customer_name']); ?></strong></p>
        <p>Phone: <?php echo htmlspecialchars($inv['customer_phone']); ?></p>
        <p>Booking ID: <?php echo htmlspecialchars($bid); ?></p>
      </div>
    </div>

    <div class="trip-table-wrap">
      <p class="trip-table-title">Trip Details</p>
      <table class="trip-table">
        <tbody>
          <tr>
            <th>Trip Type</th>
            <td><?php echo $tripLabel; ?></td>
          </tr>
          <tr>
            <th>From</th>
            <td><?php echo htmlspecialchars($inv['pickup_location']); ?></td>
          </tr>
          <tr>
            <th>To</th>
            <td><?php echo htmlspecialchars($inv['drop_location']); ?></td>
          </tr>
          <tr>
            <th>Pickup Date</th>
            <td><?php echo date('d M Y', strtotime($inv['pickup_date'])); ?></td>
          </tr>
          <tr>
            <th>Pickup Time</th>
            <td><?php echo date('h:i A', strtotime($inv['pickup_time'])); ?></td>
          </tr>
          <tr>
            <th>Vehicle</th>
            <td><?php echo htmlspecialchars($inv['car_name'] ?: 'Fleet assigned on dispatch'); ?></td>
          </tr>
          <tr>
            <th>Distance</th>
            <td><?php echo (float) $inv['distance_km']; ?> KM</td>
          </tr>
        </tbody>
      </table>
    </div>

    <table class="charge-table">
      <thead>
        <tr>
          <th>Description</th>
          <th class="text-right">Amount (Rs.)</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>Base Fare</td><td class="text-right"><?php echo formatCurrency($baseFare); ?></td></tr>
        <?php if ($gstAmount > 0): ?><tr><td>GST (<?php echo number_format($gstPercent, 2); ?>%)</td><td class="text-right"><?php echo formatCurrency($gstAmount); ?></td></tr><?php endif; ?>
        <?php if ($toll > 0): ?><tr><td>Toll Gate Fees</td><td class="text-right"><?php echo formatCurrency($toll); ?></td></tr><?php endif; ?>
        <?php if ($parking > 0): ?><tr><td>Parking Charges</td><td class="text-right"><?php echo formatCurrency($parking); ?></td></tr><?php endif; ?>
        <?php if ($stateTax > 0): ?><tr><td>State Entry Tax</td><td class="text-right"><?php echo formatCurrency($stateTax); ?></td></tr><?php endif; ?>
        <?php if ($waiting > 0): ?><tr><td>Waiting Charges</td><td class="text-right"><?php echo formatCurrency($waiting); ?></td></tr><?php endif; ?>
        <?php if ($hills > 0): ?><tr><td>Hill Surcharge</td><td class="text-right"><?php echo formatCurrency($hills); ?></td></tr><?php endif; ?>
        <?php if ($night > 0): ?><tr><td>Night Allowance</td><td class="text-right"><?php echo formatCurrency($night); ?></td></tr><?php endif; ?>
        <?php if ($extraCharges > 0): ?><tr><td>Other Extra Charges</td><td class="text-right"><?php echo formatCurrency($extraCharges); ?></td></tr><?php endif; ?>
        <?php if ($discount > 0): ?><tr><td style="color: #d9534f;">Discount/Adjustment (-)</td><td class="text-right" style="color: #d9534f;">-<?php echo formatCurrency($discount); ?></td></tr><?php endif; ?>
      </tbody>
    </table>
 
    <div class="invoice-footer">
      <div class="totals-box">
        <div class="total-row"><span>Sub Total</span><span><?php echo formatCurrency($totalAmount + $discount - $gstAmount); ?></span></div>
        <div class="total-row grand"><span>TOTAL PAYABLE</span><span><?php echo formatCurrency($totalAmount); ?></span></div>
      </div>
    </div>

    <?php if ($received): ?>
    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 1.5rem; gap: 2rem;">
      <div style="flex: 1; padding-bottom: 0.5rem;">
        <p style="margin: 0; font-size: 0.85rem; font-weight: bold; color: var(--secondary-color); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.4rem;">Official Support</p>
        <p style="margin: 0; font-size: 0.95rem; font-weight: bold; color: #64748b; margin-bottom: 0.2rem;"><i class="fa fa-globe" style="color:var(--primary-color); margin-right: 5px;"></i> www.dropcars.in</p>
        <p style="margin: 0; font-size: 0.95rem; font-weight: bold; color: #64748b;"><i class="fa fa-phone-alt" style="color:var(--primary-color); margin-right: 5px;"></i> <?php echo htmlspecialchars($config['supportPhone'] ?? '+91 7200217986'); ?></p>
      </div>
      <div class="received-highlight" style="min-width: 300px; margin-top: 0;">
        <span>Amount RECEIVED</span>
        <span>₹<?php echo $received; ?></span>
      </div>
    </div>
    <?php endif; ?>

    <div style="margin-top: 3.5rem; padding-top: 1rem; border-top: 1px solid #f1f5f9; text-align: left;">
      <p style="font-size: 0.75rem; color: var(--text-muted); margin: 0; line-height: 1.4;">
        This is a computer generated invoice and does not require a physical signature.<br>
        Digital booking platform managed by Drop Cars.
      </p>
    </div>

    <p style="text-align: center; margin-top: 3rem; font-size: 0.85rem; font-weight: bold; color: var(--secondary-color);">
      Thank you for travelling with Drop Cars!
    </p>
  </div>
</div>

<script>
  (function () {
    var cleanTitle = "Invoice <?php echo htmlspecialchars($bid, ENT_QUOTES); ?>";
    try {
      document.title = cleanTitle;
    } catch (e) {}

    // Remove noisy query params from the visible URL (no reload),
    // so browser print headers/footers don't show long charge strings.
    try {
      if (window.history && window.history.replaceState) {
        var cleanPath = window.location.pathname + "?id=<?php echo (int) $bookingIdParam; ?>";
        window.history.replaceState({}, cleanTitle, cleanPath);
      }
    } catch (e) {}

    window.addEventListener("beforeprint", function () {
      try {
        document.title = cleanTitle;
      } catch (e) {}
    });
  })();
</script>
