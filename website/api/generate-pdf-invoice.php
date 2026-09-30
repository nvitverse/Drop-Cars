<?php
/**
 * Drop Cars - Automated PDF Trip Invoice & Trip Sheet Generator
 * Generates branded PDF invoice / trip sheet for corporate & retail clients.
 */

ob_start();
header('Content-Type: application/json; charset=utf-8');

try {
    $orderId = trim($_GET['order_id'] ?? $_POST['order_id'] ?? '');
    $customerName = trim($_GET['customer_name'] ?? $_POST['customer_name'] ?? 'Valued Customer');
    $pickup = trim($_GET['pickup'] ?? $_POST['pickup'] ?? 'Pickup City');
    $drop = trim($_GET['drop'] ?? $_POST['drop'] ?? 'Drop City');
    $amount = floatval($_GET['amount'] ?? $_POST['amount'] ?? 0);
    $vehicle = trim($_GET['vehicle'] ?? $_POST['vehicle'] ?? 'Sedan / SUV');
    $vendorName = trim($_GET['vendor_name'] ?? $_POST['vendor_name'] ?? 'Drop Cars Partner');
    $invoiceNo = 'DC-INV-' . ($orderId ? $orderId : rand(10000, 99999));
    $dateStr = date('d-M-Y');

    $html = "
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset='utf-8'>
        <title>Invoice {$invoiceNo}</title>
        <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20px; color: #1E293B; background: #F8FAFC; }
            .card { background: #FFFFFF; border-radius: 12px; padding: 24px; border: 1px solid #E2E8F0; max-width: 600px; margin: 0 auto; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0EA5E9; padding-bottom: 12px; margin-bottom: 20px; }
            .brand { font-size: 22px; font-weight: 800; color: #0EA5E9; }
            .inv-no { font-size: 14px; color: #64748B; font-weight: 600; }
            .row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
            .label { color: #64748B; font-weight: 500; }
            .val { font-weight: 700; color: #0F172A; }
            .total-box { background: #F0F9FF; border: 1px solid #BAE6FD; border-radius: 8px; padding: 14px; margin-top: 20px; display: flex; justify-content: space-between; align-items: center; }
            .total-val { font-size: 20px; font-weight: 800; color: #0284C7; }
            .footer { margin-top: 24px; text-align: center; font-size: 12px; color: #94A3B8; }
        </style>
    </head>
    <body>
        <div class='card'>
            <div class='header'>
                <div class='brand'>DROP CARS</div>
                <div class='inv-no'>Invoice: {$invoiceNo} | {$dateStr}</div>
            </div>
            <div class='row'><span class='label'>Client Name:</span><span class='val'>{$customerName}</span></div>
            <div class='row'><span class='label'>Route:</span><span class='val'>{$pickup} &rarr; {$drop}</span></div>
            <div class='row'><span class='label'>Vehicle Category:</span><span class='val'>{$vehicle}</span></div>
            <div class='row'><span class='label'>Service Provider:</span><span class='val'>{$vendorName}</span></div>
            <div class='total-box'>
                <span class='label' style='font-size:16px; font-weight:700;'>Total Trip Amount:</span>
                <span class='total-val'>&#8377; " . number_format($amount, 2) . "</span>
            </div>
            <div class='footer'>
                Thank you for riding with Drop Cars. For support, visit dropcars.in
            </div>
        </div>
    </body>
    </html>
    ";

    echo json_encode([
        'success' => true,
        'invoice_no' => $invoiceNo,
        'amount' => $amount,
        'customer_name' => $customerName,
        'route' => "{$pickup} -> {$drop}",
        'html_preview' => $html,
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
