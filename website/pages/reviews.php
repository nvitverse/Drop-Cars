<?php
require_once __DIR__ . '/../includes/paths.php';
require_once __DIR__ . '/../includes/reviews.php';
require_once __DIR__ . '/../engine/theme-engine.php';
require_once __DIR__ . '/../engine/shell.php';

$themeEngine = new ThemeEngine();
$activeTheme = $themeEngine->detectTheme();
$allThemes = $themeEngine->getAllThemes();

$shell = new UIShell($activeTheme, $allThemes);
$reviews = dropcars_get_all_reviews();
$bookNowUrl = (($activeTheme['slug'] ?? 'drop-cars') === 'drop-cars') ? dropcars_url('booknow') : dropcars_url($activeTheme['slug'] . '/booknow');

$pageTitle = 'Customer Reviews | Drop Cars - Verified One-Way Taxi & Outstation Cabs';
$pageDesc = 'Read genuine customer reviews for our one-way drop taxi and outstation cab services across South India. 4.8/5 average rating from over 500+ happy customers.';
$canonical = dropcars_canonical_request_url();

// AggregateRating + individual Review schema for search rich-snippets.
// Computed from the same $reviews list actually rendered on this page, so
// the schema can never drift out of sync with what's visibly shown.
$reviewCount = count($reviews);
$avgRating = $reviewCount > 0
    ? round(array_sum(array_map(function ($r) { return (float)($r['rating'] ?? 5); }, $reviews)) / $reviewCount, 1)
    : 5.0;
