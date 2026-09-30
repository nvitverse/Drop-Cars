<?php
/**
 * Developer page – profile of the developer behind Drop Cars.
 */
require_once __DIR__ . '/../engine/shell.php';

$shell = new UIShell();
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="Meet Naveen Rajendran – the developer behind Drop Cars, a premium intercity taxi platform serving South India. Contact via phone, email, or LinkedIn.">
    <title>Developer | Naveen Rajendran – Drop Cars</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/assets/css/base.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/base.css'); ?>">
    <link rel="stylesheet" href="/assets/css/navbar.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/navbar.css'); ?>">
    <link rel="stylesheet" href="/assets/css/footer.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/footer.css'); ?>">
    <link rel="stylesheet" href="/assets/css/layout.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/layout.css'); ?>">
    <link rel="stylesheet" href="/assets/css/developer-page.css">
    <link rel="stylesheet" href="/assets/css/theme-switcher.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/theme-switcher.css'); ?>">
    <link rel="stylesheet" href="/assets/css/responsive.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/responsive.css'); ?>">
    <link rel="stylesheet" href="/assets/css/dark-mode.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/dark-mode.css'); ?>">
    <link rel="stylesheet" href="/assets/css/light-theme.css?v=<?php echo @filemtime(__DIR__ . '/../assets/css/light-theme.css'); ?>">
    <script src="/assets/js/dark-mode.js?v=<?php echo @filemtime(__DIR__ . '/../assets/js/dark-mode.js'); ?>"></script>
<?php include __DIR__ . '/../includes/google-tag.php'; ?>
</head>
<body>
<?php echo $shell->renderHeader(); ?>

