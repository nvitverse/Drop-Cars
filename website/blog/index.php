<?php
require_once __DIR__ . '/../includes/paths.php';
require_once __DIR__ . '/../engine/shell.php';
require_once __DIR__ . '/../engine/seo-core.php';

// Load all posts
$postsDir = __DIR__ . '/posts/';
$posts = [];
foreach (glob($postsDir . '*.php') as $file) {
    $data = require $file;
    if (is_array($data) && isset($data['slug'])) {
        $posts[] = $data;
    }
}
// Sort by date descending
usort($posts, function($a, $b) {
    return strcmp($b['date'] ?? '', $a['date'] ?? '');
});

$allThemes = is_file(__DIR__ . '/../data/themes.json') ? json_decode(file_get_contents(__DIR__ . '/../data/themes.json'), true) : [];
$activeTheme = ['id' => 'drop-cars', 'name' => 'Drop Cars', 'slug' => 'drop-cars'];
$shell = new UIShell($activeTheme, $allThemes);
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Travel Tips & Guides | Drop Cars Blog</title>
  <meta name="description" content="Read travel guides, taxi tips, and outstation trip advice from Drop Cars. Plan smarter intercity travel across Tamil Nadu." />
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
    .blog-hero { background: var(--blue); color: #fff; padding: 3.5rem 0 2.5rem; text-align: center; }
    .blog-hero h1 { font-size: clamp(1.8rem, 4vw, 2.8rem); margin-bottom: 0.75rem; }
    .blog-hero p { opacity: 0.78; font-size: 1.05rem; }
    .blog-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem; padding: 3rem 0; }
    .blog-card { background: var(--white); border: 1px solid var(--gray-200); border-radius: 16px; overflow: hidden; text-decoration: none; color: inherit; display: flex; flex-direction: column; transition: transform 0.25s, box-shadow 0.25s; }
    .blog-card:hover { transform: translateY(-5px); box-shadow: 0 16px 40px rgba(0,0,0,0.1); }
    .blog-card__img { aspect-ratio: 16/7; object-fit: cover; width: 100%; background: var(--gray-100); }
    .blog-card__body { padding: 1.25rem; flex: 1; display: flex; flex-direction: column; }
    .blog-card__cat { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--accent, #38bdf8); margin-bottom: 0.5rem; }
    .blog-card__title { font-size: 1.05rem; font-weight: 700; color: var(--blue-dark); line-height: 1.4; margin-bottom: 0.5rem; }
    .blog-card__desc { font-size: 0.88rem; color: var(--gray-400); line-height: 1.6; flex: 1; }
    .blog-card__footer { margin-top: 1rem; font-size: 0.8rem; color: var(--gray-300); }
    [data-theme="dark"] .blog-card { background: #1e293b; border-color: #334155; }
    [data-theme="dark"] .blog-card__title { color: #f1f5f9; }
  </style>
</head>
<body>
<?php echo $shell->renderHeader(); ?>

<section class="blog-hero">
  <div class="container">
    <p class="eyebrow" style="color:var(--accent);">Drop Cars Blog</p>
    <h1>Travel Tips & Route Guides</h1>
    <p>Expert advice for intercity taxi travel across Tamil Nadu</p>
  </div>
</section>

<main>
  <div class="container">
    <div class="blog-grid">
      <?php foreach ($posts as $post): ?>
      <a href="/blog/<?php echo htmlspecialchars($post['slug'], ENT_QUOTES, 'UTF-8'); ?>/" class="blog-card anim-reveal">
        <img class="blog-card__img" src="<?php echo htmlspecialchars($post['image'] ?? '/assets/img/hero-bg.jpg', ENT_QUOTES, 'UTF-8'); ?>" alt="<?php echo htmlspecialchars($post['title'], ENT_QUOTES, 'UTF-8'); ?>" loading="lazy" />
        <div class="blog-card__body">
          <div class="blog-card__cat"><?php echo htmlspecialchars($post['category'] ?? 'Travel', ENT_QUOTES, 'UTF-8'); ?></div>
          <div class="blog-card__title"><?php echo htmlspecialchars($post['title'], ENT_QUOTES, 'UTF-8'); ?></div>
          <div class="blog-card__desc"><?php echo htmlspecialchars($post['description'] ?? '', ENT_QUOTES, 'UTF-8'); ?></div>
          <div class="blog-card__footer"><?php echo htmlspecialchars(date('F j, Y', strtotime($post['date'] ?? 'now')), ENT_QUOTES, 'UTF-8'); ?></div>
        </div>
      </a>
      <?php endforeach; ?>
    </div>
  </div>
</main>

<?php echo $shell->renderFooter(); ?>
<?php echo $shell->renderScripts(); ?>
<script defer src="/assets/js/animations.js"></script>
</body>
</html>
