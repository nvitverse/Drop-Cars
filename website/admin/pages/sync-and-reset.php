<?php
/**
 * Sync to Google Sheets. Optional: remove successfully synced rows from the DB (off by default).
 * Never syncs or deletes pending/confirmed bookings.
 */

// Load config
$configPath = __DIR__ . '/../../api/config.php';
$config = is_file($configPath) ? (include $configPath) : [];
$sheetViewUrl = trim((string) ($config['googleSheetsSheetUrl'] ?? ''));
$sheetViewUrlValid = $sheetViewUrl !== '' && filter_var($sheetViewUrl, FILTER_VALIDATE_URL);

require_once __DIR__ . '/../../includes/google-sheet-sync.php';
require_once __DIR__ . '/../includes/enquiries-schema.php';
dropcars_ensure_enquiries_booking_id_column($pdo);

$message = '';
$messageType = 'success';
$detailedResults = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['confirm_sync_archive'])) {
    set_time_limit(300);

    $includeCompleted = !empty($_POST['include_completed_bookings']);
    $includeCancelled = !empty($_POST['include_cancelled_bookings']);
    $syncEnquiryFake = !empty($_POST['sync_enquiry_fake']);
    $syncEnquiryNotConfirmed = !empty($_POST['sync_enquiry_not_confirmed']);
    $syncEnquiryConfirmed = !empty($_POST['sync_enquiry_confirmed']);
    $keepEnquiriesDays = max(0, (int) ($_POST['keep_enquiries_days'] ?? 0));
    $keepCompletedBookingsDays = max(0, (int) ($_POST['keep_completed_bookings_days'] ?? 0));
    $removeAfterSync = !empty($_POST['remove_after_sync']);

    $successCount = 0;
    $errorCount = 0;
    $totalEntries = 0;
    $syncedBookingIds = [];
    $syncedEnquiryIds = [];

    try {
        // --- Bookings ---
        $bookingRows = [];
        if ($includeCompleted || $includeCancelled) {
            $conds = [];
            $params = [];
            if ($includeCompleted) { $conds[] = 'b.`status` = ?'; $params[] = 'completed'; }
            if ($includeCancelled) { $conds[] = 'b.`status` = ?'; $params[] = 'cancelled'; }
            $whereStatus = '(' . implode(' OR ', $conds) . ')';
            $dateFilter = $keepCompletedBookingsDays > 0 ? ' AND b.`created_at` < DATE_SUB(NOW(), INTERVAL ' . (int) $keepCompletedBookingsDays . ' DAY)' : '';

            $sql = "SELECT b.*, c.name, c.phone FROM `bookings` b JOIN `customers` c ON b.customer_id = c.id WHERE $whereStatus $dateFilter";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $bookingRows = $stmt->fetchAll();
        }

        foreach ($bookingRows as $r) {
            $totalEntries++;
            $isRegularCustomer = !empty($r['is_regular_customer']);
            $entry = [
                'createdAt' => $r['created_at'] ?? date('c'),
                'bookingId' => $r['booking_id'] ?? '',
                'leadType' => 'Booking',
                'status' => $r['status'] ?? '',
                'name' => $r['customer_name'] ?? $r['name'] ?? '',
                'phone' => $r['customer_phone'] ?? $r['phone'] ?? '',
                'tripType' => $r['trip_type'] ?? 'oneway',
                'pickup' => $r['pickup_location'] ?? '',
                'viaLocations' => $r['via_locations'] ?? '',
                'drop' => $r['drop_location'] ?? '',
                'itinerary' => ($r['pickup_location'] ?? '')
                    . (!empty($r['via_locations']) ? ' → ' . $r['via_locations'] : '')
                    . ' → ' . ($r['drop_location'] ?? ''),
                'pickupDate' => $r['pickup_date'] ?? '',
                'pickupTime' => $r['pickup_time'] ?? '',
                'returnDate' => $r['return_date'] ?? '',
                'returnTime' => $r['return_time'] ?? '',
                'tripDays' => $r['trip_days'] ?? '',
                'vehicle' => $r['car_name'] ?? '',
                'distance' => $r['distance_km'] ?? '',
                'estFare' => $r['estimated_fare'] ?? '',
                'finalFare' => $r['final_fare'] ?? '',
                'discount' => $r['discount_amount'] ?? '',
                'fareType' => $r['fare_type'] ?? '',
                'driverName' => $r['driver_name'] ?? '',
                'driverPhone' => $r['driver_phone'] ?? '',
                'carNumber' => $r['car_number'] ?? '',
                'source' => $r['source'] ?? '',
                'utmSource' => $r['utm_source'] ?? '',
                'utmMedium' => $r['utm_medium'] ?? '',
                'utmCampaign' => $r['utm_campaign'] ?? '',
                'gclid' => $r['gclid'] ?? '',
                'ip' => $r['ip_address'] ?? '',
                'loyaltyStatus' => $isRegularCustomer ? 'Regular' : '',
            ];
            if (sendToGoogleSheet($entry)) {
                $successCount++;
                $syncedBookingIds[] = (int) $r['id'];
            } else { $errorCount++; }
            usleep(20000);
        }

        // --- Enquiries ---
        $enquiryStatuses = [];
        if ($syncEnquiryFake) $enquiryStatuses[] = 'fake';
        if ($syncEnquiryNotConfirmed) $enquiryStatuses[] = 'not_confirmed';
        if ($syncEnquiryConfirmed) $enquiryStatuses[] = 'confirmed';

        $enquiryRows = [];
        if ($enquiryStatuses !== []) {
            $placeholders = implode(',', array_fill(0, count($enquiryStatuses), '?'));
            $sql = "SELECT * FROM `enquiries` WHERE `status` IN ($placeholders)";
            if ($keepEnquiriesDays > 0) $sql .= ' AND `created_at` < DATE_SUB(NOW(), INTERVAL ' . (int) $keepEnquiriesDays . ' DAY)';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($enquiryStatuses);
            $enquiryRows = $stmt->fetchAll();
        }

        foreach ($enquiryRows as $r) {
            $totalEntries++;
            $isRegularCustomer = !empty($r['is_regular_customer']);
            $entry = [
                'createdAt' => $r['created_at'] ?? date('c'),
                'bookingId' => $r['booking_id'] ?? '',
                'leadType' => 'Enquiry',
                'status' => $r['status'] ?? '',
                'name' => $r['name'] ?? '',
                'phone' => $r['phone'] ?? '',
                'tripType' => $r['trip_type'] ?? '',
                'pickup' => $r['pickup'] ?? '',
                'viaLocations' => $r['via_locations'] ?? '',
                'drop' => $r['drop_location'] ?? '',
                'itinerary' => ($r['pickup'] ?? '')
                    . (!empty($r['via_locations']) ? ' → ' . $r['via_locations'] : '')
                    . ' → ' . ($r['drop_location'] ?? ''),
                'pickupDate' => $r['travel_date'] ?? '',
                'pickupTime' => $r['travel_time'] ?? '',
                'returnDate' => $r['return_date'] ?? '',
                'returnTime' => $r['return_time'] ?? '',
                'tripDays' => $r['trip_days'] ?? '',
                'vehicle' => $r['vehicle_type'] ?? '',
                'distance' => $r['distance_km'] ?? '',
                'estFare' => $r['fare_estimate'] ?? '',
                'finalFare' => '',
                'discount' => '',
                'fareType' => $r['fare_type'] ?? '',
                'driverName' => '',
                'driverPhone' => '',
                'carNumber' => '',
                'source' => $r['source'] ?? '',
                'utmSource' => $r['utm_source'] ?? '',
                'utmMedium' => $r['utm_medium'] ?? '',
                'utmCampaign' => $r['utm_campaign'] ?? '',
                'gclid' => $r['gclid'] ?? '',
                'ip' => $r['ip_address'] ?? '',
                'loyaltyStatus' => $isRegularCustomer ? 'Regular' : '',
            ];
            if (sendToGoogleSheet($entry)) {
                $successCount++;
                $syncedEnquiryIds[] = (int) $r['id'];
            } else { $errorCount++; }
            usleep(20000);
        }

        $failureRate = $totalEntries > 0 ? ($errorCount / $totalEntries) : 0;
        $mayDelete = ($totalEntries === 0) || ($errorCount === 0) || ($failureRate < 0.05);

        if ($totalEntries === 0) {
            $message = 'No records matched your sync criteria. Nothing was sent.';
        } elseif (!$mayDelete) {
            $message = "Sync aborted due to high failure rate ($errorCount errors). No local data was modified.";
            $messageType = 'error';
        } else {
            if ($removeAfterSync) {
                $pdo->beginTransaction();
                try {
                    if ($syncedBookingIds !== []) {
                        $ids = array_values(array_unique(array_filter($syncedBookingIds)));
                        $placeholders = implode(',', array_fill(0, count($ids), '?'));
                        $pdo->prepare("DELETE FROM `coupon_usages` WHERE `booking_id` IN ($placeholders)")->execute($ids);
                        $pdo->prepare("DELETE FROM `bookings` WHERE `id` IN ($placeholders)")->execute($ids);
                    }
                    if ($syncedEnquiryIds !== []) {
                        $eids = array_values(array_unique(array_filter($syncedEnquiryIds)));
                        $placeholders = implode(',', array_fill(0, count($eids), '?'));
                        $pdo->prepare("DELETE FROM `enquiries` WHERE `id` IN ($placeholders)")->execute($eids);
                    }
                    $pdo->exec("DELETE c FROM `customers` c LEFT JOIN `bookings` b ON b.`customer_id` = c.`id` WHERE b.`id` IS NULL");
                    $pdo->commit();
                } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
                $message = "Successfully synced and cleared $successCount records.";
            } else {
                $message = "Successfully synced $successCount records. Local data was kept.";
            }
            if ($errorCount > 0) $message .= " ($errorCount failed entries were skipped).";
        }
    } catch (Exception $e) {
        $message = 'Sync Error: ' . $e->getMessage();
        $messageType = 'error';
    }
}

