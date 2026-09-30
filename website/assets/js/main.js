/**
 * Main – footer year, menu toggle, quote modal close/back/continue
 * Drop Cars – Premium intercity taxi
 */

(function () {
  "use strict";

  /** Prefix root-absolute paths when the site lives in a subdirectory (see config/install-path.php). */
  function withDropCarsBase(absolutePath) {
    var b =
      typeof window.DROP_CARS_BASE_PATH === "string"
        ? window.DROP_CARS_BASE_PATH.trim()
        : "";
    if (!absolutePath || absolutePath.charAt(0) !== "/") return absolutePath;
    if (!b) return absolutePath;
    if (b.charAt(0) !== "/") b = "/" + b;
    b = b.replace(/\/$/, "");
    return b + absolutePath;
  }

  var yearEl = document.getElementById("year");
  var menuToggle = document.getElementById("menu-toggle");
  var menuPanel = document.getElementById("menu-panel");
  var menuClose = document.getElementById("menu-close");
  var quoteModal = document.getElementById("quote-modal");
  var quoteClose = document.getElementById("quote-close");
  var quoteBackBtn = document.getElementById("quote-back");
  var quoteContinueBtn = document.getElementById("quote-continue");

  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  function toggleMenuPanel(open) {
    if (!menuPanel || !menuToggle) return;
    var isOpen =
      open !== undefined
        ? open
        : !menuPanel.classList.contains("menu-panel--open");
    if (isOpen) {
      menuPanel.classList.add("menu-panel--open");
      menuPanel.removeAttribute("hidden");
      menuPanel.setAttribute("aria-hidden", "false");
      menuToggle.setAttribute("aria-expanded", "true");
      menuPanel.focus();
    } else {
      if (menuPanel.contains(document.activeElement)) {
        menuPanel
          .querySelectorAll("button, a, input, select, textarea")
          .forEach(function (el) {
            if (el === document.activeElement) el.blur();
          });
      }
      menuPanel.classList.remove("menu-panel--open");
      menuPanel.setAttribute("hidden", "");
      menuPanel.setAttribute("aria-hidden", "true");
      menuToggle.setAttribute("aria-expanded", "false");
    }
  }

  if (menuToggle) {
    menuToggle.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleMenuPanel();
    });
  }
  if (menuClose) {
    menuClose.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleMenuPanel(false);
    });
  }

  if (menuPanel) {
    menuPanel.addEventListener("click", function (event) {
      if (event.target.tagName === "A") {
        toggleMenuPanel(false);
      }
    });
  }

  document.addEventListener("click", function (event) {
    if (!menuPanel || !menuToggle) return;
    if (
      menuPanel.classList.contains("menu-panel--open") &&
      !menuPanel.contains(event.target) &&
      !menuToggle.contains(event.target)
    ) {
      toggleMenuPanel(false);
    }
  });

  window.addEventListener("resize", function () {
    if (window.innerWidth > 900) toggleMenuPanel(false);
  });

  toggleMenuPanel(false);

  var Booking = window.DropCarsBooking;
  var closeQuoteModal = Booking ? Booking.closeQuoteModal : function () {};

  if (quoteClose) quoteClose.addEventListener("click", closeQuoteModal);
  if (quoteModal) {
    quoteModal.addEventListener("click", function (event) {
      if (event.target === quoteModal) closeQuoteModal();
    });
  }
  if (quoteBackBtn) quoteBackBtn.addEventListener("click", closeQuoteModal);
  if (quoteContinueBtn) {
    quoteContinueBtn.addEventListener("click", function () {
      if (quoteContinueBtn.getAttribute("data-action") === "confirm-fare") {
        return;
      }
      var targetHref = quoteContinueBtn.getAttribute("data-href") || "";
      if (targetHref) {
        window.location.href = targetHref;
        return;
      }
      var supportPhone = "7200217986";
      var cfg = window.DROP_CARS_CONFIG || window.DropCarsConfig;
      if (cfg && cfg.company && cfg.company.phone) {
        supportPhone = cfg.company.phone.toString().replace(/\D/g, "");
      }
      var supportTel = (supportPhone.length === 10) ? "+91" + supportPhone : "+" + supportPhone;
      window.location.href = "tel:" + supportTel;
    });
  }

  /* Fleet filter – Our Taxi / Explore Our Options (skip hybrid slider sections; those use inline script) */
  var fleetFilterBtns = document.querySelectorAll(".fleet-showcase:not([data-fleet-hybrid]) .fleet-filter__btn");
  var fleetCards = document.querySelectorAll(".fleet-showcase:not([data-fleet-hybrid]) .fleet-showcase__card");
  if (fleetFilterBtns.length && fleetCards.length) {
    fleetFilterBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        fleetFilterBtns.forEach(function (b) { b.classList.remove("fleet-filter__btn--active"); });
        btn.classList.add("fleet-filter__btn--active");
        var filter = btn.dataset.filter || "*";
        fleetCards.forEach(function (card) {
          var cat = card.dataset.category || "";
          var show = filter === "*" || cat === filter;
          card.classList.toggle("fleet-showcase__card--hidden", !show);
        });
      });
    });
  }

  function resolveThemeNameForCityCards() {
    var params = new URLSearchParams(window.location.search || "");
    var queryTheme = (params.get("theme") || "").trim();
    var path = (window.location.pathname || "/").replace(/^\/+|\/+$/g, "");
    var slug = (queryTheme || path.split("/")[0] || "").toLowerCase();
    var aliasToTheme = {
      "": "Drop Taxi",
      "drop-cars": "Drop Taxi",
      "drop-taxi": "Drop Taxi",
      "drop-taxi-service": "Drop Taxi Service",
      "one-drop-taxi": "One Drop Taxi",
      "one-way-taxi": "One Way Taxi",
      "one-way-cab": "One Way Cab",
      "one-drop-cab": "One Drop Cab",
      "outstation-taxi": "Outstation Taxi",
      "outstation-cab": "Outstation Cab",
      "outstation-cabs": "Outstation Cabs",
      "intercity-taxi": "Intercity Taxi",
      "intercity-cabs": "Intercity Cabs",
      "city-to-city-taxi": "City to City Taxi",
      "city-to-city-cabs": "Intercity Taxi",
      "intercity-drop-taxi": "Intercity Taxi"
    };
    return aliasToTheme[slug] || "Drop Taxi";
  }

  function resolveThemeSlugForCityCards() {
    var params = new URLSearchParams(window.location.search || "");
    var queryTheme = (params.get("theme") || "").trim();
    var path = (window.location.pathname || "/").replace(/^\/+|\/+$/g, "");
    var slug = (queryTheme || path.split("/")[0] || "").toLowerCase();
    var aliasToSlug = {
      "": "drop-cars",
      "drop-cars": "drop-cars",
      "drop-taxi": "drop-taxi",
      "drop-taxi-service": "drop-taxi-service",
      "one-drop-taxi": "one-drop-taxi",
      "one-way-taxi": "one-way-taxi",
      "one-way-cab": "one-way-cab",
      "one-drop-cab": "one-drop-cab",
      "outstation-taxi": "outstation-taxi",
      "outstation-cab": "outstation-cab",
      "outstation-cabs": "outstation-cabs",
      "intercity-taxi": "intercity-taxi",
      "intercity-cabs": "intercity-cabs",
      "city-to-city-taxi": "city-to-city-taxi",
      "city-to-city-cabs": "intercity-taxi",
      "intercity-drop-taxi": "intercity-taxi"
    };
    return aliasToSlug[slug] || "drop-cars";
  }

  function buildCitySignboardHTML(cityName, themeName) {
    return `
      <div class="highway-signboard-shine"></div>
      <div class="highway-signboard__header">
          <span class="highway-badge">OUTSTATION TAXI</span>
      </div>
      <div class="highway-signboard__route">
          <span>${themeName} in ${cityName}</span>
      </div>
      <div class="highway-signboard__metrics">
          <div class="highway-metric highway-metric--kms">
              <span class="highway-metric__icon">📍</span>
              <span>One-Way Taxi</span>
          </div>
          <div class="highway-metric highway-metric--timing">
              <span class="highway-metric__icon">🚗</span>
              <span>24x7 Cabs</span>
          </div>
      </div>
      <div class="highway-signboard__cta">
          <span>View Fares</span>
          <span class="cta-arrow">➔</span>
      </div>
    `;
  }

  function updateCityCardLabelsWithTheme() {
    var cityCards = document.querySelectorAll(".city-grid .city-card");
    if (!cityCards.length) return;
    var themeName = resolveThemeNameForCityCards();
    var themeSlug = resolveThemeSlugForCityCards();
    cityCards.forEach(function (card) {
      var baseCity = (card.getAttribute("data-city-name") || card.textContent || "").trim();
      if (!baseCity) return;
      card.setAttribute("data-city-name", baseCity);
      card.className = "city-card highway-signboard route-card--highway";
      card.innerHTML = buildCitySignboardHTML(baseCity, themeName);
      var href = card.getAttribute("href") || "";
      if (href) {
        card.setAttribute("href", withDropCarsBase("/" + themeSlug + "/" + baseCity.toLowerCase().replace(/\s/g, "-")));
      }
    });
  }

  function runWhenIdle(task) {
    if (typeof task !== "function") return;
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(function () {
        task();
      }, { timeout: 1500 });
      return;
    }
    window.setTimeout(task, 350);
  }


  var balanceCitiesLoaded = false;
  var cachedCityRows = null; // pre-fetched data stored here

  // Pre-fetch city data during idle time so it's ready instantly on click
  function preFetchCityData(source) {
    if (!source || cachedCityRows !== null) return;
    fetch(source)
      .then(function (res) { return res.ok ? res.json() : Promise.reject(); })
      .then(function (rows) {
        cachedCityRows = Array.isArray(rows) ? rows : [];
      })
      .catch(function () { cachedCityRows = []; });
  }

  function populateCityGrid(grid, excludeSet) {
    if (!cachedCityRows || cachedCityRows.length === 0) return;
    var balance = cachedCityRows.filter(function (c) {
      return c && c.slug && c.city && !excludeSet[(c.slug || '').toLowerCase()];
    });
    balance.sort(function (a, b) {
      return String((a && a.city) || '').localeCompare(String((b && b.city) || ''));
    });
    if (balance.length === 0) return;
    var themeName = resolveThemeNameForCityCards();
    var themeSlug = resolveThemeSlugForCityCards();
    var fragment = document.createDocumentFragment();
    balance.forEach(function (city) {
      var a = document.createElement('a');
      a.className = 'city-card highway-signboard route-card--highway';
      a.href = withDropCarsBase('/' + themeSlug + '/' + city.slug);
      a.setAttribute('data-city-name', city.city);
      a.innerHTML = buildCitySignboardHTML(city.city, themeName);
      fragment.appendChild(a);
    });
    grid.appendChild(fragment);
  }

  function loadBalanceCitiesOnce(grid, excludeSet) {
    if (balanceCitiesLoaded) {
      return Promise.resolve();
    }
    if (cachedCityRows !== null) {
      populateCityGrid(grid, excludeSet);
      balanceCitiesLoaded = true;
      return Promise.resolve();
    }
    var source = grid.getAttribute('data-lazy-source') || '';
    return fetch(source)
      .then(function (res) { return res.ok ? res.json() : Promise.reject(); })
      .then(function (rows) {
        cachedCityRows = Array.isArray(rows) ? rows : [];
        populateCityGrid(grid, excludeSet);
        balanceCitiesLoaded = true;
      })
      .catch(function () {
        cachedCityRows = [];
        balanceCitiesLoaded = true;
      });
  }

  function deferHomepageHeavySections() {
    var grid = document.getElementById('city-grid');
    if (!grid && !document.getElementById('popular-routes-grid')) return;

    var cityToggleBtn = document.getElementById('city-toggle-btn');
    var cityCollapse  = document.getElementById('city-collapse');

    // Build excludeSet from button data attribute
    var excludeSlugsRaw = (cityToggleBtn && cityToggleBtn.getAttribute('data-exclude-slugs')) || '';
    var excludeSet = {};
    excludeSlugsRaw.split(',').forEach(function (s) {
      var t = (s || '').trim().toLowerCase();
      if (t) excludeSet[t] = true;
    });

    // Pre-fetch city data during idle so click feels instant
    if (grid) {
      var source = grid.getAttribute('data-lazy-source') || '';
      runWhenIdle(function () { preFetchCityData(source); });
    }

    if (cityToggleBtn && cityCollapse) {
      cityToggleBtn.addEventListener('click', function () {
        var isCurrentlyActive = cityToggleBtn.classList.contains('active');

        if (!isCurrentlyActive) {
          // We are opening it!
          var btnText = cityToggleBtn.querySelector('.btn-text');
          var themeName = cityToggleBtn.getAttribute('data-theme-name') || 'Drop Cars';

          function doOpen() {
            cityToggleBtn.classList.add('active');
            cityToggleBtn.setAttribute('aria-expanded', 'true');
            if (btnText) btnText.textContent = 'Hide Cities';

            // Activate class (sets border/padding via CSS) then measure
            cityCollapse.classList.add('active');

            // Force layout before reading scrollHeight so browser includes padding
            cityCollapse.style.height = '0px';
            var target = cityCollapse.scrollHeight;
            // Use rAF so the browser paints the 0px state first
            requestAnimationFrame(function () {
              requestAnimationFrame(function () {
                cityCollapse.style.height = target + 'px';
              });
            });
          }

          if (balanceCitiesLoaded || (cachedCityRows !== null && cachedCityRows.length > 0)) {
            if (grid) loadBalanceCitiesOnce(grid, excludeSet);
            doOpen();
          } else {
            if (btnText) btnText.textContent = 'Loading...';
            cityToggleBtn.classList.add('loading');

            loadBalanceCitiesOnce(grid, excludeSet).then(function () {
              cityToggleBtn.classList.remove('loading');
              doOpen();
            });
          }
        } else {
          // We are closing it!
          cityToggleBtn.classList.remove('active');
          cityToggleBtn.setAttribute('aria-expanded', 'false');

          var btnText = cityToggleBtn.querySelector('.btn-text');
          if (btnText) {
            var themeName = cityToggleBtn.getAttribute('data-theme-name') || 'Drop Cars';
            btnText.textContent = 'View All ' + themeName + ' Cities';
          }

          // Animate to 0
          cityCollapse.style.height = cityCollapse.scrollHeight + 'px';
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              cityCollapse.style.height = '0px';
              // After transition ends, remove active class and reset height
              cityCollapse.addEventListener('transitionend', function cleanup(e) {
                if (e.propertyName !== 'height') return;
                cityCollapse.classList.remove('active');
                cityCollapse.style.height = '';
                cityCollapse.removeEventListener('transitionend', cleanup);
              });
            });
          });
        }
      });
    }

    runWhenIdle(function () {
      document.dispatchEvent(new CustomEvent('dropcars:lazy-routes-ready'));
    });
  }

  var citiesSection = document.getElementById("cities");
  if (citiesSection && "IntersectionObserver" in window) {
    var labelObserver = new IntersectionObserver(function (entries, observer) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          updateCityCardLabelsWithTheme();
          observer.disconnect();
        }
      });
    }, { threshold: 0.1 });
    labelObserver.observe(citiesSection);
  } else {
    updateCityCardLabelsWithTheme();
  }

  deferHomepageHeavySections();
})();
