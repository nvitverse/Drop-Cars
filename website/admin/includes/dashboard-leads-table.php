<?php
/**
 * Dashboard "Live Mission Control" results card (table + pagination).
 *
 * Rendered both inside the full page and as the ?ajax=leads fragment.
 * Expects (from dashboard-leads-query.php): $recentBookings, $totalCount,
 * $totalPages, $page, $limit, $offset and the $dash*Filter vars.
 */
require_once __DIR__ . '/functions.php';
?>
<style>
    .dash-row:hover { background-color: #f8fafc !important; }
</style>
<div class="card" style="padding: 0; border: 1px solid #f1f5f9; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.02);">

    <div class="table-responsive">
        <table class="custom-table dash-leads-table" style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="background: #f8fafc; border-bottom: 1px solid #f1f5f9;">
                    <th style="padding: 0.75rem 1rem; font-size: 0.65rem; font-weight: 900; color: #94a3b8; text-transform: uppercase;">ID/Type</th>
                    <th style="padding: 0.75rem 1rem; font-size: 0.65rem; font-weight: 900; color: #94a3b8; text-transform: uppercase;">Customer</th>
                    <th style="padding: 0.75rem 1rem; font-size: 0.65rem; font-weight: 900; color: #94a3b8; text-transform: uppercase;">Journey</th>
                    <th style="padding: 0.75rem 1rem; font-size: 0.65rem; font-weight: 900; color: #94a3b8; text-transform: uppercase;">Schedule</th>
                    <th style="padding: 0.75rem 1rem; font-size: 0.65rem; font-weight: 900; color: #94a3b8; text-transform: uppercase;">Fare/Status</th>
                </tr>
            </thead>
            <tbody>
                <?php if (empty($recentBookings)): ?>
                    <tr>
                        <td colspan="5" style="padding: 3rem 1.5rem; text-align: center; color: #94a3b8;">
                            <div style="display:flex; flex-direction:column; align-items:center; gap:0.6rem;">
                                <i class="fa-regular fa-folder-open" style="font-size: 1.8rem; color:#cbd5e1;"></i>
                                <div style="font-weight: 800; font-size: 0.9rem; color:#64748b;">No records match these filters</div>
                            </div>
                        </td>
                    </tr>
                <?php endif; ?>
                <?php foreach ($recentBookings as $booking): ?>
                    <?php
                    $bookingRef = $booking['booking_id'] ?? '';
                    if (empty($bookingRef)) {
                        $prefix = ($booking['status'] === 'confirmed' || $booking['status'] === 'completed') ? 'C' : 'E';
                        $createdTime = !empty($booking['created_at']) ? strtotime($booking['created_at']) : time();
                        $md = date('md', $createdTime);
                        $bookingRef = $prefix . $md . str_pad((string)$booking['id'], 4, '0', STR_PAD_LEFT);
                    }
                    
                    // Determine display status for the compact leads card
                    $cTier = dropcars_get_lead_tier($pdo, $booking['customer_phone'] ?? '');
                    if ($booking['record_type'] === 'enquiry') {
                        if ($cTier === 'repeated' || $cTier === 'regular') {
                            $displayStatus = 'Repeated';
                            $displayStatusColor = '#d97706'; // Amber/Orange
                        } else {
                            $displayStatus = 'Enquiry';
                            $displayStatusColor = '#2563eb'; // Royal Blue
                        }
                    } else { // booking
                        if ($booking['status'] === 'confirmed') {
                            $displayStatus = 'Confirmed';
                            $displayStatusColor = '#16a34a'; // Green
                        } elseif ($booking['status'] === 'completed') {
                            $displayStatus = 'Completed';
                            $displayStatusColor = '#16a34a'; // Green
                        } else {
                            $displayStatus = ucfirst($booking['status']);
                            $displayStatusColor = '#475569'; // Slate/Grey
                        }
                    }

                    $displayStatusColor = $displayStatusColor ?? '#64748b';

                    // Parse stops/via_locations
                    $stops = [];
                    if ($booking['record_type'] === 'booking') {
                        if (!empty($booking['via_locations'])) {
                            $stops = array_filter(array_map('trim', explode('|', $booking['via_locations'])));
                        }
                    } else { // enquiry
                        $fb = json_decode($booking['fare_breakdown'] ?? '[]', true);
                        if (isset($fb['stops']) && is_array($fb['stops'])) {
                            $stops = array_filter(array_map('trim', $fb['stops']));
                        }
                    }
                    $booking['stops'] = array_values($stops);

                    // Pre-generate badges to pass to detail modal
                    $booking['customer_badge'] = dropcars_get_lead_tier_badge($pdo, $booking['customer_phone'] ?? '');
                    $booking['status_badge'] = getBookingStatusBadge($booking['status'], $booking['responded_by'] ?? '');
                    $booking['formatted_ref'] = '#' . $bookingRef;
                    $booking['display_status'] = $displayStatus;
                    $booking['display_status_color'] = $displayStatusColor;
                    $booking['customer_tier'] = $cTier;
                    ?>
                    <tr class="dash-row" style="border-bottom: 1px solid #f8fafc; font-size: 0.8rem; cursor: pointer; transition: background 0.15s ease;" onclick='openDashLeadDetails(<?php echo json_encode($booking, JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_TAG | JSON_HEX_AMP); ?>)'>
                        <!-- Desktop View Cells -->
                        <td class="hide-on-mobile" style="padding: 0.75rem 1rem; vertical-align: middle;">
                            <div style="font-weight: 800; color: #4f46e5;">#<?php echo htmlspecialchars($bookingRef); ?></div>
                            <div style="font-size: 0.65rem; color: #94a3b8; text-transform: uppercase;"><?php echo htmlspecialchars($booking['record_type']); ?></div>
                        </td>
                        <td class="hide-on-mobile" style="padding: 0.75rem 1rem; vertical-align: middle;">
                            <div style="font-weight: 700; color: #334155;"><?php echo htmlspecialchars($booking['customer_name'] ?: 'Guest'); ?></div>
                            <div style="font-size: 0.7rem; color: #64748b;"><?php echo htmlspecialchars($booking['customer_phone']); ?></div>
                        </td>
                        <td class="hide-on-mobile" style="padding: 0.75rem 1rem; vertical-align: middle; max-width: 200px;">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                                <div style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                    <div style="font-weight: 600; font-size: 0.75rem; color: #334155; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"><?php echo htmlspecialchars($booking['pickup_location']); ?></div>
                                    <div style="font-size: 0.6rem; color: #cbd5e1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">&rarr; <?php echo htmlspecialchars($booking['drop_location']); ?></div>
                                </div>
                                <div style="flex-shrink: 0; text-align: right; align-self: center;">
                                    <span style="font-size: 0.6rem; font-weight: 800; background: #eef2ff; color: #4338ca; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; white-space: nowrap; letter-spacing: 0.02em;">
                                        <?php 
                                            $tType = strtolower(trim((string)($booking['trip_type'] ?? '')));
                                            if ($tType === 'oneway' || $tType === 'one_way') {
                                                echo 'One Way';
                                            } elseif ($tType === 'round' || $tType === 'round_trip' || $tType === 'roundtrip') {
                                                echo 'Round Trip';
                                            } else {
                                                echo htmlspecialchars(str_replace('_', ' ', $tType));
                                            }
                                        ?>
                                    </span>
                                </div>
                            </div>
                        </td>
                        <td class="hide-on-mobile" style="padding: 0.75rem 1rem; vertical-align: middle;">
                            <div style="font-weight: 600; color: #334155; font-size: 0.75rem;"><?php echo !empty($booking['pickup_date']) ? date('d M', strtotime($booking['pickup_date'])) : '--'; ?></div>
                            <div style="color: #64748b; font-size: 0.7rem;"><?php echo !empty($booking['pickup_time']) ? date('H:i', strtotime($booking['pickup_time'])) : '--'; ?></div>
                        </td>
                        <td class="hide-on-mobile" style="padding: 0.75rem 1rem; vertical-align: middle;">
                            <div style="display: flex; align-items: baseline; gap: 4px;">
                                <strong style="font-weight: 800; color: #059669; font-size: 0.9rem;">₹<?php echo number_format((float)$booking['final_fare']); ?></strong>
                                <span style="font-size: 0.6rem; color: #94a3b8; font-weight: 700; text-transform: uppercase;">
                                    (<?php 
                                        $fType = strtolower(trim((string)($booking['fare_type'] ?? '')));
                                        if ($fType === 'inclusive') {
                                            echo 'Incl';
                                        } else {
                                            echo 'Excl';
                                        }
                                    ?>)
                                </span>
                            </div>
                            <div onclick="event.stopPropagation();" style="margin-top: 2px;">
                                <?php
                                if ($booking['record_type'] === 'enquiry') {
                                    // Render Enquiry badge
                                    echo getBookingStatusBadge('enquiry');
                                    // Near it, display repeated / regular label if appropriate without a box
                                    $cTier = dropcars_get_lead_tier($pdo, $booking['customer_phone'] ?? '');
                                    if ($cTier === 'repeated') {
                                        echo '<span style="color: #2563eb; font-weight: 800; font-size: 0.7rem; margin-left: 6px; vertical-align: middle; white-space: nowrap;">Repeated</span>';
                                    } elseif ($cTier === 'regular') {
                                        echo '<span style="color: #16a34a; font-weight: 800; font-size: 0.7rem; margin-left: 6px; vertical-align: middle; white-space: nowrap;"><i class="fa-solid fa-star" style="font-size: 0.65rem;"></i> Regular</span>';
                                    }
                                } else {
                                    echo $booking['status_badge'];
                                }
                                ?>
                            </div>
                        </td>

                        <!-- Mobile Card View Cell (Colspan 5) -->
                        <td class="show-on-mobile" colspan="5" style="border: none !important;">
                            <div style="display: flex; align-items: flex-start; gap: 12px; width: 100%;">
                                <!-- Bulk Action Checkbox -->
                                <div onclick="event.stopPropagation();" style="flex-shrink: 0; display: flex; align-items: center; justify-content: center; padding-top: 1px; margin-left: -4px;">
                                    <input type="checkbox" name="selected_ids[]" value="<?php echo htmlspecialchars($booking['record_type'] . ':' . $booking['id']); ?>" class="dashboard-bulk-cb" style="width: 18px; height: 18px; cursor: pointer; accent-color: #3b82f6; margin: 0;">
                                </div>
                                <div class="mobile-lead-card" style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.7rem; font-family: 'Outfit', sans-serif;">
                                    <!-- Top Row: Enquiry & ID on Left, Pickup Schedule in Center, Customer on Right -->
                                    <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
                                        <!-- Left Side: Status & ID -->
                                        <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start;">
                                            <div style="font-size: 0.68rem; color: <?php echo $displayStatusColor; ?>; text-transform: uppercase; font-weight: 800; line-height: 1.3; letter-spacing: 0.03em;">
                                                <?php echo htmlspecialchars($displayStatus); ?>
                                            </div>
                                            <div class="booking-ref-copy" onclick="event.stopPropagation(); copyBookingId('<?php echo htmlspecialchars($bookingRef); ?>', this);" style="cursor: pointer; font-weight: 700; color: #4f46e5; font-size: 0.78rem; display: inline-flex; align-items: center; gap: 4px; margin-top: 4px; line-height: 1.3;" title="Click to copy ID">
                                                #<?php echo htmlspecialchars($bookingRef); ?>
                                                <i class="fa-regular fa-copy" style="font-size: 0.68rem; opacity: 0.6;"></i>
                                            </div>
                                        </div>

                                        <!-- Center: Pickup Schedule (Date & Time) -->
                                        <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; text-align: center;">
                                            <span style="font-size: 0.85rem; font-weight: 800; color: #0f172a; line-height: 1.3;">
                                                <?php echo !empty($booking['pickup_date']) ? date('d M', strtotime($booking['pickup_date'])) : '--'; ?>
                                            </span>
                                            <span style="font-size: 0.78rem; color: #64748b; font-weight: 600; margin-top: 4px; line-height: 1.3;">
                                                <?php echo !empty($booking['pickup_time']) ? date('H:i', strtotime($booking['pickup_time'])) : '--'; ?>
                                            </span>
                                        </div>

                                        <!-- Right Side: Customer Details -->
                                        <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-end; text-align: right;">
                                            <div style="font-weight: 800; color: #0f172a; font-size: 0.85rem; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%;">
                                                <?php echo htmlspecialchars($booking['customer_name'] ?: 'Guest'); ?>
                                            </div>
                                            <a href="tel:<?php echo htmlspecialchars(preg_replace('/\D/', '', $booking['customer_phone'])); ?>" onclick="event.stopPropagation();" style="font-size: 0.78rem; color: #64748b; font-weight: 600; text-decoration: none; margin-top: 4px; display: inline-block; line-height: 1.3;" title="Click to call">
                                                <?php echo htmlspecialchars($booking['customer_phone']); ?>
                                            </a>
                                        </div>
                                    </div>
                                    
                                    <!-- Journey Cities Row (One by One Locations, Right Badges Stacked) -->
                                    <div style="font-size: 0.8rem; color: #475569; display: flex; justify-content: space-between; align-items: center; font-weight: 600; border-top: 1px solid #f1f5f9; padding-top: 0.6rem; width: 100%; flex-wrap: nowrap !important;">
                                        <!-- Locations stacked vertically -->
                                        <div style="display: flex; flex-direction: column; gap: 4px; flex-grow: 1; min-width: 0; max-width: 70%;">
                                            <div style="display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                                <i class="fa-solid fa-circle-dot" style="color: #10b981; font-size: 0.7rem; flex-shrink: 0;"></i>
                                                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.78rem; color: #334155; font-weight: 700;">
                                                    <?php 
                                                        $pParts = explode(',', $booking['pickup_location']);
                                                        echo htmlspecialchars(trim($pParts[0])); 
                                                    ?>
                                                </span>
                                            </div>
                                            <div style="display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                                <i class="fa-solid fa-location-dot" style="color: #ef4444; font-size: 0.75rem; flex-shrink: 0;"></i>
                                                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.78rem; color: #475569; font-weight: 700;">
                                                    <?php 
                                                        $dParts = explode(',', $booking['drop_location']);
                                                        echo htmlspecialchars(trim($dParts[0])); 
                                                    ?>
                                                </span>
                                            </div>
                                        </div>
                                        
                                        <!-- Right Side badges (Trip Type & Vehicle Stacked) -->
                                        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; margin-left: auto;">
                                            <!-- Trip Type Badge -->
                                            <span style="font-size: 0.58rem; font-weight: 800; background: #eef2ff; color: #4338ca; border: 1px solid #c7d2fe; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; white-space: nowrap; letter-spacing: 0.02em;">
                                                <?php 
                                                    $tType = strtolower(trim((string)($booking['trip_type'] ?? '')));
                                                    if ($tType === 'oneway' || $tType === 'one_way') {
                                                        echo 'One Way';
                                                    } elseif ($tType === 'round' || $tType === 'round_trip' || $tType === 'roundtrip') {
                                                        echo 'Round Trip';
                                                    } else {
                                                        echo htmlspecialchars(str_replace('_', ' ', $tType));
                                                    }
                                                ?>
                                            </span>
                                            <!-- Vehicle Badge -->
                                            <span style="font-size: 0.58rem; font-weight: 800; background: #faf5ff; color: #6b21a8; border: 1px solid #e9d5ff; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; white-space: nowrap; letter-spacing: 0.02em;">
                                                <?php echo htmlspecialchars($booking['car_name'] ?: 'Not Prefered'); ?>
                                            </span>
                                        </div>
                                    </div>
                                    
                                    <!-- DateTime & Fare Row (Single Line) -->
                                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem; border-top: 1px dashed #f1f5f9; padding-top: 0.6rem; color: #64748b; font-weight: 600;">
                                        <!-- Enquiry Received Date & Time (Small and Dull) -->
                                        <span style="color: #94a3b8; font-size: 0.7rem; font-weight: 500; letter-spacing: 0.01em;">
                                            Received: <?php echo !empty($booking['created_at']) ? date('d M | H:i', strtotime($booking['created_at'])) : '--'; ?>
                                        </span>
                                        
                                        <div style="display: flex; align-items: center; gap: 4px;">
                                            <strong style="color: #059669; font-size: 0.9rem; font-weight: 800;">₹<?php echo number_format((float)$booking['final_fare']); ?></strong>
                                            <span style="font-size: 0.65rem; color: #94a3b8; font-weight: 700; text-transform: uppercase;">
                                                (<?php 
                                                    $fType = strtolower(trim((string)($booking['fare_type'] ?? '')));
                                                    if ($fType === 'inclusive') {
                                                        echo 'Incl';
                                                    } else {
                                                        echo 'Excl';
                                                    }
                                                ?>)
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>

    </div>
        <?php if ($totalPages > 1): ?>
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.5rem; border-top: 1px solid #f1f5f9; background: #fff; flex-wrap: wrap; gap: 0.6rem;">
                <div style="font-size: 0.8rem; color: #64748b; font-weight: 600;">
                    Showing <?php echo $offset + 1; ?> to <?php echo min($offset + $limit, $totalCount); ?> of <?php echo $totalCount; ?> entries
                </div>
                <div style="display: flex; gap: 0.35rem;">
                    <?php if ($page > 1): ?>
                        <a href="<?php echo admin_url('dashboard', array_filter(['status' => $dashStatusFilter ?: null, 'sort' => $dashSortFilter !== 'newest' ? $dashSortFilter : null, 'date_filter' => $dashDateFilter !== 'all' ? $dashDateFilter : null, 'start_date' => $dashDateFilter === 'custom' && $startDate !== '' ? $startDate : null, 'end_date' => $dashDateFilter === 'custom' && $endDate !== '' ? $endDate : null, 'dispatcher' => $dashDispatcherFilter ?: null, 'trip_type' => $dashTripTypeFilter ?: null, 'page' => $page - 1])); ?>"
                           data-dash-page="<?php echo $page - 1; ?>"
                           style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: #475569; font-weight: 700; text-decoration: none; font-size: 0.85rem; transition: all 0.2s;"
                           onmouseover="this.style.background='#f8fafc';" onmouseout="this.style.background='#fff';">
                            <i class="fa fa-chevron-left" style="font-size: 0.7rem;"></i>
                        </a>
                    <?php endif; ?>

                    <?php
                    $startPage = max(1, $page - 2);
                    $endPage = min($totalPages, $page + 2);
                    for ($i = $startPage; $i <= $endPage; $i++):
                        $active = ($i === $page);
                    ?>
                        <a href="<?php echo admin_url('dashboard', array_filter(['status' => $dashStatusFilter ?: null, 'sort' => $dashSortFilter !== 'newest' ? $dashSortFilter : null, 'date_filter' => $dashDateFilter !== 'all' ? $dashDateFilter : null, 'start_date' => $dashDateFilter === 'custom' && $startDate !== '' ? $startDate : null, 'end_date' => $dashDateFilter === 'custom' && $endDate !== '' ? $endDate : null, 'dispatcher' => $dashDispatcherFilter ?: null, 'trip_type' => $dashTripTypeFilter ?: null, 'page' => $i])); ?>"
                           data-dash-page="<?php echo $i; ?>"
                           style="display: inline-flex; align-items: center; justify-content: center; min-width: 32px; height: 32px; padding: 0 6px; border-radius: 8px; border: 1px solid <?php echo $active ? '#6366f1' : '#cbd5e1'; ?>; background: <?php echo $active ? '#6366f1' : '#fff'; ?>; color: <?php echo $active ? '#fff' : '#475569'; ?>; font-weight: 800; text-decoration: none; font-size: 0.82rem; transition: all 0.2s;"
                           <?php if (!$active): ?>onmouseover="this.style.background='#f8fafc';" onmouseout="this.style.background='#fff';"<?php endif; ?>>
                            <?php echo $i; ?>
                        </a>
                    <?php endfor; ?>

                    <?php if ($page < $totalPages): ?>
                        <a href="<?php echo admin_url('dashboard', array_filter(['status' => $dashStatusFilter ?: null, 'sort' => $dashSortFilter !== 'newest' ? $dashSortFilter : null, 'date_filter' => $dashDateFilter !== 'all' ? $dashDateFilter : null, 'start_date' => $dashDateFilter === 'custom' && $startDate !== '' ? $startDate : null, 'end_date' => $dashDateFilter === 'custom' && $endDate !== '' ? $endDate : null, 'dispatcher' => $dashDispatcherFilter ?: null, 'trip_type' => $dashTripTypeFilter ?: null, 'page' => $page + 1])); ?>"
                           data-dash-page="<?php echo $page + 1; ?>"
                           style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: #475569; font-weight: 700; text-decoration: none; font-size: 0.85rem; transition: all 0.2s;"
                           onmouseover="this.style.background='#f8fafc';" onmouseout="this.style.background='#fff';">
                            <i class="fa fa-chevron-right" style="font-size: 0.7rem;"></i>
                        </a>
                    <?php endif; ?>
                </div>
            </div>
        <?php endif; ?>
</div>
