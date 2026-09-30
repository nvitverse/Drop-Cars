/**
 * SEO-friendly section URLs on the keyword home page: /{theme}/booknow, /{theme}/cities, …
 * Updates the address bar via history.replaceState on scroll and when the booking form receives focus.
 * Preserves query strings (utm_*, gclid, wbraid, etc.) for Google Ads attribution.
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

  var idToSlug = window.DROP_CARS_HOME_SECTION_ID_TO_SLUG || {};
  var themeSlug = (window.DROP_CARS_THEME_SLUG || "").trim() || "drop-cars";

  function buildPathForSlug(slug) {
    if (themeSlug === "drop-cars") {
      if (!slug) return withDropCarsBase("/");
      return withDropCarsBase("/" + slug);
    }
    if (!slug) return withDropCarsBase("/" + themeSlug);
    return withDropCarsBase("/" + themeSlug + "/" + slug);
  }

  function withAdsQuery(path) {
    var q = window.location.search || "";
    return path + q;
  }

  function initLastSlugFromLocation() {
    try {
      var path = window.location.pathname.replace(/\/$/, "") || "/";
      var base =
        typeof window.DROP_CARS_BASE_PATH === "string"
          ? window.DROP_CARS_BASE_PATH.replace(/\/$/, "")
          : "";
      if (base && path.indexOf(base) === 0) {
        path = path.slice(base.length) || "/";
      }
      var parts = path.split("/").filter(Boolean);
      if (themeSlug === "drop-cars") {
        if (parts.length >= 1) {
          return parts[0];
        }
      } else {
        if (parts.length >= 2 && parts[0] === themeSlug) {
          return parts[1];
        }
      }
    } catch (e) {}
    return "";
  }

  var lastSlug = initLastSlugFromLocation();

  // Suppress URL updates during page load + auto-scroll (first 1500ms).
  // Prevents the IntersectionObserver from flickering the address bar as sections
  // drift through the viewport during the initial smooth-scroll animation.
  var urlLocked = true;
  setTimeout(function () { urlLocked = false; }, 1500);

  var scrollTo = document.body && document.body.getAttribute("data-home-scroll-to");
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
