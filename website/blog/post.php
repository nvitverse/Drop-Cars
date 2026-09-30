<?php
require_once __DIR__ . '/../includes/paths.php';
require_once __DIR__ . '/../engine/shell.php';
require_once __DIR__ . '/../engine/seo-core.php';

$slug = preg_replace('/[^a-z0-9-]/', '', strtolower($_GET['slug'] ?? ''));
if ($slug === '') { header('HTTP/1.0 404 Not Found'); echo '<h1>404</h1>'; exit; }

$postFile = __DIR__ . '/posts/' . $slug . '.php';
if (!is_file($postFile)) { header('HTTP/1.0 404 Not Found'); echo '<h1>Post not found</h1>'; exit; }

$post = require $postFile;
if (!is_array($post)) { header('HTTP/1.0 404 Not Found'); exit; }

// Related posts (all except current)
$postsDir = __DIR__ . '/posts/';
$related = [];
foreach (glob($postsDir . '*.php') as $file) {
    $d = require $file;
    if (is_array($d) && ($d['slug'] ?? '') !== $slug) $related[] = $d;
}

$allThemes = is_file(__DIR__ . '/../data/themes.json') ? json_decode(file_get_contents(__DIR__ . '/../data/themes.json'), true) : [];
$activeTheme = ['id' => 'drop-cars', 'name' => 'Drop Cars', 'slug' => 'drop-cars'];
$shell = new UIShell($activeTheme, $allThemes);
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title><?php echo htmlspecialchars($post['title'], ENT_QUOTES, 'UTF-8'); ?> | Drop Cars</title>
  <meta name="description" content="<?php echo htmlspecialchars($post['description'] ?? '', ENT_QUOTES, 'UTF-8'); ?>" />
  <link rel="canonical" href="https://dropcars.in/blog/<?php echo htmlspecialchars($slug, ENT_QUOTES, 'UTF-8'); ?>/" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/assets/css/base.css" />
  <link rel="stylesheet" href="/assets/css/layout.css" />
  <link rel="stylesheet" href="/assets/css/navbar.css" />
  <link rel="stylesheet" href="/assets/css/footer.css" />
  <link rel="stylesheet" href="/assets/css/animations.css" />
  <link rel="stylesheet" href="/assets/css/dark-mode.css" />
    <link rel="stylesheet" href="/assets/css/light-theme.css">
  <link rel="stylesheet" href="/assets/css/sticky-book-btn.css" />
  <script src="/assets/js/dark-mode.js"></script>
  <style>
    .post-hero { background: var(--blue); color: #fff; padding: 3rem 0 2rem; }
    .post-hero__cat { font-size:0.78rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--accent,#38bdf8); margin-bottom:0.75rem; }
    .post-hero h1 { font-size:clamp(1.6rem,4vw,2.4rem); line-height:1.3; margin-bottom:0.75rem; }
    .post-hero__meta { font-size:0.85rem; opacity:0.7; }
    .post-body { max-width: 760px; margin: 3rem auto; padding: 0 1rem; }
    .post-body h2 { font-size:1.5rem; margin:2.25rem 0 0.75rem; color:var(--blue-dark); }
    .post-body h3 { font-size:1.2rem; margin:1.75rem 0 0.6rem; color:var(--blue-dark); }
    .post-body p { line-height:1.8; color:var(--gray-600); margin-bottom:1rem; }
    .post-body ul, .post-body ol { padding-left:1.4rem; margin-bottom:1rem; }
    .post-body li { line-height:1.8; color:var(--gray-600); margin-bottom:0.35rem; }
    .post-body table { border-radius:10px; overflow:hidden; }
    .related-posts { padding:3rem 0; background:var(--gray-50); }
    .related-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:1.25rem; margin-top:1.5rem; }
    .related-card { background:var(--white); border:1px solid var(--gray-200); border-radius:14px; padding:1.25rem; text-decoration:none; color:inherit; display:block; transition:transform 0.22s; }
    .related-card:hover { transform:translateY(-4px); box-shadow:0 12px 30px rgba(0,0,0,0.09); }
    .related-card__cat { font-size:0.72rem; font-weight:700; text-transform:uppercase; color:var(--accent,#38bdf8); margin-bottom:0.4rem; }
    .related-card__title { font-size:0.97rem; font-weight:700; color:var(--blue-dark); line-height:1.4; }
    [data-theme="dark"] .post-body h2, [data-theme="dark"] .post-body h3 { color:#f1f5f9; }
    [data-theme="dark"] .post-body p, [data-theme="dark"] .post-body li { color:#94a3b8; }
    [data-theme="dark"] .related-posts { background:#0f172a; }
    [data-theme="dark"] .related-card { background:#1e293b; border-color:#334155; }
    [data-theme="dark"] .related-card__title { color:#f1f5f9; }
  </style>
</head>
<body>
<?php echo $shell->renderHeader(); ?>

<section class="post-hero">
  <div class="container">
    <div class="post-hero__cat"><?php echo htmlspecialchars($post['category'] ?? 'Travel', ENT_QUOTES, 'UTF-8'); ?></div>
    <h1><?php echo htmlspecialchars($post['title'], ENT_QUOTES, 'UTF-8'); ?></h1>
    <div class="post-hero__meta"><?php echo htmlspecialchars(date('F j, Y', strtotime($post['date'] ?? 'now')), ENT_QUOTES, 'UTF-8'); ?> &nbsp;·&nbsp; Drop Cars Editorial</div>
  </div>
</section>

<main>
  <article class="post-body">
    <?php echo $post['body'] ?? ''; ?>
  </article>

  <?php if (!empty($related)): ?>
  <section class="related-posts">
    <div class="container">
      <h2 style="margin-bottom:0;">More Travel Guides</h2>
      <div class="related-grid">
        <?php foreach (array_slice($related, 0, 3) as $r): ?>
        <a href="/blog/<?php echo htmlspecialchars($r['slug'], ENT_QUOTES, 'UTF-8'); ?>/" class="related-card anim-reveal">
          <div class="related-card__cat"><?php echo htmlspecialchars($r['category'] ?? '', ENT_QUOTES, 'UTF-8'); ?></div>
          <div class="related-card__title"><?php echo htmlspecialchars($r['title'], ENT_QUOTES, 'UTF-8'); ?></div>
        </a>
        <?php endforeach; ?>
      </div>
    </div>
  </section>
  <?php endif; ?>
</main>

<div class="sticky-book-bar">
  <div class="sticky-book-bar__text">
    <strong>Book Your Ride</strong>
    Instant fare · Verified drivers
  </div>
  <a href="/#booking" class="sticky-book-bar__btn">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
    Book Now
  </a>
</div>

<?php echo $shell->renderFooter(); ?>
<?php echo $shell->renderScripts(); ?>
<script defer src="/assets/js/animations.js"></script>
</body>
</html>
