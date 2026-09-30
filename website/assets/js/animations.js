/* Drop Cars – Scroll animations + ripple + count-up */
(function () {
  'use strict';

  /* ── Scroll-reveal via IntersectionObserver ── */
  const revealEls = document.querySelectorAll(
    '.seo-card, .service-card, .routes__category, ' +
    '.trust__item, .trust-badges__item, .fleet-slider-slide, ' +
    '.seo-section__header, .routes, .faq-item, .faq__item, ' +
    '.city-card, [data-animate]'
  );

  revealEls.forEach(function (el) {
    el.classList.add('anim-reveal');
  });

  /* Stagger direct grid children */
  document.querySelectorAll(
    '.seo-grid, .trust__grid, .trust-badges__grid, .routes__categories, ' +
    '.services-slider-track, .fleet-slider-track'
  ).forEach(function (grid) {
    grid.classList.add('anim-stagger');
  });

  /* Section headings */
  document.querySelectorAll('h2, .section-title').forEach(function (h) {
    h.classList.add('section-heading-anim', 'anim-reveal');
  });

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.anim-reveal').forEach(function (el) {
      io.observe(el);
    });
  } else {
    /* Fallback: show everything immediately */
    document.querySelectorAll('.anim-reveal').forEach(function (el) {
      el.classList.add('is-visible');
    });
  }

  /* ── Count-up for stat numbers ── */
  function countUp(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    var dec    = parseInt(el.getAttribute('data-decimal') || '0', 10);
    var suf    = el.getAttribute('data-suffix') || '';
    var duration = 1400, startTime = null;
    if (isNaN(target)) return;
    function step(ts) {
      if (!startTime) startTime = ts;
      var p = Math.min((ts - startTime) / duration, 1);
      var ease = 1 - Math.pow(1 - p, 3);
      el.textContent = (dec ? (target * ease).toFixed(dec) : Math.floor(target * ease)) + suf;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  if ('IntersectionObserver' in window) {
    var statObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var el = entry.target;
          countUp(el);
          statObserver.unobserve(el);
        }
      });
    }, { threshold: 0.5 });

    document.querySelectorAll('[data-count]').forEach(function (el) {
      statObserver.observe(el);
    });
  }

  /* ── Ripple on buttons ── */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest(
      '.btn-primary, .booking-btn, .cta-btn, button[type="submit"], [class*="btn-book"]'
    );
    if (!btn) return;
    var rect = btn.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height);
    var ripple = document.createElement('span');
    ripple.className = 'ripple-effect';
    ripple.style.cssText =
      'width:' + size + 'px;height:' + size + 'px;' +
      'left:' + (e.clientX - rect.left - size / 2) + 'px;' +
      'top:' + (e.clientY - rect.top - size / 2) + 'px;';
    btn.appendChild(ripple);
    setTimeout(function () { ripple.remove(); }, 600);
  });

  /* ── Hover-lift on cards ── */
  document.querySelectorAll(
    '.seo-card, .service-card, .routes__category, .trust-badges__item, .city-card'
  ).forEach(function (el) {
    el.classList.add('hover-lift');
  });
})();
