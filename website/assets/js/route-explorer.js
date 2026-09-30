/**
 * SEO Route Explorer
 * Dynamically loads routes based on keyword and pickup city.
 */

(function () {
    "use strict";

    var keywordSelect = document.getElementById("keyword-select");
    var activeThemeId =
        (document.body && document.body.getAttribute("data-active-theme-id")) || "drop-taxi";
    var cityTabs = document.getElementById("city-tabs");
    var routesGrid = document.getElementById("popular-routes-grid");
    var viewMoreBtn = document.getElementById("view-more-routes");
    var viewMoreContainer = document.getElementById("view-more-container");
    var routeTitle = document.getElementById("route-title");
    var routeEyebrow = document.getElementById("route-eyebrow");

    var currentCity = "Chennai";
    var currentKeyword = activeThemeId || "drop-taxi";
    var isExpanded = false;
    var routesData = {};
    var initStarted = false;

    function getSupportedCities() {
        if (!cityTabs) return [];
        return Array.prototype.slice
            .call(cityTabs.querySelectorAll(".city-tab"))
            .map(function (btn) { return (btn.getAttribute("data-city") || "").trim(); })
            .filter(Boolean);
    }

    function buildRoutesFromData(citiesPayload, routesPayload) {
        var allowedRegions = { TN: true, KA: true, KL: true, AP: true, PY: true, TS: true, MH: true, GA: true };
        var rows = Array.isArray(citiesPayload) ? citiesPayload : [];
        var serviceableCities = rows.filter(function (city) {
            var region = String((city && city.region) || "").toUpperCase();
            var slug = String((city && city.slug) || "").toLowerCase();
            if (!allowedRegions[region]) return false;
            if (region === "TS" && slug !== "hyderabad") return false;
            return true;
        });
        var bySlug = {};
        serviceableCities.forEach(function (city) {
            bySlug[String(city.slug || "").toLowerCase()] = city;
        });

        var map = {};
        var routes = (routesPayload && Array.isArray(routesPayload.routes)) ? routesPayload.routes : [];
        routes.forEach(function (route) {
            var fromSlug = slugify((route && route.from) || "");
            var toSlug = slugify((route && route.to) || "");
            var fromCity = bySlug[fromSlug];
            var toCity = bySlug[toSlug];
            if (!fromCity || !toCity) return;

            var distance = Number((route && route.distanceKm) || 0);
            var airportException = /airport/i.test(String(route.from || "")) || /airport/i.test(String(route.to || ""));
            var isBangaloreHosur = (fromSlug === "bangalore" && toSlug === "hosur") || (fromSlug === "hosur" && toSlug === "bangalore");
            if (isBangaloreHosur && !airportException) return;
            if (distance < 60 && !airportException) return;

            var fromName = String(fromCity.city || "").trim();
            var toName = String(toCity.city || "").trim();
            if (!fromName || !toName || fromName === toName) return;
            if (!map[fromName]) map[fromName] = [];
            map[fromName].push({ to: toName, dist: Math.round(distance) });
        });

        Object.keys(map).forEach(function (city) {
            var seen = {};
            map[city] = map[city]
                .filter(function (item) {
                    var key = String(item.to || "").toLowerCase();
                    if (!key || seen[key]) return false;
                    seen[key] = true;
                    return true;
                })
                .sort(function (a, b) { return a.dist - b.dist; });
        });
        return map;
    }

    function loadRoutesData() {
        return Promise.all([
            fetch("/data/cities.json").then(function (r) { return r.json(); }),
            fetch("/data/routes.json").then(function (r) { return r.json(); })
        ]).then(function (payloads) {
            routesData = buildRoutesFromData(payloads[0], payloads[1]);
        }).catch(function () {
            routesData = {};
        });
    }

    function slugify(text) {
        return text.toString().toLowerCase().trim()
            .replace(/\s+/g, '-')
            .replace(/[^\w\-]+/g, '')
            .replace(/\-\-+/g, '-');
    }

    var keywordMap = {
        "drop-taxi": "Drop Taxi",
        "one-way-taxi": "One Way Taxi",
        "drop-cars": "Drop Taxi",
        "one-way-cab": "One Way Cab",
        "outstation-taxi": "Outstation Taxi",
        "city-to-city-taxi": "City to City Taxi",
        "intercity-taxi": "Intercity Taxi",
        "intercity-cabs": "Intercity Cabs",
        "drop-taxi-service": "Drop Taxi Service",
        "one-drop-taxi": "One Drop Taxi",
        "one-drop-cab": "One Drop Cab",
        "city-to-city-cabs": "City to City Cabs"
    };

    function calculateHighwayTiming(distKm) {
        var distance = Number(distKm) || 0;
        if (distance <= 0) return "N/A";
        var totalMinutes = Math.round((distance / 52) * 60) + 10;
        var hours = Math.floor(totalMinutes / 60);
        var mins = Math.round((totalMinutes % 60) / 5) * 5;
        if (mins === 60) {
            hours += 1;
            mins = 0;
        }
        if (hours === 0) {
            return mins + " mins";
        }
        if (mins === 0) {
            return hours + " hrs";
        }
        return hours + " hrs " + mins + " mins";
    }

    function renderRoutes() {
        var routes = routesData[currentCity] || [];
        var limit = isExpanded ? 60 : 24;
        var displayRoutes = routes.slice(0, limit);

        routesGrid.innerHTML = "";
        displayRoutes.forEach(function (r) {
            var pickupSlug = slugify(currentCity);
            var dropSlug = slugify(r.to);
            var url = pickupSlug + "-" + dropSlug;

            var card = document.createElement("a");
            card.href = "/" + currentKeyword + "/" + url;
            card.className = "highway-signboard route-card--highway";
            card.setAttribute("aria-label", currentCity + " to " + r.to + " highway route sign");

            var prettyKeyword = keywordMap[currentKeyword] || (currentKeyword === "drop-cars" ? "Drop Taxi" : currentKeyword);
            var timingStr = calculateHighwayTiming(r.dist);

            card.innerHTML = `
                <div class="highway-signboard-shine"></div>
                <div class="highway-signboard__header">
                    <span class="highway-badge">ONE-WAY CAB</span>
                    <span class="highway-signboard__code">EXPRESS ROUTE</span>
                </div>
                <div class="highway-signboard__route">
                    <span>${currentCity}</span>
                    <span class="highway-signboard__route-arrow">➔</span>
                    <span>${r.to} Taxi</span>
                </div>
                <div class="highway-signboard__metrics">
                    <div class="highway-metric highway-metric--kms">
                        <span class="highway-metric__icon">🛣️</span>
                        <span>${r.dist} KMS</span>
                    </div>
                    <div class="highway-metric highway-metric--timing">
                        <span class="highway-metric__icon">⏱️</span>
                        <span>${timingStr}</span>
                    </div>
                </div>
                <div class="highway-signboard__cta">
                    <span>Book ${prettyKeyword}</span>
                    <span class="cta-arrow">➔</span>
                </div>
            `;
            routesGrid.appendChild(card);
        });

        // Handle View More visibility
        if (routes.length > 24 && !isExpanded) {
            viewMoreContainer.style.display = "flex";
        } else {
            viewMoreContainer.style.display = "none";
        }

        // Update Headings
        var themeName = window.activeThemeName || "Drop Cars";
        routeTitle.textContent = "Popular " + themeName + " Highway Routes";
        routeEyebrow.textContent = "Highway Signboard Fares & Live Timings from " + currentCity;
    }

    function updateCity(city, fromAuto) {
        currentCity = city;

        // Update Tabs UI
        cityTabs.querySelectorAll(".city-tab").forEach(function (btn) {
            if (btn.getAttribute("data-city") === city) {
                btn.classList.add("active");
                if (btn.scrollIntoView && !fromAuto) {
                    btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                }
            } else {
                btn.classList.remove("active");
            }
        });

        // Update Location Message logic removed

        isExpanded = false;
        renderRoutes();
    }

    function detectLocation() {
        // Initialize from select if present; otherwise use active header theme.
        if (keywordSelect) {
            currentKeyword = keywordSelect.value;
        } else {
            currentKeyword = activeThemeId || "drop-taxi";
        }

        var supportedCities = getSupportedCities();
        var manualCity = null;
        try { manualCity = localStorage.getItem('dropcars_manual_city'); } catch (_) {}
        if (manualCity && supportedCities.includes(manualCity)) {
            updateCity(manualCity, true);
            return;
        }

        // Attempt IP detection
        fetch('https://ipapi.co/json/')
            .then(function (response) { return response.json(); })
            .then(function (data) {
                var detectedCity = data.city;
                console.log("Detected City:", detectedCity);

                var matchedCity = supportedCities.find(function (c) {
                    return c.toLowerCase() === detectedCity.toLowerCase();
                });

                if (matchedCity) {
                    updateCity(matchedCity, true);
                } else {
                    updateCity("Chennai", true); // Default
                }
            })
            .catch(function (err) {
                console.log("Location detection failed:", err);
                updateCity("Chennai", true); // Default on error
            });
    }

    // Event Listeners
    if (keywordSelect) {
        keywordSelect.addEventListener("change", function () {
            currentKeyword = keywordSelect.value;
            renderRoutes();
        });
    }

    if (cityTabs) {
        cityTabs.addEventListener("click", function (e) {
            var tab = e.target.closest(".city-tab");
            if (!tab) return;

            var city = tab.getAttribute("data-city");
            try { localStorage.setItem('dropcars_manual_city', city); } catch (_) {}
            updateCity(city, false);
        });
    }

    if (viewMoreBtn) {
        viewMoreBtn.addEventListener("click", function () {
            isExpanded = true;
            renderRoutes();
        });
    }

    // Change city link logic removed as requested.

    function initRouteExplorer() {
        if (!routesGrid || initStarted) return;
        initStarted = true;
        loadRoutesData().then(function () {
            detectLocation();
        });
    }

    // Lazy init routes rendering after homepage primary content settles.
    if (routesGrid) {
        document.addEventListener("dropcars:lazy-routes-ready", initRouteExplorer, { once: true });
        window.setTimeout(initRouteExplorer, 2200);
    }

})();