// Stats for the UI
$countBookings = (int) $pdo->query("SELECT COUNT(*) FROM `bookings`")->fetchColumn();
$countEnquiries = (int) $pdo->query("SELECT COUNT(*) FROM `enquiries`")->fetchColumn();
$countSyncableCompleted = (int) $pdo->query("SELECT COUNT(*) FROM `bookings` WHERE `status` = 'completed'")->fetchColumn();
$countSyncableCancelled = (int) $pdo->query("SELECT COUNT(*) FROM `bookings` WHERE `status` = 'cancelled'")->fetchColumn();
?>

<div class="page-header">
    <div>
        <h1>Database Maintenance</h1>
        <p>Sync your record history to Google Sheets and keep your local database optimized.</p>
    </div>
</div>

<div style="max-width: 900px; margin: 0 auto;">
    
    <?php if ($message): ?>
        <div class="card" style="padding: 3rem; text-align: center; animation: fadeInUp 0.5s ease-out;">
            <div style="width: 100px; height: 100px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 2rem; font-size: 3rem; <?php echo $messageType === 'success' ? 'background: rgba(16, 185, 129, 0.1); color: #10b981;' : 'background: rgba(239, 68, 68, 0.1); color: #ef4444;'; ?>">
                <i class="fa-solid <?php echo $messageType === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'; ?>"></i>
            </div>
            <h2 style="margin-bottom: 1rem;"><?php echo $messageType === 'success' ? 'Operation Complete' : 'Something went wrong'; ?></h2>
            <p style="font-size: 1.15rem; color: var(--slate-600); line-height: 1.6; max-width: 500px; margin: 0 auto 2.5rem;"><?php echo htmlspecialchars($message); ?></p>
            
            <div style="display: flex; gap: 1rem; justify-content: center;">
                <?php if ($sheetViewUrlValid): ?>
                    <a href="<?php echo htmlspecialchars($sheetViewUrl); ?>" target="_blank" class="btn btn-primary" style="background: #0F9D58; border-color: #0F9D58;">
                        <i class="fa-solid fa-table"></i> Open Google Sheet
                    </a>
                <?php endif; ?>
                <a href="dashboard" class="btn btn-secondary">
                    <i class="fa-solid fa-house"></i> Dashboard
                </a>
            </div>
        </div>
    <?php else: ?>

        <div class="grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; margin-bottom: 2rem;">
            <div class="card stat-card" style="margin-bottom: 0;">
                <div class="stat-icon" style="background: rgba(15, 23, 42, 0.05); color: var(--secondary-color);"><i class="fa-solid fa-folder-tree"></i></div>
                <div class="stat-value"><?php echo number_format($countBookings + $countEnquiries); ?></div>
                <div class="stat-label">Total Records</div>
            </div>
            <div class="card stat-card" style="margin-bottom: 0;">
                <div class="stat-icon" style="background: rgba(16, 185, 129, 0.1); color: #10b981;"><i class="fa-solid fa-calendar-check"></i></div>
                <div class="stat-value"><?php echo $countSyncableCompleted; ?></div>
                <div class="stat-label">Completed</div>
            </div>
            <div class="card stat-card" style="margin-bottom: 0;">
                <div class="stat-icon" style="background: rgba(239, 68, 68, 0.1); color: #ef4444;"><i class="fa-solid fa-circle-xmark"></i></div>
                <div class="stat-value"><?php echo $countSyncableCancelled; ?></div>
                <div class="stat-label">Cancelled</div>
            </div>
        </div>

        <form method="POST" id="sync-form">
            <div class="card" style="padding: 0; overflow: hidden; border-radius: 20px;">
                <div style="padding: 2rem 2.5rem; background: var(--secondary-color); color: white;">
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <i class="fa-solid fa-sliders" style="color: var(--primary-color); font-size: 1.25rem;"></i>
                        <h3 style="margin: 0; color: white; font-family: 'Outfit'; letter-spacing: 0.02em;">Sync Configuration</h3>
                    </div>
                </div>

                <div style="padding: 2.5rem;">
                    <!-- Filter Section -->
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 2rem; margin-bottom: 3rem;">
                        <div>
                            <h4 style="font-size: 0.9rem; text-transform: uppercase; color: var(--slate-400); letter-spacing: 0.1em; margin-bottom: 1.5rem;">Booking Archive</h4>
                            <div style="display: flex; flex-direction: column; gap: 1rem;">
                                <label class="sync-checkbox">
                                    <input type="checkbox" name="include_completed_bookings" value="1" checked>
                                    <div class="checkbox-ui"></div>
                                    <span>Include Completed Bookings</span>
                                </label>
                                <label class="sync-checkbox">
                                    <input type="checkbox" name="include_cancelled_bookings" value="1">
                                    <div class="checkbox-ui"></div>
                                    <span>Include Cancelled Bookings</span>
                                </label>
                                <div style="margin-top: 0.5rem;">
                                    <div class="form-label" style="font-size: 0.75rem;">Keep Records Newer Than (Days)</div>
                                    <input type="number" name="keep_completed_bookings_days" value="30" class="form-control" style="background: white; padding: 0.6rem;">
                                </div>
                            </div>
                        </div>

                        <div>
                            <h4 style="font-size: 0.9rem; text-transform: uppercase; color: var(--slate-400); letter-spacing: 0.1em; margin-bottom: 1.5rem;">Enquiry Archive</h4>
                            <div style="display: flex; flex-direction: column; gap: 1rem;">
                                <label class="sync-checkbox">
                                    <input type="checkbox" name="sync_enquiry_fake" value="1" checked>
                                    <div class="checkbox-ui"></div>
                                    <span>Archive Spam/Fake Enquiries</span>
                                </label>
                                <label class="sync-checkbox">
                                    <input type="checkbox" name="sync_enquiry_not_confirmed" value="1" checked>
                                    <div class="checkbox-ui"></div>
                                    <span>Archive Unconfirmed Leads</span>
                                </label>
                                <div style="margin-top: 0.5rem;">
                                    <div class="form-label" style="font-size: 0.75rem;">Keep Enquiries Newer Than (Days)</div>
                                    <input type="number" name="keep_enquiries_days" value="15" class="form-control" style="background: white; padding: 0.6rem;">
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Critical Action -->
                    <div style="background: #f8fafc; border: 1px dashed var(--slate-200); border-radius: 16px; padding: 2rem; margin-bottom: 3rem;">
                        <div style="display: flex; gap: 1.5rem; align-items: flex-start;">
                            <div style="background: #fff; width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: var(--danger-color); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border: 1px solid var(--slate-100);">
                                <i class="fa-solid fa-trash-can" style="font-size: 1.25rem;"></i>
                            </div>
                            <div style="flex: 1;">
                                <h4 style="margin: 0 0 0.5rem; font-family: 'Outfit';">Optimization Mode</h4>
                                <p style="font-size: 0.9rem; color: var(--slate-500); margin-bottom: 1.25rem; line-height: 1.5;">Would you like to remove the data from this local database after it is successfully uploaded to Google Sheets? This keeps your site fast and optimized.</p>
                                
                                <label class="sync-toggle">
                                    <input type="checkbox" name="remove_after_sync" value="1">
                                    <div class="toggle-track">
                                        <div class="toggle-thumb"></div>
                                    </div>
                                    <span style="font-weight: 700; color: var(--secondary-color);">Enable "Sync & Reset" (Recommended)</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 2rem;">
                        <div style="color: var(--slate-400); font-size: 0.85rem; max-width: 400px;">
                            <i class="fa-solid fa-lock" style="margin-right: 5px;"></i>
                            Safety Lock: Pending and confirmed bookings are <strong>always protected</strong> and will never be deleted.
                        </div>
                        <button type="submit" name="confirm_sync_archive" value="1" class="btn btn-primary" style="padding: 1.25rem 3rem; font-size: 1rem; border-radius: 14px; box-shadow: 0 10px 15px -3px rgba(15, 23, 42, 0.1);">
                            <i class="fa-solid fa-cloud-arrow-up" style="margin-right: 8px;"></i> Start Maintenance Process
                        </button>
                    </div>
                </div>
            </div>
        </form>

        <style>
            .sync-checkbox { display: flex; align-items: center; gap: 0.75rem; cursor: pointer; transition: all 0.2s; }
            .sync-checkbox input { display: none; }
            .checkbox-ui { width: 22px; height: 22px; border: 2px solid var(--slate-200); border-radius: 6px; transition: all 0.2s; position: relative; }
            .sync-checkbox input:checked + .checkbox-ui { background: var(--primary-color); border-color: var(--primary-color); }
            .sync-checkbox input:checked + .checkbox-ui::after { content: '\f00c'; font-family: 'Font Awesome 6 Free'; font-weight: 900; color: var(--secondary-color); font-size: 0.75rem; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); }
            .sync-checkbox:hover .checkbox-ui { border-color: var(--primary-color); }

            .sync-toggle { display: inline-flex; align-items: center; gap: 1rem; cursor: pointer; }
            .sync-toggle input { display: none; }
            .toggle-track { width: 50px; height: 26px; background: var(--slate-200); border-radius: 50px; position: relative; transition: all 0.3s; }
            .toggle-thumb { width: 20px; height: 20px; background: white; border-radius: 50%; position: absolute; top: 3px; left: 3px; transition: all 0.3s; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .sync-toggle input:checked + .toggle-track { background: var(--primary-color); }
            .sync-toggle input:checked + .toggle-track .toggle-thumb { left: 27px; }

            #sync-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.9); backdrop-filter: blur(8px); display: none; align-items: center; justify-content: center; z-index: 10000; color: white; text-align: center; }
            .spinner { border: 4px solid rgba(255,255,255,0.1); border-top: 4px solid var(--primary-color); border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite; margin: 0 auto 2rem; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>

        <div id="sync-overlay">
            <div>
                <div class="spinner"></div>
                <h2 style="color: white; font-family: 'Outfit'; font-size: 2rem; margin-bottom: 1rem;">Executing Maintenance...</h2>
                <p style="color: var(--slate-400); max-width: 400px;">Please do not close this window. We are synchronizing your records with Google Sheets and optimizing your database.</p>
                <div id="sync-progress-text" style="margin-top: 2rem; font-family: monospace; color: var(--primary-color); font-weight: 700;">CONNECTING TO WEBHOOK...</div>
            </div>
        </div>

        <script>
            document.getElementById('sync-form').addEventListener('submit', function() {
                document.getElementById('sync-overlay').style.display = 'flex';
                let messages = ['CONNECTING...', 'UPLOADING RECORDS...', 'VALIDATING SYNC...', 'CLEANING DATABASE...', 'ALMOST DONE...'];
                let i = 0;
                setInterval(() => {
                    document.getElementById('sync-progress-text').innerText = messages[i % messages.length];
                    i++;
                }, 3000);
            });
        </script>

    <?php endif; ?>

</div>