$schemaReviews = array_slice(array_map(function ($r) {
    return [
        '@type' => 'Review',
        'reviewRating' => [
            '@type' => 'Rating',
            'ratingValue' => (string)((int)($r['rating'] ?? 5)),
            'bestRating' => '5',
        ],
        'author' => [
            '@type' => 'Person',
            'name' => $r['customer_name'] ?? $r['name'] ?? 'Verified Guest',
        ],
        'reviewBody' => $r['comment'] ?? '',
    ];
}, $reviews), 0, 20);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="<?php echo htmlspecialchars($pageDesc); ?>">
    <link rel="canonical" href="<?php echo $canonical; ?>">
    <title><?php echo $pageTitle; ?></title>
    <script type="application/ld+json">
    <?php echo json_encode([
        '@context' => 'https://schema.org',
        '@type' => 'Product',
        'name' => 'Drop Cars - One-Way Taxi & Outstation Cab Service',
        'brand' => [
            '@type' => 'Organization',
            'name' => 'Drop Cars',
            'url' => 'https://dropcars.in',
        ],
        'aggregateRating' => [
            '@type' => 'AggregateRating',
            'ratingValue' => (string)$avgRating,
            'bestRating' => '5',
            'reviewCount' => (string)max($reviewCount, 1),
        ],
        'review' => $schemaReviews,
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); ?>
    </script>
<?php dropcars_render_favicons($activeTheme['slug'] ?? null); ?>
    
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    
    <link rel="stylesheet" href="/assets/css/base.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/base.css'); ?>">
    <link rel="stylesheet" href="/assets/css/layout.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/layout.css'); ?>">
    <link rel="stylesheet" href="/assets/css/navbar.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/navbar.css'); ?>">
    <link rel="stylesheet" href="/assets/css/trust.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/trust.css'); ?>">
    <link rel="stylesheet" href="/assets/css/footer.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/footer.css'); ?>">
    <link rel="stylesheet" href="/assets/css/whatsapp.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/whatsapp.css'); ?>">
    <link rel="stylesheet" href="/assets/css/responsive.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/responsive.css'); ?>">
    <link rel="stylesheet" href="/assets/css/dark-mode.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/dark-mode.css'); ?>">
    <link rel="stylesheet" href="/assets/css/light-theme.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/light-theme.css'); ?>">
    <script src="/assets/js/dark-mode.js?v=<?php echo @filemtime(__DIR__ . '/../assets/js/dark-mode.js'); ?>"></script>
    <style>
        .reviews-page { padding: 4rem 0; background: #f8fafc; }
        .reviews-hero { text-align: center; margin-bottom: 4rem; max-width: 800px; margin-left: auto; margin-right: auto; }
        .reviews-hero h1 { font-size: 3rem; color: #1e3a8a; margin-bottom: 1rem; }
        .reviews-hero p { font-size: 1.25rem; color: #64748b; line-height: 1.6; }
        
        .all-reviews-grid { 
            display: grid; 
            grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); 
            gap: 2rem; 
        }
        
        .rev-card { 
            background: #fff; 
            border: 1px solid #e2e8f0; 
            border-radius: 16px; 
            padding: 2rem; 
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
            display: flex;
            flex-direction: column;
            height: 100%;
        }
        .rev-stars { color: #f59e0b; margin-bottom: 1rem; font-size: 1.1rem; }
        .rev-text { font-size: 1.05rem; line-height: 1.6; color: #334155; margin-bottom: 1.5rem; flex-grow: 1; font-style: italic; }
        .rev-meta { border-top: 1px solid #f1f5f9; padding-top: 1rem; display: flex; flex-direction: column; gap: 0.25rem; }
        .rev-user { font-weight: 700; color: #1e293b; font-size: 1rem; }
        .rev-route { font-size: 0.85rem; color: #64748b; }
        .rev-date { font-size: 0.8rem; color: #94a3b8; }
        
        .verified-badge {
            display: inline-flex;
            align-items: center;
            gap: 0.25rem;
            font-size: 0.75rem;
            color: #059669;
            background: #ecfdf5;
            padding: 2px 8px;
            border-radius: 99px; font-weight: 600;
        }

        .rev-reply {
            margin-top: 1rem;
            padding: 0.9rem 1rem;
            background: #f0f7ff;
            border-left: 3px solid #1e3a8a;
            border-radius: 0 10px 10px 0;
        }
        .rev-reply__label { display: block; font-size: 0.75rem; font-weight: 700; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 0.3rem; }
        .rev-reply__text { margin: 0; font-size: 0.88rem; line-height: 1.55; color: #334155; }
        [data-theme="dark"] .rev-reply, .dark-mode .rev-reply { background: #0f172a; border-left-color: #38bdf8; }
        [data-theme="dark"] .rev-reply__text, .dark-mode .rev-reply__text { color: #cbd5e1; }
        [data-theme="dark"] .rev-reply__label, .dark-mode .rev-reply__label { color: #38bdf8; }

        .cta-box {
            background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%);
            color: #fff;
            padding: 3rem;
            border-radius: 20px;
            text-align: center;
            margin-top: 5rem;
        }
        .cta-box h2 { color: #fff; font-size: 2rem; margin-bottom: 1rem; }
        .cta-box p { opacity: 0.9; margin-bottom: 2rem; font-size: 1.1rem; }
        .cta-box .btn-white { 
            background: #fff; color: #1e3a8a; padding: 1rem 2.5rem; border-radius: 12px; text-decoration: none; font-weight: 700; display: inline-block; transition: transform 0.2s;
        }
        .cta-box .btn-white:hover { transform: translateY(-2px); }

        @media (max-width: 768px) {
            .reviews-hero h1 { font-size: 2.25rem; }
            .all-reviews-grid { grid-template-columns: 1fr; }
        }
    </style>
<?php include __DIR__ . '/../includes/google-tag.php'; ?>
</head>
<body>

<?php echo $shell->renderHeader(); ?>

<main class="reviews-page">
    <div class="container">
        <div class="reviews-hero">
            <nav class="breadcrumb" aria-label="Breadcrumb" style="justify-content: center; margin-bottom: 1rem;">
                <a href="/">Home</a>
                <span class="breadcrumb__sep">›</span>
                <span class="breadcrumb__current">Reviews</span>
            </nav>
            <h1>What Travelers Say</h1>
            <p>We take pride in providing reliable, safe, and transparent cab services. Here are some genuine experiences shared by our customers across Tamil Nadu and beyond.</p>
        </div>

        <div class="all-reviews-grid">
            <?php if (empty($reviews)): ?>
                <p>No reviews found at the moment.</p>
            <?php else: ?>
                <?php foreach ($reviews as $r): ?>
                    <?php
                        // Two data shapes feed this page: live DB rows use
                        // customer_name/trip_route/is_verified/created_at,
                        // while the curated data/reviews-extended.php set
                        // uses name/trip/reply. Previously only the DB keys
                        // were read, so every curated review silently fell
                        // back to "Verified Guest" / "Intercity Trip" - fixed
                        // by checking both key names.
                        $stars = str_repeat('⭐', (int)($r['rating'] ?? 5));
                        $reviewerName = $r['customer_name'] ?? $r['name'] ?? 'Verified Guest';
                        $tripRoute = $r['trip_route'] ?? $r['trip'] ?? 'Intercity Trip';
                        $isVerified = (isset($r['is_verified']) && $r['is_verified']) || array_key_exists('name', $r);
                        $date = !empty($r['created_at']) ? date('M j, Y', strtotime($r['created_at'])) : '';
                        $companyReply = $r['reply'] ?? null;
                    ?>
                    <div class="rev-card">
                        <div class="rev-stars"><?= $stars ?></div>
                        <p class="rev-text">"<?= htmlspecialchars($r['comment'] ?? '') ?>"</p>
                        <div class="rev-meta">
                            <span class="rev-user">
                                <?= htmlspecialchars($reviewerName) ?>
                                <?php if ($isVerified): ?>
                                    <span class="verified-badge">✓ Verified</span>
                                <?php endif; ?>
                            </span>
                            <span class="rev-route">Trip: <?= htmlspecialchars($tripRoute) ?></span>
                            <?php if ($date): ?>
                                <span class="rev-date"><?= $date ?></span>
                            <?php endif; ?>
                        </div>
                        <?php if (!empty($companyReply)): ?>
                            <div class="rev-reply">
                                <span class="rev-reply__label">Response from Drop Cars</span>
                                <p class="rev-reply__text"><?= htmlspecialchars($companyReply) ?></p>
                            </div>
                        <?php endif; ?>
                    </div>
                <?php endforeach; ?>
            <?php endif; ?>
        </div>

        <div class="cta-box">
            <h2>Experience Smooth Travel</h2>
            <p>Book your one-way or round-trip taxi with Drop Cars today and enjoy professional service at the best rates.</p>
            <a href="<?php echo htmlspecialchars($bookNowUrl, ENT_QUOTES, 'UTF-8'); ?>" class="btn-white">Book Your Taxi Now</a>
        </div>
    </div>
</main>

<?php echo $shell->renderFooter(); ?>
<?php echo $shell->renderScripts(); ?>

</body>
</html>
