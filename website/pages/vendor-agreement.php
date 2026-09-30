<?php
require_once __DIR__ . '/../includes/paths.php';
require_once __DIR__ . '/../engine/theme-engine.php';
require_once __DIR__ . '/../engine/shell.php';

$themeEngine = new ThemeEngine();
$activeTheme = $themeEngine->detectTheme();
$allThemes = $themeEngine->getAllThemes();
$shell = new UIShell($activeTheme, $allThemes);

$pageTitle = 'Vendor & Fleet Owner Agreement | Drop Cars';
$pageDesc = 'Terms governing fleet owners and vendors who list vehicles and drivers on the Drop Cars platform.';
$canonical = function_exists('dropcars_canonical_request_url') ? dropcars_canonical_request_url() : "https://dropcars.in/pages/vendor-agreement.html";
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
                <h1>Vendor &amp; Fleet Owner Agreement</h1>
                <p>Last updated: August 2026</p>
            </div>

            <div class="legal-card">
                <div class="legal-section">
                    <p><em>DRAFT FOR LEGAL REVIEW - not yet reviewed by a lawyer or finalized. Replace all
                    [bracketed] placeholders with the correct registered business details before
                    publishing or relying on this document. This is standard commercial boilerplate,
                    not a substitute for professional legal advice on your specific situation.</em></p>
                </div>

                <div class="legal-section">
                    <h2>1. Parties &amp; Acceptance</h2>
                    <p>This Vendor &amp; Fleet Owner Agreement ("Agreement") is between <strong>[Drop
                    Cars legal entity name, e.g. "Drop Cars", a proprietorship/company owned and
                    operated by [Registered Owner/Company Name], having its principal place of
                    business at [Registered Address]]</strong> ("Drop Cars", "we", "us") and the
                    person or entity registering as a Fleet Owner or Vendor on the Drop Cars
                    platform ("Vendor", "you"). By registering, submitting vehicle or driver
                    documents, or accepting a booking through the Drop Cars Vendor App, Driver App,
                    or website, you accept this Agreement in full.</p>
                </div>

                <div class="legal-section">
                    <h2>2. Nature of the Relationship</h2>
                    <ul>
                        <li>Drop Cars operates a technology platform connecting customers seeking taxi
                        services with independent Vendors who own or manage vehicles and drivers.
                        Drop Cars is not a transport operator, carrier, or employer of any driver.</li>
                        <li>The Vendor is an independent contractor. Nothing in this Agreement creates
                        an employment, agency, partnership, or joint-venture relationship between the
                        Vendor (or its drivers) and Drop Cars.</li>
                        <li>This arrangement is non-exclusive. Drop Cars may onboard other Vendors,
                        including in the same city or route, at its sole discretion, and may modify,
                        suspend, or discontinue any feature of the platform at any time without
                        liability to the Vendor.</li>
                        <li>Access to the platform is a limited, non-transferable, revocable licence
                        granted solely to receive and fulfil bookings through Drop Cars, and for no
                        other purpose.</li>
                    </ul>
                </div>

                <div class="legal-section">
                    <h2>3. No Bypass of the Platform</h2>
                    <p>The Vendor, and every driver acting on the Vendor's behalf, shall not solicit,
                    contact, or transact with any customer sourced through Drop Cars outside the
                    platform - whether to negotiate a private fare, arrange a future direct booking,
                    or otherwise circumvent Drop Cars as the intermediary - for any booking
                    originated through Drop Cars, and for twelve (12) months after the customer's
                    first booking with that Vendor or driver. Breach of this clause is grounds for
                    immediate suspension or termination under Clause 10, forfeiture of any pending
                    payout, and recovery of Drop Cars' lost commission and damages.</p>
                </div>

                <div class="legal-section">
                    <h2>4. Vendor Representations, Warranties &amp; Obligations</h2>
                    <p>The Vendor represents, warrants, and covenants that at all times, it and its
                    drivers shall:</p>
                    <ul>
                        <li>hold valid, genuine, and current registration certificate (RC), fitness
                        certificate, insurance, permit, and pollution-control certificate for every
                        vehicle listed, and a valid driving licence of the correct class for every
                        driver listed, and upload only genuine, unaltered documents;</li>
                        <li>ensure every listed vehicle is roadworthy, safe, clean, and matches the
                        category, capacity, and features shown on the platform;</li>
                        <li>ensure every driver is competent, sober, appropriately licensed, and of
                        good conduct, and immediately stop using any driver who is not;</li>
                        <li>comply with all Applicable Law, including the Motor Vehicles Act 1988, state
                        transport regulations, traffic law, and applicable tax (including GST)
                        obligations relating to the Vendor's own business;</li>
                        <li>honour accepted bookings, and promptly report any inability to fulfil a
                        booking, cancellation, breakdown, accident, or safety incident to Drop Cars;</li>
                        <li>never overcharge a customer beyond the fare confirmed on the platform, and
                        remit to Drop Cars any platform commission due on every completed booking;</li>
                        <li>not use the platform for any illegal purpose, and promptly report any
                        suspicious request or activity to Drop Cars.</li>
                    </ul>
                    <p>"Applicable Law" means all laws, rules, regulations, and directions applicable
                    to the Vendor's vehicles, drivers, and business, including motor vehicle,
                    transport, labour, tax, and consumer-protection law.</p>
                </div>

                <div class="legal-section">
                    <h2>5. No Unauthorised Vehicle or Driver Substitution</h2>
                    <p>Drop Cars' verification of a vehicle or driver applies only to the specific
                    vehicle and driver record approved on the platform. The Vendor shall dispatch
                    only that verified vehicle and driver for a confirmed booking, and shall not
                    substitute a different vehicle or driver - whether due to the original vehicle
                    being unavailable, under repair, or for any other reason - unless the substitute
                    has first been added to and verified on the platform in the same manner.</p>
                    <p>An unauthorised substitution (including, for example, dispatching a vehicle
                    whose registration certificate, insurance, permit, or fitness certificate is
                    not current, where a different vehicle was shown as verified on the platform) is
                    a material breach of this Agreement. In such a case, the Vendor bears sole and
                    complete responsibility and liability for that vehicle, driver, and trip -
                    including any resulting accident, injury, fine, document non-compliance, or
                    customer claim - regardless of the verified status shown on the platform for the
                    originally listed vehicle or driver. See also Clause 7 (Indemnification).</p>
                </div>

                <div class="legal-section">
                    <h2>6. Fees, Commission &amp; Wallet</h2>
                    <ul>
                        <li>Drop Cars charges a platform commission on each completed booking, at the
                        rate shown in the Vendor App or communicated in writing from time to time.
                        Drop Cars may revise commission rates, wallet-hold amounts, or payout terms on
                        reasonable notice through the Vendor App; continued use of the platform after
                        such notice constitutes acceptance.</li>
                        <li>Amounts held in the Vendor's in-app wallet (including trip holds, advance
                        payments, and pending payouts) are Vendor funds administered by Drop Cars
                        solely to facilitate settlement, and may be adjusted to recover commission,
                        penalties, refunds due to customers, or amounts owed under Clause 6.</li>
                        <li>Drop Cars may withhold any payout pending resolution of a customer
                        complaint, suspected fraud, or a documented safety incident, and release it
                        once resolved.</li>
                    </ul>
                </div>

                <div class="legal-section">
                    <h2>7. Indemnification</h2>
                    <p>The Vendor shall defend, indemnify, and hold harmless Drop Cars, its owners,
                    officers, employees, and affiliates ("Drop Cars Indemnified Parties") from and
                    against any and all claims, demands, losses, liabilities, damages, penalties,
                    fines, costs, and expenses (including reasonable legal fees) arising out of or in
                    connection with:</p>
                    <ul>
                        <li>any accident, injury, property damage, or traffic offence involving a
                        vehicle or driver listed by the Vendor, <strong>or any substitute vehicle or
                        driver dispatched by the Vendor under Clause 5</strong>;</li>
                        <li>any forged, expired, or invalid document submitted by the Vendor, or any
                        vehicle/driver mismatch between what is verified on the platform and what is
                        physically dispatched to a customer;</li>
                        <li>any act, omission, negligence, misconduct, or fraud by the Vendor or its
                        drivers;</li>
                        <li>any claim by a customer, driver, third party, or authority relating to the
                        Vendor's vehicles, drivers, or conduct; and</li>
                        <li>any breach of this Agreement or of Applicable Law by the Vendor or its
                        drivers.</li>
                    </ul>
                    <p>Drop Cars verifies and vouches only for the vehicle and driver documents
                    actually submitted to and approved on the platform. The Vendor bears sole
                    responsibility, without limitation, for any vehicle or driver physically
                    dispatched to a customer that differs from - or is not current with - what is
                    verified on the platform, whether or not Drop Cars had any means to detect the
                    discrepancy in advance.</p>
                </div>

                <div class="legal-section">
                    <h2>8. Limitation of Liability</h2>
                    <ul>
                        <li>The Drop Cars platform is provided "as is" and "as available." Drop Cars
                        does not guarantee any minimum number, frequency, or value of bookings to any
                        Vendor.</li>
                        <li>To the fullest extent permitted by Applicable Law, Drop Cars shall not be
                        liable to the Vendor for any indirect, incidental, special, consequential, or
                        punitive damages, or for loss of profit, revenue, or business, arising from
                        this Agreement or use of the platform.</li>
                        <li>No director, officer, or employee of Drop Cars shall bear any personal
                        liability under or in connection with this Agreement; any claim shall lie
                        solely against the Drop Cars entity identified in Clause 1.</li>
                    </ul>
                </div>

                <div class="legal-section">
                    <h2>9. Data &amp; Confidentiality</h2>
                    <p>Each party shall keep the other's confidential business information
                    confidential and use it only to perform this Agreement. Customer data accessed
                    through the platform (name, phone number, pickup/drop details) may be used
                    solely to complete the assigned booking, and must not be stored, shared, or used
                    for any other purpose, including direct marketing or contact outside the
                    platform.</p>
                </div>

                <div class="legal-section">
                    <h2>10. Verification &amp; Background Checks</h2>
                    <p>The Vendor consents to Drop Cars verifying, at any time and through third
                    parties, the authenticity of documents and the identity of the Vendor and its
                    drivers. An adverse result entitles Drop Cars to suspend or terminate access
                    immediately, and the Vendor shall have no claim against Drop Cars for doing so.</p>
                </div>

                <div class="legal-section">
                    <h2>11. Suspension &amp; Termination</h2>
                    <ul>
                        <li>Either party may terminate this Agreement for convenience on thirty (30)
                        days' written notice (including via the Vendor App or registered email/phone
                        number).</li>
                        <li>Drop Cars may suspend or terminate the Vendor's access immediately, without
                        notice or liability, on any breach of this Agreement, suspected fraud, a
                        forged or invalid document, repeated customer complaints, a serious safety
                        incident, or where continuation would be prejudicial to Drop Cars, its
                        customers, or other Vendors.</li>
                        <li>On termination, the Vendor shall settle all outstanding dues, and Drop Cars
                        shall settle any payout genuinely owed to the Vendor after adjusting amounts
                        due under this Agreement. Clauses 3, 6, 7, 8, and 12 survive termination.</li>
                    </ul>
                </div>

                <div class="legal-section">
                    <h2>12. Force Majeure</h2>
                    <p>Neither party is liable for delay or failure to perform (other than payment
                    obligations) caused by an event beyond its reasonable control, including natural
                    disaster, strike, government action, or internet/telecom failure.</p>
                </div>

                <div class="legal-section">
                    <h2>13. Governing Law &amp; Dispute Resolution</h2>
                    <p>This Agreement is governed by the laws of India. Any dispute shall first be
                    raised with Drop Cars support for good-faith resolution; if unresolved within
                    thirty (30) days, it shall be referred to arbitration under the Arbitration and
                    Conciliation Act, 1996, seated at <strong>[City, State]</strong>, in English, before
                    a sole arbitrator. Subject to this clause, the courts at <strong>[City, State]</strong>
                    shall have exclusive jurisdiction.</p>
                </div>

                <div class="legal-section">
                    <h2>14. General</h2>
                    <ul>
                        <li>This Agreement, together with the Terms &amp; Conditions and Privacy Policy,
                        is the entire agreement between the parties and supersedes prior
                        understandings on the subject.</li>
                        <li>Drop Cars may amend this Agreement on reasonable notice through the Vendor
                        App; continued use after the effective date constitutes acceptance.</li>
                        <li>The Vendor may not assign this Agreement without Drop Cars' prior written
                        consent. Drop Cars may assign it to a successor or affiliate.</li>
                        <li>If any provision is found unenforceable, the remainder of this Agreement
                        continues in effect.</li>
                    </ul>
                </div>

                <div class="legal-section">
                    <p>Questions about this Agreement? Contact us via the Vendor App support option or
                    at <strong>[support contact]</strong>.</p>
                </div>
            </div>
        </div>
    </main>

    <?php echo $shell->renderFooter(); ?>
    <?php echo $shell->renderScripts(); ?>
</body>
</html>
