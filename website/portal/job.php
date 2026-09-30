<?php
$orderId = htmlspecialchars($_GET['id'] ?? '');
$token = htmlspecialchars($_GET['token'] ?? '');
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Drop Cars – Driver Partner Job Dispatch</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #1D4ED8;
            --primary-dark: #1E40AF;
            --primary-light: #EFF6FF;
            --accent: #10B981;
            --surface: #FFFFFF;
            --bg: #F8FAFC;
            --border: #E2E8F0;
            --text-main: #0F172A;
            --text-muted: #64748B;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', sans-serif; }
        body { background-color: var(--bg); color: var(--text-main); line-height: 1.5; padding-bottom: 40px; }
        .header { background: #0F172A; color: #FFF; padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #2563EB; }
        .logo-box { display: flex; align-items: center; gap: 10px; }
        .logo-badge { background: #2563EB; color: #FFF; font-weight: 800; padding: 4px 10px; border-radius: 6px; font-size: 14px; }
        .logo-title { font-size: 16px; font-weight: 700; letter-spacing: -0.3px; }
        .container { max-width: 520px; margin: 0 auto; padding: 16px; }
        .card { background: var(--surface); border-radius: 14px; border: 1px solid var(--border); padding: 20px; margin-bottom: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.03); }
        .badge-status { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; text-transform: uppercase; }
        .badge-open { background: #DCFCE7; color: #15803D; }
        .badge-assigned { background: #DBEAFE; color: #1E40AF; }
        .route-header { margin-top: 12px; }
        .route-title { font-size: 20px; font-weight: 800; color: #1E293B; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .route-arrow { color: #2563EB; font-weight: 900; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; background: #F8FAFC; padding: 14px; border-radius: 10px; border: 1px solid #EDF2F7; }
        .info-item { display: flex; flex-direction: column; }
        .info-label { font-size: 11.5px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; }
        .info-val { font-size: 14px; font-weight: 700; color: #1E293B; margin-top: 2px; }
        .fare-banner { background: linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%); color: #FFF; border-radius: 12px; padding: 18px; margin-top: 16px; display: flex; justify-content: space-between; align-items: center; }
        .fare-item small { display: block; font-size: 11px; opacity: 0.85; font-weight: 600; text-transform: uppercase; }
        .fare-item span { font-size: 24px; font-weight: 800; }
        .fare-driver { text-align: right; }
        .fare-driver span { font-size: 24px; color: #34D399; }
        
        .form-title { font-size: 16px; font-weight: 700; margin-bottom: 4px; color: #0F172A; }
        .form-sub { font-size: 12.5px; color: var(--text-muted); margin-bottom: 16px; }
        .form-group { margin-bottom: 14px; }
        .form-label { display: block; font-size: 12.5px; font-weight: 700; color: #334155; margin-bottom: 6px; }
        .form-input { width: 100%; height: 46px; border: 1.5px solid var(--border); border-radius: 8px; padding: 0 14px; font-size: 14.5px; color: #0F172A; font-weight: 600; outline: none; transition: border-color 0.2s; }
        .form-input:focus { border-color: var(--primary); background: #FFF; }
        
        .btn-primary { width: 100%; height: 50px; background: #2563EB; color: #FFF; border: none; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: background 0.2s; }
        .btn-primary:hover { background: #1D4ED8; }
        .btn-success { background: #10B981; }
        .btn-success:hover { background: #059669; }

        .upi-box { background: #F0FDF4; border: 1.5px dashed #86EFAC; border-radius: 10px; padding: 14px; text-align: center; margin-bottom: 16px; }
        .upi-id { font-size: 16px; font-weight: 800; color: #166534; user-select: all; }
        .upi-amount { font-size: 20px; font-weight: 900; color: #15803D; margin: 4px 0; }

        .customer-card { background: #F0FDF4; border: 1.5px solid #86EFAC; border-radius: 14px; padding: 20px; text-align: center; }
        .cust-name { font-size: 20px; font-weight: 800; color: #065F46; }
        .cust-phone { font-size: 24px; font-weight: 900; color: #047857; margin: 8px 0; letter-spacing: 0.5px; }
        .cust-address { font-size: 13.5px; color: #374151; background: #FFF; padding: 10px 14px; border-radius: 8px; border: 1px solid #D1FAE5; margin: 12px 0; text-align: left; }
        .action-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
        .btn-call { background: #059669; color: #FFF; padding: 12px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 6px; }
        .btn-whatsapp { background: #25D366; color: #FFF; padding: 12px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 6px; }

        .footer { text-align: center; font-size: 12px; color: var(--text-muted); margin-top: 24px; }
        .footer a { color: var(--primary); text-decoration: none; font-weight: 600; }
        .spinner { border: 3px solid rgba(255,255,255,0.3); border-top: 3px solid #FFF; border-radius: 50%; width: 20px; height: 20px; animation: spin 0.8s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    </style>
</head>
<body>

    <header class="header">
        <div class="logo-box">
            <span class="logo-badge">DROP CARS</span>
            <span class="logo-title">Driver Partner Portal</span>
        </div>
        <div style="font-size: 12px; font-weight: 600; opacity: 0.9;">24x7: 93630 12345</div>
    </header>

    <div class="container" id="mainContainer">
        <div style="text-align: center; padding: 40px 0;" id="loadingState">
            <div style="display: inline-block; width: 32px; height: 32px; border: 3px solid #CBD5E1; border-top-color: #2563EB; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
            <p style="margin-top: 12px; color: #64748B; font-weight: 600; font-size: 14px;">Loading Trip Details...</p>
        </div>

        <div id="jobContent" style="display: none;">
            <!-- Trip Header Card -->
            <div class="card">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span class="badge-status badge-open" id="jobStatusBadge">⚡ Available Trip</span>
                    <span style="font-size: 12px; font-weight: 700; color: #64748B;" id="jobBookingId">#DC-1049</span>
                </div>

                <div class="route-header">
                    <div class="route-title">
                        <span id="jobPickup">Chennai</span>
                        <span class="route-arrow">➔</span>
                        <span id="jobDrop">Bangalore</span>
                    </div>
                </div>

                <div class="info-grid">
                    <div class="info-item">
                        <span class="info-label">🗓️ Date & Time</span>
                        <span class="info-val" id="jobDateTime">26-Sep, 03:30 PM</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">🚗 Vehicle Type</span>
                        <span class="info-val" id="jobCarType">Sedan (Dzire / Etios)</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">🛣️ Trip Type</span>
                        <span class="info-val" id="jobTripType">One Way Drop</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">⚡ Dispatch Mode</span>
                        <span class="info-val" style="color: #2563EB;">Instant Reveal</span>
                    </div>
                </div>

                <div class="fare-banner">
                    <div class="fare-item">
                        <small>Total Customer Fare</small>
                        <span id="jobTotalFare">₹4,850</span>
                    </div>
                    <div class="fare-item fare-driver">
                        <small>Driver Net Amount</small>
                        <span id="jobDriverNet">₹4,350</span>
                    </div>
                </div>
            </div>

            <!-- STEP 1 & 2: Claim Booking & Enter Driver Details (shown when unassigned) -->
            <div id="claimSection" class="card">
                <h3 class="form-title">⚡ Claim this Booking</h3>
                <p class="form-sub">Pay the platform commission and enter your driver/cab credentials to instantly unlock customer contact details.</p>

                <div class="upi-box">
                    <div style="font-size: 11.5px; font-weight: 700; color: #166534; text-transform: uppercase;">Platform Commission Fee</div>
                    <div class="upi-amount" id="jobCommissionAmount">₹350</div>
                    <div style="font-size: 12px; color: #166534; margin-top: 4px;">Pay via GPay / PhonePe / Paytm / UPI</div>
                    <div class="upi-id" style="margin-top: 6px;">dropcars.booking@upi</div>
                </div>

                <form id="driverForm" onsubmit="handleClaimSubmit(event)">
                    <div class="form-group">
                        <label class="form-label">Driver Full Name *</label>
                        <input type="text" class="form-input" id="inputDriverName" placeholder="e.g. Rajesh Kumar" required>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Driver Mobile Number (10 Digits) *</label>
                        <input type="tel" class="form-input" id="inputDriverPhone" placeholder="e.g. 9876543210" pattern="[0-9]{10}" maxlength="10" required>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Cab Model & Color *</label>
                        <input type="text" class="form-input" id="inputCarModel" placeholder="e.g. Toyota Etios (White)" required>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Vehicle Registration Number *</label>
                        <input type="text" class="form-input" id="inputCarNumber" placeholder="e.g. TN 01 AB 1234" required style="text-transform: uppercase;">
                    </div>

                    <div class="form-group">
                        <label class="form-label">UPI Reference / Transaction ID (Optional)</label>
                        <input type="text" class="form-input" id="inputPaymentRef" placeholder="e.g. 426819284918">
                    </div>

                    <button type="submit" class="btn-primary" id="btnSubmitClaim">
                        <span>Confirm & Reveal Customer Contact ➔</span>
                    </button>
                </form>
            </div>

            <!-- STEP 3: Unlocked Customer Details (shown after assignment) -->
            <div id="revealedSection" style="display: none;" class="card customer-card">
                <div style="font-size: 13px; font-weight: 800; color: #047857; text-transform: uppercase; letter-spacing: 0.5px;">
                    🎉 Booking Assigned to You!
                </div>
                <div class="cust-name" id="revCustName">Customer Name</div>
                <div class="cust-phone" id="revCustPhone">+91 98765 43210</div>

                <div class="cust-address">
                    <strong style="color: #065F46;">📍 Doorstep Pickup Address:</strong>
                    <div style="margin-top: 4px;" id="revCustAddress">Pickup Location</div>
                </div>

                <div class="action-row">
                    <a href="#" id="btnDirectCall" class="btn-call">
                        📞 Call Customer
                    </a>
                    <a href="#" id="btnDirectWhatsApp" class="btn-whatsapp" target="_blank">
                        💬 WhatsApp
                    </a>
                </div>

                <a href="#" id="btnDirectNav" target="_blank" style="display: block; margin-top: 10px; background: #1D4ED8; color: #FFF; padding: 12px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px;">
                    🗺️ Google Maps Navigation to Pickup
                </a>
            </div>

        </div>

        <div class="footer">
            Drop Cars Official Driver Network • <a href="https://dropcars.in">dropcars.in</a><br>
            Helpline: <a href="tel:+919363012345">+91 93630 12345</a>
        </div>
    </div>

    <script>
        const ORDER_ID = "<?= $orderId ?>";
        const TOKEN = "<?= $token ?>";
        let currentJob = null;

        async function loadJobDetails() {
            if (!ORDER_ID) {
                document.getElementById('loadingState').innerHTML = '<p style="color: #DC2626; font-weight: 700;">Invalid or missing job link.</p>';
                return;
            }

            try {
                const res = await fetch(`../api/portal-orders.php?action=get_job&id=${encodeURIComponent(ORDER_ID)}&token=${encodeURIComponent(TOKEN)}`);
                const data = await res.json();

                if (!data.ok || !data.job) {
                    document.getElementById('loadingState').innerHTML = `<p style="color: #DC2626; font-weight: 700;">${data.error || 'Job not found or expired.'}</p>`;
                    return;
                }

                currentJob = data.job;
                renderJob(currentJob, data.is_assigned);
            } catch (err) {
                document.getElementById('loadingState').innerHTML = '<p style="color: #DC2626; font-weight: 700;">Network error loading trip details.</p>';
            }
        }

        function renderJob(job, isAssigned) {
            document.getElementById('loadingState').style.display = 'none';
            document.getElementById('jobContent').style.display = 'block';

            document.getElementById('jobBookingId').innerText = `#DC-${job.order_id}`;
            document.getElementById('jobPickup').innerText = job.pickup || 'Pickup City';
            document.getElementById('jobDrop').innerText = job.drop || 'Drop City';
            document.getElementById('jobDateTime').innerText = job.pickup_datetime || 'Upcoming';
            document.getElementById('jobCarType').innerText = (job.car_type || 'Sedan').replace(/_/g, ' ');
            document.getElementById('jobTripType').innerText = job.trip_type || 'One Way';
            document.getElementById('jobTotalFare').innerText = `₹${Number(job.total_fare).toLocaleString('en-IN')}`;
            document.getElementById('jobDriverNet').innerText = `₹${Number(job.driver_net_fare).toLocaleString('en-IN')}`;
            document.getElementById('jobCommissionAmount').innerText = `₹${Number(job.commission_amount).toLocaleString('en-IN')}`;

            if (isAssigned || job.status === 'ASSIGNED') {
                document.getElementById('jobStatusBadge').innerText = '✅ Assigned';
                document.getElementById('jobStatusBadge').className = 'badge-status badge-assigned';
                document.getElementById('claimSection').style.display = 'none';
                document.getElementById('revealedSection').style.display = 'block';

                document.getElementById('revCustName').innerText = job.customer_name || 'Customer';
                document.getElementById('revCustPhone').innerText = job.customer_phone || '';
                document.getElementById('revCustAddress').innerText = job.pickup_address || job.pickup || 'Pickup Location';

                const phoneClean = (job.customer_phone || '').replace(/[^0-9]/g, '');
                document.getElementById('btnDirectCall').href = `tel:+91${phoneClean.slice(-10)}`;
                document.getElementById('btnDirectWhatsApp').href = `https://wa.me/91${phoneClean.slice(-10)}?text=${encodeURIComponent(`Hello ${job.customer_name}, I am your assigned Drop Cars driver for the trip from ${job.pickup} to ${job.drop}.`)}`;
                document.getElementById('btnDirectNav').href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.pickup_address || job.pickup)}`;
            } else {
                document.getElementById('claimSection').style.display = 'block';
                document.getElementById('revealedSection').style.display = 'none';
            }
        }

        async function handleClaimSubmit(e) {
            e.preventDefault();
            const btn = document.getElementById('btnSubmitClaim');
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> Processing Assignment...';

            const payload = {
                order_id: ORDER_ID,
                token: TOKEN,
                driver_name: document.getElementById('inputDriverName').value.trim(),
                driver_phone: document.getElementById('inputDriverPhone').value.trim(),
                car_model: document.getElementById('inputCarModel').value.trim(),
                car_number: document.getElementById('inputCarNumber').value.trim(),
                payment_ref: document.getElementById('inputPaymentRef').value.trim()
            };

            try {
                const res = await fetch('../api/portal-orders.php?action=submit_driver', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();

                if (data.ok) {
                    currentJob = data.job;
                    if (data.customer) {
                        currentJob.customer_name = data.customer.name;
                        currentJob.customer_phone = data.customer.phone;
                        currentJob.pickup_address = data.customer.pickup_address;
                    }
                    renderJob(currentJob, true);
                } else {
                    alert(data.error || 'Failed to submit driver details.');
                    btn.disabled = false;
                    btn.innerHTML = '<span>Confirm & Reveal Customer Contact ➔</span>';
                }
            } catch (err) {
                alert('Network error submitting driver info. Please try again.');
                btn.disabled = false;
                btn.innerHTML = '<span>Confirm & Reveal Customer Contact ➔</span>';
            }
        }

        window.addEventListener('DOMContentLoaded', loadJobDetails);
    </script>
</body>
</html>