<main class="dev-page">

    <!-- ── Hero ── -->
    <section class="dev-hero">
        <div class="dev-hero__bg-circles" aria-hidden="true">
            <span class="circle c1"></span>
            <span class="circle c2"></span>
            <span class="circle c3"></span>
        </div>
        <div class="container dev-hero__inner">
            <div class="dev-hero__avatar-wrap">
                <div class="dev-hero__avatar" aria-label="Naveen Rajendran">
                    <span class="dev-hero__avatar-initials">NR</span>
                </div>
                <span class="dev-hero__badge">
                    <svg viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><circle cx="5" cy="5" r="5"/></svg>
                    Available for Projects
                </span>
            </div>
            <div class="dev-hero__info">
                <p class="eyebrow">Developer Profile</p>
                <h1 class="dev-hero__name">Naveen Rajendran</h1>
                <p class="dev-hero__role">Full-Stack Web Developer &amp; Digital Architect</p>
                <p class="dev-hero__tagline">
                    Crafting fast, beautiful, and conversion-focused web platforms.
                    Creator of <strong>Drop Cars</strong> – a premium intercity taxi platform serving
                    South India with real-time booking, dynamic pricing &amp; smart SEO.
                </p>
                <div class="dev-hero__actions">
                    <a class="btn-primary" href="tel:+918838480505" id="dev-cta-call">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.86.3 1.7.54 2.5a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.58-1.11a2 2 0 0 1 2.11-.45c.8.24 1.64.42 2.5.54A2 2 0 0 1 22 16.92z"/></svg>
                        Call Now
                    </a>
                    <a class="btn-outline" href="mailto:nvitverse@gmail.com" id="dev-cta-mail">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="M22 6l-10 7L2 6"/></svg>
                        Send Email
                    </a>
                </div>
            </div>
        </div>
    </section>

    <!-- ── Contact Cards ── -->
    <section class="dev-contact" id="dev-contact">
        <div class="container">
            <p class="eyebrow" style="text-align:center;">Get In Touch</p>
            <h2 class="dev-section-title">Contact Naveen</h2>
            <p class="dev-section-sub">Reach out on any channel — I respond within 24 hours.</p>

            <div class="dev-contact__grid">

                <!-- Phone -->
                <a class="dev-contact-card" href="tel:+918838480505" id="dev-card-phone">
                    <div class="dev-contact-card__icon dev-contact-card__icon--phone">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.86.3 1.7.54 2.5a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.58-1.11a2 2 0 0 1 2.11-.45c.8.24 1.64.42 2.5.54A2 2 0 0 1 22 16.92z"/></svg>
                    </div>
                    <div class="dev-contact-card__body">
                        <span class="dev-contact-card__label">Phone</span>
                        <span class="dev-contact-card__value">+91 88384 80505</span>
                    </div>
                    <div class="dev-contact-card__arrow" aria-hidden="true">→</div>
                </a>

                <!-- Email -->
                <a class="dev-contact-card" href="mailto:nvitverse@gmail.com" id="dev-card-email">
                    <div class="dev-contact-card__icon dev-contact-card__icon--email">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="M22 6l-10 7L2 6"/></svg>
                    </div>
                    <div class="dev-contact-card__body">
                        <span class="dev-contact-card__label">Email</span>
                        <span class="dev-contact-card__value">nvitverse@gmail.com</span>
                    </div>
                    <div class="dev-contact-card__arrow" aria-hidden="true">→</div>
                </a>

                <!-- WhatsApp -->
                <a class="dev-contact-card" href="https://wa.me/918838480505" target="_blank" rel="noopener noreferrer" id="dev-card-whatsapp">
                    <div class="dev-contact-card__icon dev-contact-card__icon--whatsapp">
                        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.881 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    </div>
                    <div class="dev-contact-card__body">
                        <span class="dev-contact-card__label">WhatsApp</span>
                        <span class="dev-contact-card__value">Chat Instantly</span>
                    </div>
                    <div class="dev-contact-card__arrow" aria-hidden="true">→</div>
                </a>

                <!-- LinkedIn -->
                <a class="dev-contact-card" href="https://www.linkedin.com/in/naveen-rajendran" target="_blank" rel="noopener noreferrer" id="dev-card-linkedin">
                    <div class="dev-contact-card__icon dev-contact-card__icon--linkedin">
                        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                    </div>
                    <div class="dev-contact-card__body">
                        <span class="dev-contact-card__label">LinkedIn</span>
                        <span class="dev-contact-card__value">View Profile</span>
                    </div>
                    <div class="dev-contact-card__arrow" aria-hidden="true">→</div>
                </a>

                <!-- GitHub -->
                <a class="dev-contact-card" href="https://github.com/nvitverse" target="_blank" rel="noopener noreferrer" id="dev-card-github">
                    <div class="dev-contact-card__icon dev-contact-card__icon--github">
                        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
                    </div>
                    <div class="dev-contact-card__body">
                        <span class="dev-contact-card__label">GitHub</span>
                        <span class="dev-contact-card__value">nvitverse</span>
                    </div>
                    <div class="dev-contact-card__arrow" aria-hidden="true">→</div>
                </a>

                <!-- Portfolio/Website -->
                <a class="dev-contact-card" href="https://nvitverse.com" target="_blank" rel="noopener noreferrer" id="dev-card-portfolio">
                    <div class="dev-contact-card__icon dev-contact-card__icon--portfolio">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                    </div>
                    <div class="dev-contact-card__body">
                        <span class="dev-contact-card__label">Portfolio</span>
                        <span class="dev-contact-card__value">nvitverse.com</span>
                    </div>
                    <div class="dev-contact-card__arrow" aria-hidden="true">→</div>
                </a>

            </div>
        </div>
    </section>

    <!-- ── About / Skills ── -->
    <section class="dev-about" id="dev-about">
        <div class="container dev-about__inner">
            <div class="dev-about__text">
                <p class="eyebrow">About</p>
                <h2>Engineering Digital Experiences</h2>
                <p>
                    Naveen Rajendran is a passionate full-stack developer with deep expertise in building
                    performance-first web platforms. He designed and developed <strong>Drop Cars</strong>
                    end-to-end — from database architecture and dynamic pricing to SEO-optimised city hub
                    pages and a real-time admin dashboard.
                </p>
                <p>
                    With a strong command of PHP, JavaScript, MySQL, and modern CSS, Naveen delivers
                    premium digital products that balance technical excellence with stunning design.
                    His specialty lies in <strong>Business Automation</strong> — streamlining operations
                    through automated messaging, real-time data sync, and custom CRM workflows.
                </p>
                <div class="dev-about__tags">
                    <span class="dev-tag">PHP</span>
                    <span class="dev-tag">JavaScript</span>
                    <span class="dev-tag">MySQL</span>
                    <span class="dev-tag">Business Automation</span>
                    <span class="dev-tag">SEO Architecture</span>
                    <span class="dev-tag">REST APIs</span>
                    <span class="dev-tag">UI/UX Design</span>
                    <span class="dev-tag">WhatsApp & Telegram Bot</span>
                    <span class="dev-tag">Google Sheets CRM</span>
                </div>
            </div>

            <div class="dev-about__project">
                <div class="dev-project-card">
                    <div class="dev-project-card__header">
                        <div class="dev-project-card__logo">
                            <span class="logo__mark">Drop</span><span class="logo__text">Cars</span>
                        </div>
                        <span class="dev-project-card__status">Live Product</span>
                    </div>
                    <h3 class="dev-project-card__title">Drop Cars – Intercity Taxi Platform</h3>
                    <p class="dev-project-card__desc">
                        A premium intercity drop-taxi booking platform for South India featuring
                        dynamic pricing, automated notifications, city-hub SEO pages, and a
                        fully-featured admin CRM.
                    </p>
                    <ul class="dev-project-card__features">
                        <li>
                            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/></svg>
                            Real-time booking &amp; fare engine
                        </li>
                        <li>
                            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/></svg>
                            Automated Telegram &amp; WhatsApp Alerts
                        </li>
                        <li>
                            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/></svg>
                            Google Sheets CRM Synchronization
                        </li>
                        <li>
                            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/></svg>
                            Programmatic SEO city pages
                        </li>
                    </ul>
                    <a class="btn-primary" href="/" id="dev-project-visit" style="margin-top:1rem;width:100%;justify-content:center;">
                        Visit Drop Cars →
                    </a>
                </div>
            </div>
        </div>
    </section>

    <!-- ── Back Home ── -->
    <div class="container" style="text-align:center;padding-bottom:3rem;">
        <a class="btn-outline" href="/" id="dev-back-home">← Back to Home</a>
    </div>

</main>

<?php echo $shell->renderFooter(); ?>
<script>window.DROP_CARS_PAGE_OVERRIDE = { phone: '8838480505', whatsapp: '918838480505', brandName: 'Naveen Rajendran', chatMsg: 'Hi! Have a project in mind? Let\'s build something great together.', waMsg: 'Hi Naveen, I have a project idea I would like to discuss with you!' };</script>
<script defer src="/assets/js/main.js?v=<?php echo @filemtime(__DIR__ . '/../assets/js/main.js'); ?>"></script>
<script defer src="/assets/js/theme-switcher.js?v=<?php echo @filemtime(__DIR__ . '/../assets/js/theme-switcher.js'); ?>"></script>
<script>
/* Staggered card entrance animation */
document.addEventListener('DOMContentLoaded', () => {
    const cards = document.querySelectorAll('.dev-contact-card, .dev-project-card');
    const obs = new IntersectionObserver((entries) => {
        entries.forEach((entry, i) => {
            if (entry.isIntersecting) {
                setTimeout(() => entry.target.classList.add('visible'), i * 80);
                obs.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });
    cards.forEach(c => obs.observe(c));
});
</script>
</body>
</html>
