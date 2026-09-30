/**
 * SEO-friendly section URLs on city hub and route pages: /{theme}/{city}/booknow, /{theme}/{pickup-drop}/faq, …
 * Mirrors home-section-url.js but uses DROP_CARS_PAGE_SECTION_BASE (full path prefix for the page).
 */
(function () {
  "use strict";

  function withDropCarsBase(absolutePath) {
    var b =
      typeof window.DROP_CARS_BASE_PATH === "string"
        ? window.DROP_CARS_BASE_PATH.trim()
        : "";
    if (!absolutePath || absolutePath.charAt(0) !== "/") return absolutePath || "/";
    if (!b) return absolutePath;
    if (b.charAt(0) !== "/") b = "/" + b;
    b = b.replace(/\/$/, "");
    return b + absolutePath;
  }

  var idToSlug = window.DROP_CARS_PAGE_SECTION_ID_TO_SLUG || {};
  var pageBase = (window.DROP_CARS_PAGE_SECTION_BASE || "").trim();
  if (pageBase.indexOf("http://") === 0 || pageBase.indexOf("https://") === 0) {
    try {
      pageBase = new URL(pageBase).pathname;
    } catch (e) {
      var match = pageBase.match(/^https?:\/\/[^\/]+(\/.*)$/);
      if (match) {
        pageBase = match[1];
      }
    }
  }
  if (!pageBase || pageBase.charAt(0) !== "/") return;

  function normalizePathname(p) {
    p = (p || "/").replace(/\/$/, "") || "/";
    var bp =
      typeof window.DROP_CARS_BASE_PATH === "string"
        ? window.DROP_CARS_BASE_PATH.replace(/\/$/, "")
        : "";
    if (bp && p.indexOf(bp) === 0) {
      p = p.slice(bp.length) || "/";
    }
    return p.replace(/\/$/, "") || "/";
  }

  function buildPathForSlug(slug) {
    var base = pageBase.replace(/\/$/, "") || "/";
    if (!slug) return withDropCarsBase(base);
    return withDropCarsBase(base + "/" + slug);
  }

  function withAdsQuery(path) {
    var q = window.location.search || "";
    return path + q;
  }

  function initLastSlugFromLocation() {
    try {
      var base = normalizePathname(pageBase);
      var path = normalizePathname(window.location.pathname);
      if (path.indexOf(base) !== 0) return "";
      var rest = path.slice(base.length);
      if (rest.charAt(0) === "/") rest = rest.slice(1);
      return rest.split("/")[0] || "";
    } catch (e) {}
    return "";
  }

  var lastSlug = initLastSlugFromLocation();

  var urlLocked = true;
  setTimeout(function () { urlLocked = false; }, 1500);

  var scrollTo = document.body && document.body.getAttribute("data-page-scroll-to");
  if (scrollTo && scrollTo !== "booking" && scrollTo !== "booking-form") {
    var target = document.getElementById(scrollTo);
    if (target) {
      var performScroll = function () {
        var offset = window.innerWidth <= 800 ? 85 : 0;
        var top = target.getBoundingClientRect().top + window.pageYOffset - offset;
        window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      };
      if (document.readyState === "complete") {
        setTimeout(performScroll, 400);
      } else {
        window.addEventListener("load", function () {
          setTimeout(performScroll, 400);
        });
      }
    }
  }

  var observed = Object.keys(idToSlug).filter(function (id) {
    return document.getElementById(id);
  });
  if (!observed.length) return;

  var io = new IntersectionObserver(
    function (entries) {
      var best = null;
      entries.forEach(function (e) {
        if (!e.target || !e.target.id) return;
        var ratio = e.intersectionRatio;
        if (e.boundingClientRect.height > window.innerHeight) {
          ratio = e.intersectionRect.height / window.innerHeight;
        }
        if (ratio < 0.12) return;
        if (!best || ratio > best.ratio) {
          best = { ratio: ratio, id: e.target.id };
        }
      });
      if (!best) return;
      if (urlLocked) return;
      var slug = idToSlug[best.id];
      if (!slug || slug === lastSlug) return;
      lastSlug = slug;
      try {
        var next = withAdsQuery(buildPathForSlug(slug));
        if (window.location.pathname + window.location.search !== next) {
          window.history.replaceState(null, "", next);
        }
      } catch (err) {}
    },
    {
      root: null,
      rootMargin: "-14% 0px -14% 0px",
      threshold: [0, 0.08, 0.15, 0.25, 0.4, 0.55, 0.75, 1],
    }
  );

  observed.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) io.observe(el);
  });

  var bookingForm = document.getElementById("booking-form");
  if (bookingForm) {
    bookingForm.addEventListener(
      "focusin",
      function () {
        if (lastSlug === "booknow") return;
        lastSlug = "booknow";
        try {
          window.history.replaceState(null, "", withAdsQuery(buildPathForSlug("booknow")));
        } catch (e) {}
      },
      true
    );
  }
})();
