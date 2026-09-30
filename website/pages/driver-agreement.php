<?php
require_once __DIR__ . '/../includes/paths.php';
require_once __DIR__ . '/../engine/theme-engine.php';
require_once __DIR__ . '/../engine/shell.php';

$themeEngine = new ThemeEngine();
$activeTheme = $themeEngine->detectTheme();
$allThemes = $themeEngine->getAllThemes();
$shell = new UIShell($activeTheme, $allThemes);

$pageTitle = 'Driver Agreement | Drop Cars';
$pageDesc = 'Terms governing drivers who accept and fulfil bookings on the Drop Cars platform.';
$canonical = function_exists('dropcars_canonical_request_url') ? dropcars_canonical_request_url() : "https://dropcars.in/pages/driver-agreement.html";
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, follow">
    <meta name="description" content="<?php echo htmlspecialchars($pageDesc); ?>">
    <link rel="canonical" href="<?php echo $canonical; ?>">
    <title><?php echo $pageTitle; ?></title>
<?php dropcars_render_favicons($activeTheme['slug'] ?? null); ?>

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">

    <link rel="stylesheet" href="/assets/css/base.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/base.css'); ?>">
    <link rel="stylesheet" href="/assets/css/layout.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/layout.css'); ?>">
    <link rel="stylesheet" href="/assets/css/navbar.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/navbar.css'); ?>">
    <link rel="stylesheet" href="/assets/css/legal-pages.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/legal-pages.css'); ?>">
    <link rel="stylesheet" href="/assets/css/footer.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/footer.css'); ?>">
    <link rel="stylesheet" href="/assets/css/whatsapp.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/whatsapp.css'); ?>">
    <link rel="stylesheet" href="/assets/css/responsive.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/responsive.css'); ?>">
    <link rel="stylesheet" href="/assets/css/dark-mode.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/dark-mode.css'); ?>">
    <link rel="stylesheet" href="/assets/css/light-theme.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/light-theme.css'); ?>">
    <?php if (($activeTheme['slug'] ?? '') === 'airport-taxi'): ?>
    <link rel="stylesheet" href="/assets/css/theme-airporttaxi.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/theme-airporttaxi.css'); ?>">
    <?php endif; ?>
    <script src="/assets/js/dark-mode.js?v=<?php echo @filemtime(__DIR__ . '/../assets/js/dark-mode.js'); ?>"></script>
<?php include __DIR__ . '/../includes/google-tag.php'; ?>
</head>
<body class="<?php echo ($activeTheme['slug'] ?? '') === 'airport-taxi' ? ('theme-airporttaxi ' . (function_exists('dropcars_is_native_airporttaxi_host') && dropcars_is_native_airporttaxi_host() ? 'ati-native' : 'ati-embedded')) : ''; ?>">
    <?php echo $shell->renderHeader(); ?>

    <main class="legal-page">
        <div class="container">
            <div class="legal-hero">
                <span class="policy-badge">Partner Agreement</span>
                <h1>Driver Agreement</h1>
                <p>Last updated: August 2026</p>
            </div>

            <div class="legal-card">
                <div class="legal-section">
                    <p><em>DRAFT FOR LEGAL REVIEW - not yet reviewed by a lawyer or finalized. Replace all
                    [bracketed] placeholders with the correct registered business details before
                    publishing or relying on this document.</em></p>
                </div>

                <div class="legal-section">
                    <h2>1. Parties &amp; Acceptance</h2>
                    <p>This Driver Agreement ("Agreement") is between <strong>[Drop Cars legal
                    entity name, e.g. "Drop Cars", a proprietorship/company owned and operated by
                    [Registered Owner/Company Name], having its principal place of business at
                    [Registered Address]]</strong> ("Drop Cars", "we", "us") and the individual
                    registering as a driver on the Drop Cars platform, whether driving their own
                    vehicle, a vehicle owned by a Vendor/Fleet Owner, or engaged by a Vendor as a
                    duty driver ("Driver", "you"). By registering, submitting your licence and
                    identity documents, or accepting a trip through the Drop Cars Driver App, you
                    accept this Agreement in full. Where you drive on behalf of a Vendor/Fleet
                    Owner, this Agreement applies to you in addition to - not instead of - the
                    Vendor &amp; Fleet Owner Agreement governing that Vendor.</p>
                </div>

                <div class="legal-section">
                    <h2>2. Nature of the Relationship</h2>
                    <ul>
                        <li>Drop Cars operates a technology platform connecting customers with
                        independent drivers. Drop Cars is not a transport operator, carrier, or
                        employer.</li>
                        <li>The Driver is an independent contractor (or, where engaged by a Vendor,
                        the Vendor's own contractor/employee). Nothing in this Agreement creates an
                        employment, agency, partnership, or joint-venture relationship between the
                        Driver and Drop Cars.</li>
                        <li>Access to the Driver App is a limited, non-transferable, revocable
                        licence granted solely to receive and fulfil bookings through Drop Cars, and
                        for no other purpose. Drop Cars may modify, suspend, or discontinue any
                        feature at any time without liability to the Driver.</li>
                    </ul>
                </div>

                <div class="legal-section">
                    <h2>3. No Bypass of the Platform</h2>
                    <p>The Driver shall not solicit, contact, or transact with any customer sourced
                    through Drop Cars outside the platform - whether to negotiate a private fare,
                    arrange a future direct booking, or otherwise circumvent Drop Cars as the
                    intermediary - for any booking originated through Drop Cars, and for twelve (12)
                    months after the customer's first trip with that Driver. Breach of this clause
                    is grounds for immediate suspension or termination under Clause 9, forfeiture of
                    any pending payout, and recovery of Drop Cars' lost commission and damages.</p>
                </div>

                <div class="legal-section">
                    <h2>4. Driver Representations, Warranties &amp; Conduct</h2>
                    <p>The Driver represents, warrants, and covenants that at all times they shall:</p>
                    <ul>
                        <li>hold a valid, genuine, and current driving licence of the correct class
                        for the vehicle driven, and upload only genuine, unaltered documents;</li>
                        <li>be fit to drive - sober, rested, and free of any condition that impairs
                        safe driving - for the entire duration of every trip;</li>
                        <li>drive safely, obey all traffic law, and treat every customer, their
                        belongings, and the vehicle with care and respect;</li>
                        <li>drive only the specific vehicle assigned to a booking and verified on the
                        platform for that trip - see Clause 5;</li>
                        <li>never demand or collect any amount beyond the fare confirmed on the
                        platform, and never ask a customer to pay outside the app/authorised
                        payment method except where explicitly permitted (e.g. cash collection
                        flows) by Drop Cars;</li>
                        <li>not consume alcohol or any impairing substance before or during a trip,
                        and not smoke inside the vehicle while a customer is on board;</li>
                        <li>report any accident, breakdown, safety incident, or customer complaint to
                        Drop Cars and the relevant Vendor promptly;</li>
                        <li>not carry any passenger, item, or cargo not authorised as part of the
                        booking, and not use the vehicle or trip for any illegal purpose.</li>
                    </ul>
                </div>

                <div class="legal-section">
                    <h2>5. Vehicle &amp; Identity Verification</h2>
                    <p>Drop Cars' verification of a driver and vehicle applies only to the specific
                    driver-vehicle pairing approved for a booking. The Driver shall not drive a
                    different, unverified vehicle for a confirmed booking, and shall not allow
                    another person to drive in their place, without that substitution first being
                    added to and verified on the platform. An unauthorised substitution is a
                    material breach of this Agreement, and the Driver (together with the Vendor, if
                    any) bears sole responsibility for any resulting accident, injury, fine, or
                    customer claim. The Driver consents to Drop Cars verifying, at any time and
                    through third parties, their identity, licence, and background.</p>
                </div>

                <div class="legal-section">
                    <h2>6. Fees &amp; Payment</h2>
                    <p>Where the Driver is also the Vendor (an owner-driver), Clause 6 (Fees,
                    Commission &amp; Wallet) of the Vendor &amp; Fleet Owner Agreement applies.
                    Where the Driver is engaged by a Vendor, payment, commission, and wallet
                    settlement between the Driver and that Vendor are the Vendor's sole
                    responsibility; Drop Cars is not a party to and bears no liability for that
                    arrangement.</p>
                </div>

                <div class="legal-section">
                    <h2>7. Indemnification</h2>
                    <p>The Driver shall defend, indemnify, and hold harmless Drop Cars, its owners,
                    officers, employees, and affiliates ("Drop Cars Indemnified Parties") from and
                    against any and all claims, demands, losses, liabilities, damages, penalties,
                    fines, costs, and expenses (including reasonable legal fees) arising out of or in
                    connection with:</p>
                    <ul>
                        <li>any accident, injury, or property damage caused or contributed to by the
                        Driver's driving or conduct;</li>
                        <li>any traffic offence, fine, or licence issue attributable to the Driver;</li>
                        <li>any forged, expired, or invalid document submitted by the Driver, or any
                        unauthorised vehicle/driver substitution under Clause 5;</li>
                        <li>any act, omission, negligence, misconduct, or fraud by the Driver,
                        including overcharging or off-platform solicitation; and</li>
                        <li>any claim by a customer, Vendor, third party, or authority relating to the
                        Driver's conduct.</li>
                    </ul>
                </div>

                <div class="legal-section">
                    <h2>8. Limitation of Liability</h2>
                    <ul>
                        <li>The Drop Cars platform is provided "as is" and "as available." Drop Cars
                        does not guarantee any minimum number, frequency, or value of trips to any
                        Driver.</li>
                        <li>To the fullest extent permitted by Applicable Law, Drop Cars shall not be
                        liable to the Driver for any indirect, incidental, special, consequential, or
                        punitive damages, or for loss of profit, revenue, or business, arising from
                        this Agreement or use of the platform.</li>
                        <li>No director, officer, or employee of Drop Cars shall bear any personal
                        liability under or in connection with this Agreement; any claim shall lie
                        solely against the Drop Cars entity identified in Clause 1.</li>
                    </ul>
                </div>

                <div class="legal-section">
                    <h2>9. Suspension &amp; Termination</h2>
                    <ul>
                        <li>Either party may terminate this Agreement for convenience on thirty (30)
                        days' written notice (including via the Driver App or registered email/phone
                        number).</li>
                        <li>Drop Cars may suspend or terminate the Driver's access immediately,
                        without notice or liability, on any breach of this Agreement, a forged or
                        invalid document, repeated customer complaints, a serious safety incident, or
                        where continuation would be prejudicial to Drop Cars, its customers, or other
                        users.</li>
                        <li>Clauses 3, 7, 8, and 10 survive termination.</li>
                    </ul>
                </div>

                <div class="legal-section">
                    <h2>10. Governing Law &amp; Dispute Resolution</h2>
                    <p>This Agreement is governed by the laws of India. Any dispute shall first be
                    raised with Drop Cars support for good-faith resolution; if unresolved within
                    thirty (30) days, it shall be referred to arbitration under the Arbitration and
                    Conciliation Act, 1996, seated at <strong>[City, State]</strong>, in English, before
                    a sole arbitrator. Subject to this clause, the courts at <strong>[City,
                    State]</strong> shall have exclusive jurisdiction.</p>
                </div>

                <div class="legal-section">
                    <h2>11. General</h2>
                    <ul>
                        <li>This Agreement, together with the Terms &amp; Conditions and Privacy
                        Policy (and, where applicable, the Vendor &amp; Fleet Owner Agreement), is
                        the entire agreement between the parties on this subject.</li>
                        <li>Drop Cars may amend this Agreement on reasonable notice through the
                        Driver App; continued use after the effective date constitutes acceptance.</li>
                        <li>If any provision is found unenforceable, the remainder of this Agreement
                        continues in effect.</li>
                    </ul>
                </div>

                <div class="legal-section">
                    <p>Questions about this Agreement? Contact us via the Driver App support option
                    or at <strong>[support contact]</strong>.</p>
                </div>
            </div>
        </div>
    </main>

    <?php echo $shell->renderFooter(); ?>
    <?php echo $shell->renderScripts(); ?>
</body>
</html>
