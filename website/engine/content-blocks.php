<?php
/**
 * Content Blocks for SEO & Service Enhancement
 * Reusable sections for Drop Cars
 */
require_once __DIR__ . '/theme-seo.php';

class ContentBlocks {
    private $activeTheme;

    private $config;

    public function __construct($theme = null) {
        $this->activeTheme = $theme;
        $configPath = __DIR__ . '/../api/config.php';
        if (!is_file($configPath)) {
            $configPath = __DIR__ . '/../api/config.example.php';
        }
        $this->config = is_file($configPath) ? (include $configPath) : [];
    }

    private function getThemeName() {
        return ($this->activeTheme['name'] ?? '') ?: 'Drop Cars';
    }

    /** Site owner brand — never the SEO theme label. */
    private function getBrandName(): string {
        return 'Drop Cars';
    }

    private function seoLine(string $key, string $default): string {
        return dropcars_theme_expand($this->activeTheme, dropcars_theme_get($this->activeTheme, $key, $default), []);
    }

    private function getThemeSlug() {
        if (is_array($this->activeTheme)) {
            $slug = $this->activeTheme['slug'] ?? ($this->activeTheme['id'] ?? '');
            if (is_string($slug) && $slug !== '') {
                return $slug;
            }
        }
        return 'drop-cars';
    }

    /** Google Ads–friendly booking URL: /{theme}/booknow */
    private function bookNowHref(): string {
        $pf = __DIR__ . '/../includes/paths.php';
        if (is_file($pf)) {
            require_once $pf;
        }
        $slug = $this->getThemeSlug();
        $path = ($slug === 'drop-cars') ? 'booknow' : $slug . '/booknow';

        return function_exists('dropcars_url') ? dropcars_url($path) : '/' . $path;
    }

    /**
     * Render Our Services Section – With Auto-sliding Carousel
     */
    public function renderServices($id = 'services-enhancement') {
        $brandName = htmlspecialchars($this->getBrandName(), ENT_QUOTES, 'UTF-8');

        $services = [
            [
                'title' => 'One-way drop taxi',
                'icon' => '🚖',
                'img' => '/assets/img/seo/service_one_way_highway.png',
                'desc' => 'The smartest way to travel intercity. Pay only for the distance you travel—no return fare charges ever.',
                'highlight' => 'SAVE 50% ON RETURN FARE'
            ],
            [
                'title' => 'Intercity round trips',
                'icon' => '🔁',
                'img' => '/assets/img/seo/service_round_trip_family.png',
                'desc' => 'Perfect for weekend getaways and family vacations. Keep the same car and driver for your entire journey.',
                'highlight' => 'IDEAL FOR FAMILY TRIPS'
            ],
            [
                'title' => 'Hourly city rentals',
                'icon' => '⏰',
                'img' => '/assets/img/seo/service_hourly_rental_city.png',
                'desc' => 'Book a cab by the hour for local sightseeing, business meetings, or multiple stops within the city limits.',
                'highlight' => 'FLEXIBLE LOCAL TRAVEL'
            ],
            [
                'title' => 'Airport transfers',
                'icon' => '✈️',
                'img' => '/assets/img/seo/service_airport_transfer.png',
                'desc' => 'Reliable 24/7 airport pickups and drops. Punctual service with professional drivers and plenty of luggage space.',
                'highlight' => 'ON-TIME GUARANTEED'
            ]
        ];

        $servicesLead = htmlspecialchars($this->seoLine('seoServicesLead', 'Reliable one-way drops, round trips, and local rentals across South India. Clear pricing with no hidden costs.'), ENT_QUOTES, 'UTF-8');
        $html = "<section class='services-section' id='{$id}' style='background: white; padding: 1.75rem 0;'>
            <div class='container'>
                <div class='seo-section__header' style='text-align: center; margin-bottom: 1.35rem;'>
                    <h2 style='font-size: clamp(1.45rem, 4vw, 2.1rem); font-weight: 800; color: #0f172a; margin: 0;'>Ways to travel with {$brandName}</h2>
                    <p style='color: #64748b; margin-top: 0.65rem; font-size: 1rem; max-width: 42rem; margin-left: auto; margin-right: auto; line-height: 1.55;'>{$servicesLead}</p>
                </div>
                
                <div class='services-slider-container' id='services-slider' tabindex='0' role='region' aria-roledescription='carousel' aria-label='Ways to travel'>
                    <div class='services-slider-track'>";

        foreach ($services as $index => $s) {
            $activeClass = $index === 0 ? 'active' : '';
            $html .= "
                        <div class='services-slider-slide {$activeClass}' data-index='{$index}'>
                            <div class='service-card'>
                                <img src='{$s['img']}' alt='{$s['title']}' loading='lazy'>
                                <h3>{$s['title']}</h3>
                                <p>{$s['desc']}</p>
                                <span class='service-card__highlight'>{$s['highlight']}</span>
                            </div>
                        </div>";
        }

        $html .= "
                    </div>
                </div>

                <div class='services-slider-dots' id='services-dots' style='display: flex; justify-content: center; align-items: center; gap: 0.75rem; margin-top: 1.5rem; height: 12px;'>";
        foreach ($services as $index => $s) {
            $activeDot = $index === 0 ? 'width: 24px; opacity: 1; background: var(--primary-color);' : 'width: 8px; opacity: 0.3; background: #94a3b8;';
            $html .= "<button type='button' class='service-dot' data-index='{$index}' aria-label='Go to slide " . ($index + 1) . "' style='height: 8px; border-radius: 4px; border: none; padding: 0; transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); {$activeDot} cursor: pointer;'></button>";
        }
        $html .= "</div>
            </div>
            
            <script>
            (function() {
                const container = document.getElementById('services-slider');
                const dotsContainer = document.getElementById('services-dots');
                if (!container || !dotsContainer) return;
                
                const track = container.querySelector('.services-slider-track');
                const slides = Array.from(track.querySelectorAll('.services-slider-slide'));
                const dots = Array.from(dotsContainer.querySelectorAll('.service-dot'));
                
                let currentIndex = 0;
                let autoSlideInterval;
                let scrollSyncTimer;
                const prefersReduced = typeof window.matchMedia === 'function' &&
                    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

                function scrollBehavior() {
                    return prefersReduced ? 'auto' : 'smooth';
                }

                function updateUI(index) {
                    if (window.innerWidth >= 768) return;
                    currentIndex = index;
                    slides.forEach(function(s, i) {
                        s.classList.toggle('active', i === index);
                    });
                    dots.forEach(function(dot, i) {
                        const isActive = i === index;
                        dot.style.opacity = isActive ? '1' : '0.3';
                        dot.style.width = isActive ? '24px' : '8px';
                        dot.style.background = isActive ? 'var(--primary-color)' : '#94a3b8';
                    });
                }

                function scrollToSlide(index) {
                    if (window.innerWidth >= 768) return;
                    if (index < 0 || index >= slides.length) return;
                    const slide = slides[index];
                    const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
                    const left = slide.offsetLeft - (container.clientWidth - slide.offsetWidth) / 2;
                    const target = Math.max(0, Math.min(left, maxScroll));
                    container.scrollTo({ left: target, behavior: scrollBehavior() });
                    updateUI(index);
                }

                function syncFromScroll() {
                    if (window.innerWidth >= 768) return;
                    const center = container.getBoundingClientRect().left + container.clientWidth / 2;
                    let best = 0;
                    let minD = Infinity;
                    slides.forEach(function(slide, i) {
                        const r = slide.getBoundingClientRect();
                        const c = r.left + r.width / 2;
                        const dist = Math.abs(c - center);
                        if (dist < minD) {
                            minD = dist;
                            best = i;
                        }
                    });
                    if (best !== currentIndex) {
                        updateUI(best);
                    }
                }

                function nextSlide() {
                    if (window.innerWidth >= 768) return;
                    scrollToSlide((currentIndex + 1) % slides.length);
                }

                function startAutoSlide() {
                    stopAutoSlide();
                    if (window.innerWidth >= 768) return;
                    autoSlideInterval = setInterval(nextSlide, 5000);
                }

                function stopAutoSlide() {
                    if (autoSlideInterval) clearInterval(autoSlideInterval);
                }

                dots.forEach(dot => {
                    dot.addEventListener('click', () => {
                        scrollToSlide(parseInt(dot.dataset.index));
                        startAutoSlide();
                    });
                });

                container.addEventListener('scroll', function() {
                    clearTimeout(scrollSyncTimer);
                    scrollSyncTimer = setTimeout(syncFromScroll, 64);
                }, { passive: true });

                if ('onscrollend' in window) {
                    container.addEventListener('scrollend', syncFromScroll, { passive: true });
                }

                container.addEventListener('keydown', function(e) {
                    if (window.innerWidth >= 768) return;
                    if (e.key === 'ArrowLeft') {
                        e.preventDefault();
                        scrollToSlide(Math.max(0, currentIndex - 1));
                        startAutoSlide();
                    } else if (e.key === 'ArrowRight') {
                        e.preventDefault();
                        scrollToSlide(Math.min(slides.length - 1, currentIndex + 1));
                        startAutoSlide();
                    }
                });

                container.addEventListener('mouseenter', stopAutoSlide);
                container.addEventListener('mouseleave', startAutoSlide);
                container.addEventListener('touchstart', stopAutoSlide, { passive: true });
                container.addEventListener('touchend', function() {
                    setTimeout(startAutoSlide, 2800);
                }, { passive: true });

                window.addEventListener('resize', function() {
                    if (window.innerWidth >= 768) {
                        stopAutoSlide();
                    } else {
                        scrollToSlide(currentIndex);
                        startAutoSlide();
                    }
                });

                requestAnimationFrame(function() {
                    if (window.innerWidth < 768) {
                        scrollToSlide(0);
                        startAutoSlide();
                    }
                });
            })();
            </script>
        </section>";

        return $html;
    }

    /**
     * "Best time to visit" copy for the SEO blog card - previously the exact
     * same sentence for all 108 city pages regardless of city (100% thin
     * duplicate content, worse than the first card's ~92-city fallback).
     * Differentiates by state's real seasonal pattern rather than fabricating
     * per-city claims we can't verify - honest and still a real improvement
     * over one sentence copy-pasted everywhere.
     */
    private function bestTimeToVisitDesc(string $cityName, string $state): string {
        $state = trim($state);
        $seasonalNotes = [
            'Tamil Nadu' => 'the Northeast monsoon (Oct-Dec) brings most of the rain, so November through February - after the rains, before peak summer heat - is the smoothest window for road travel',
            'Kerala' => 'the Southwest monsoon (Jun-Sep) is heavy, so October through March is the clearest and most comfortable stretch for a road trip',
            'Karnataka' => 'the climate stays fairly mild year-round, but October through February avoids both the summer heat and the main monsoon showers',
            'Andhra Pradesh' => 'summers run hot from March to June, so October through February is the most comfortable window for outstation travel',
            'Telangana' => 'summers run hot from March to June, so October through February is the most comfortable window for outstation travel',
            'Puducherry' => 'like the rest of the Tamil Nadu coast, the Northeast monsoon (Oct-Dec) brings most of the rain, so December through February is usually the calmest travel window',
        ];
        $note = $seasonalNotes[$state] ?? 'the cooler months (typically November to February) are usually the most comfortable for road travel across South India';
        return "Timing is everything for a smooth road trip to {$cityName} - " . $note . ".";
    }

    /**
     * Render SEO Blog/Guide Section
     */
    public function renderSeoBlog($id = 'travel-guides', $cityCtx = null) {
        $themeSlug = $this->getThemeSlug();
        $isHome = ($id === 'home-guides');
        $bookLink = $isHome ? $this->bookNowHref() : '#booking-form';
        $cityName = 'Tamil Nadu';
        $citySlug = 'tamil-nadu';
        $cityState = '';
        $cityDesc = 'Traveling intercity? Master the road with our expert tips. Skip the stress of public transport and discover the comfort of premium private outstation cabs across South India.';
        $cityTitle = 'Pro Guide: Smarter Intercity Travel';
        $cityImg = '/assets/img/seo/seo_generic_city.png';

        if ($cityCtx && isset($cityCtx['city'])) {
            $cityName = $cityCtx['city'];
            $citySlug = $cityCtx['slug'] ?? strtolower($cityName);
            $cityState = $cityCtx['state'] ?? '';

            // Dynamic Custom Descriptions & Images. The ~16 cities matched by
            // name below get a fully hand-written description; every other
            // city (the majority) falls through to this default - weaving in
            // the state keeps it from being a pure city-name swap across all
            // ~90 of them, though it's still a template, not unique prose.
            $cityDesc = $cityState
                ? "Planning a trip to {$cityName}, {$cityState}? Skip the hassle of buses and trains with a comfortable, professional private taxi direct to the city. Travel safe and on time."
                : "Planning a trip to {$cityName}? Skip the hassle of buses and trains with a comfortable, professional private taxi direct to the city. Travel safe and on time.";
            $cityTitle = "{$cityName} Travel Guide";
            $cityImg = '/assets/img/seo/seo_generic_city.png';
            
            if (stripos($cityName, 'Bangalore') !== false) {
                $cityDesc = 'Planning a trip to the IT Hub? Skip the hassle of buses and trains with a comfortable intercity drop taxi direct to Bangalore.';
                $cityImg = '/assets/img/seo/seo_bangalore_guide.png';
            } elseif (stripos($cityName, 'Madurai') !== false) {
                $cityDesc = 'Planning a trip to the Temple City of Madurai? Skip the hassle of buses with a comfortable private taxi direct to Meenakshi Amman Temple.';
                $cityImg = '/assets/img/seo/seo_madurai_guide.png';
            } elseif (stripos($cityName, 'Chennai') !== false) {
                $cityDesc = 'Planning a trip to Chennai? Enjoy a smooth, professional journey to the capital city with our premium drop taxi services.';
                $cityImg = '/assets/img/seo/chennai_guide.png';
            } elseif (stripos($cityName, 'Pondicherry') !== false) {
                $cityDesc = 'Planning a coastal getaway to Pondicherry? Book a safe, relaxing intercity cab and start your vacation early.';
                $cityImg = '/assets/img/seo/seo_pondicherry_guide.png';
            } elseif (stripos($cityName, 'Coimbatore') !== false) {
                $cityDesc = 'Planning a trip to Coimbatore? Travel comfortably to the Manchester of South India with our reliable one-way taxi drops.';
                $cityImg = '/assets/img/seo/coimbatore_guide.png';
            } elseif (stripos($cityName, 'Tiruvannamalai') !== false) {
                $cityDesc = 'Planning a trip to Arulmigu Annamalaiyar Temple? Skip the hassle of buses and trains with a comfortable private taxi direct to the temple city.';
                $cityTitle = 'Chennai to Tiruvannamalai Travel Guide';
                $cityImg = '/assets/img/seo/seo_chennai_tiruvannamalai_guide.png';
            } elseif (stripos($cityName, 'Tirupati') !== false) {
                $cityDesc = 'Planning a pilgrimage to Tirumala? Book a safe, comfortable outstation taxi with experienced hill drivers for a smooth travel experience.';
                $cityImg = '/assets/img/seo/seo_tirupati_guide.png';
            } elseif (stripos($cityName, 'Trichy') !== false) {
                $cityDesc = 'Traveling to Trichy? Book our reliable intercity outstation cabs and flat-rate one-way drop taxis for a safe, hassle-free road trip.';
                $cityImg = '/assets/img/seo/seo_trichy_guide.png';
            } elseif (stripos($cityName, 'Salem') !== false) {
                $cityDesc = 'Heading to the mango city? Book comfortable outstation taxis and flat-rate one-way drop taxis connecting Salem to all major cities.';
                $cityImg = '/assets/img/seo/seo_salem_guide.png';
            } elseif (stripos($cityName, 'Vellore') !== false) {
                $cityDesc = 'Heading to the Fort City or CMC Hospital? Book our comfortable, professional drop taxis and intercity cabs for your convenience.';
                $cityImg = '/assets/img/seo/seo_vellore_guide.png';
            } elseif (stripos($cityName, 'Tirunelveli') !== false) {
                $cityDesc = 'Traveling to Tirunelveli? Book our verified one-way drop taxis and outstation cabs with transparent flat pricing and no hidden costs.';
                $cityImg = '/assets/img/seo/seo_tirunelveli_guide.png';
            } elseif (stripos($cityName, 'Thanjavur') !== false) {
                $cityDesc = 'Planning a heritage tour to Tanjore Big Temple? Book our clean, premium AC cabs and outstation taxi services for a memorable journey.';
                $cityImg = '/assets/img/seo/seo_thanjavur_guide.png';
            } elseif (stripos($cityName, 'Kanchipuram') !== false) {
                $cityDesc = 'Planning a pilgrimage to the silk and temple town? Book clean, punctual outstation cabs and one-way drops with verified drivers.';
                $cityImg = '/assets/img/seo/seo_kanchipuram_guide.png';
            } elseif (stripos($cityName, 'Mysore') !== false) {
                $cityDesc = 'Heading to the royal city of palaces? Book a premium outstation taxi or a flat-rate one-way drop cab from Mysore in comfort.';
                $cityImg = '/assets/img/seo/seo_mysore_guide.png';
            } elseif (stripos($cityName, 'Kochi') !== false) {
                $cityDesc = 'Planning a trip to Kochi? Save with our flat per-km rates on outstation cabs, one-way drops, and reliable airport transfers.';
                $cityImg = '/assets/img/seo/seo_kochi_guide.png';
            } elseif (stripos($cityName, 'Hyderabad') !== false) {
                $cityDesc = 'Traveling to the City of Pearls? Secure a safe, comfortable intercity cab or a flat-rate one-way drop taxi with instant confirmation.';
                $cityImg = '/assets/img/seo/seo_hyderabad_guide.png';
            }
        }
        
        $cLow = strtolower($cityName);
        $blogs = [
            [
                'title' => $cityTitle,
                'desc' => $cityDesc,
                'img' => $cityImg,
                'link' => $isHome ? ("/{$themeSlug}/{$citySlug}") : $bookLink,
                'link_text' => $isHome ? 'Explore Route' : 'Check Fares Now', 'alt' => "{$cityName} travel guide"
            ],
            [
                'title' => "Best Time to Visit {$cityName}",
                'desc' => $this->bestTimeToVisitDesc($cityName, $cityState),
                'img' => '/assets/img/seo/seo_tamil_nadu_travel_timing.png',
                'link' => $bookLink, 'link_text' => 'Plan Your Timing', 'alt' => 'South India travel timing'
            ]
        ];

        // Fully customized 3-image blocks for top cities
        if ($cLow === 'tiruvannamalai') {
            $blogs[0] = [
                'title' => 'Girivalam Path Experience',
                'desc' => 'Experience the spiritual journey around Arunachala hill. We provide safe and comfortable outstation drops so you arrive peaceful and ready.',
                'img' => '/assets/img/seo/tiru_places.png',
                'link' => $bookLink, 'link_text' => 'Book Ride', 'alt' => 'Tiruvannamalai Girivalam'
            ];
            $blogs[2] = [
                'title' => 'Temple Rituals & Best Timings',
                'desc' => 'Visiting during Pournami or early mornings? Plan your travel with our reliable dropping cab services ensuring you never miss a ritual.',
                'img' => '/assets/img/seo/tiru_culture.png',
                'link' => $bookLink, 'link_text' => 'Plan Your Trip', 'alt' => 'Tiruvannamalai temple culture'
            ];
        } elseif ($cLow === 'bangalore') {
            $blogs[0] = [
                'title' => 'Top Places to Visit in Bangalore',
                'desc' => 'From the serene Lalbagh Botanical Gardens to the bustling MG Road, explore the Garden City with complete peace of mind.',
                'img' => '/assets/img/seo/bangalore_places.png',
                'link' => $bookLink, 'link_text' => 'Book Ride', 'alt' => 'Bangalore Lalbagh'
            ];
            $blogs[2] = [
                'title' => 'Best Time to Travel to Bangalore',
                'desc' => 'Known for its pleasant weather year-round, Bangalore is perfect for weekend getaways. Secure your intercity taxi easily.',
                'img' => '/assets/img/seo/seo_tamil_nadu_travel_timing.png',
                'link' => $bookLink, 'link_text' => 'Plan Your Trip', 'alt' => 'Bangalore Travel'
            ];
        } elseif ($cLow === 'chennai') {
            $blogs[0] = [
                'title' => 'Must-Visit: Kapaleeshwarar Temple',
                'desc' => 'Explore the rich heritage of Mylapore. Our professional drop taxis ensure you reach the heart of Chennai safely and comfortably.',
                'img' => '/assets/img/seo/chennai_places.png',
                'link' => $bookLink, 'link_text' => 'Book Ride', 'alt' => 'Chennai Temple'
            ];
            $blogs[1] = [
                'title' => 'Sunset at Marina Beach',
                'desc' => 'A trip to Chennai is incomplete without Marina Beach. Avoid the heavy city traffic by booking our relaxing intercity cabs.',
                'img' => '/assets/img/seo/chennai_guide.png',
                'link' => $bookLink, 'link_text' => 'Check Fares Now', 'alt' => 'Chennai Marina Beach'
            ];
            $blogs[2] = [
                'title' => 'Chennai City Travel Guide',
                'desc' => 'Planning a trip to the capital city? Enjoy a smooth, professional journey to Chennai with our premium outstation drop taxi services.',
                'img' => '/assets/img/seo/seo_generic_city.png',
                'link' => $bookLink, 'link_text' => 'Plan Your Trip', 'alt' => 'Chennai City Guide'
            ];
        } elseif ($cLow === 'coimbatore') {
            $blogs[0] = [
                'title' => 'Adiyogi & Velliangiri Hills',
                'desc' => 'Experience the grand Adiyogi Shiva surrounded by lush mountains. The perfect spiritual getaway made easy with our direct cabs.',
                'img' => '/assets/img/seo/coimbatore_guide.png',
                'link' => $bookLink, 'link_text' => 'Book Ride', 'alt' => 'Coimbatore Adiyogi'
            ];
        }

        /* Second set for variety if needed */
        $extraBlogs = [
            [
                'title' => 'Airport Transfers Made Simple & Reliable',
                'desc' => 'Never miss a flight again. We provide timely airport pickups and drops with real-time flight tracking for your peace of mind.',
                'img' => '/assets/img/seo/seo_airport_transfers_guide.png',
                'link' => $bookLink,
                'link_text' => 'Plan Your Trip',
                'alt' => 'Reliable airport taxi service'
            ]
        ];

        $guidesLead = htmlspecialchars($this->seoLine('seoTravelGuidesLead', 'Travel smarter with ' . $this->getBrandName() . ': Expert route ideas, perfect trip timings, and premium airport transfers designed for the modern traveler across South India.'), ENT_QUOTES, 'UTF-8');
        $html = "<section class='seo-section' id='{$id}'>
            <div class='container'>
                <div class='seo-section__header'>
                    <p class='eyebrow'>Pro Travel Insights</p>
                    <h2 style='margin-bottom: 0.5rem;'>Smart Guides for Seamless Trips</h2>
                    <p>{$guidesLead}</p>
                </div>
                <div class='seo-grid'>";

        foreach ($blogs as $b) {
            $html .= "
                    <article class='seo-card'>
                        <img src='{$b['img']}' alt='{$b['alt']}' class='seo-card__image' loading='lazy'>
                        <div class='seo-card__content'>
                            <h3>{$b['title']}</h3>
                            <p>{$b['desc']}</p>
                            <a href='{$b['link']}' class='btn-primary seo-card__cta' style='padding: 0.5rem 1.25rem; font-size: 0.85rem; border-radius: 8px;'>{$b['link_text']} <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round' style='margin-left: 8px;'><path d='M5 12h14M12 5l7 7-7 7'/></svg></a>
                        </div>
                    </article>";
        }

        $html .= "
                </div>
            </div>
        </section>";

        return $html;
    }

    /**
     * Render Fleet Showcase — slider for "All Cars", single static card for a chosen type.
     *
     * @param array $opts Optional keys: eyebrow, title
     */
    public function renderFleetShowcase($id = 'fleet-showcase', array $opts = []) {
        $bookLink = in_array($id, ['home-fleet', 'services'], true) ? $this->bookNowHref() : '#booking-form';
        $eyebrow = htmlspecialchars($opts['eyebrow'] ?? 'ELITE EXHIBITION', ENT_QUOTES, 'UTF-8');
        $title = htmlspecialchars($opts['title'] ?? 'Discover Our Premium Fleet', ENT_QUOTES, 'UTF-8');
        $configPath = __DIR__ . '/../data/config.json';
        $config = is_file($configPath) ? json_decode(file_get_contents($configPath), true) : [];
        $vehicles = $config['vehicles'] ?? [];
        $fares = $config['fares'] ?? [];

        $shortNames = [
            'sedan' => 'Sedan',
            'comfort_sedan' => 'Comfort Sedan',
            'elite_sedan' => 'Elite Sedan',
            'suv' => 'SUV',
            'innova' => 'Innova',
            'crysta' => 'Crysta',
        ];

        // Dynamic Filtering - Collect unique categories (values)
        $filterHtml = "<button type='button' class='fleet-filter__btn fleet-filter__btn--active' data-filter='*'>All Cars</button>";
        foreach ($vehicles as $v) {
            $slug = strtolower($v['value']);
            $label = $shortNames[$slug] ?? preg_replace('/\s*\(.*/', '', $v['label'] ?? $slug);
            $labelEsc = htmlspecialchars($label, ENT_QUOTES, 'UTF-8');
            $filterHtml .= "<button type='button' class='fleet-filter__btn' data-filter='{$slug}'>{$labelEsc}</button>";
        }
        
        $vehicleImages = [
            'SEDAN' => '/assets/img/vehicles/Etios.png',
            'COMFORT_SEDAN' => '/assets/img/vehicles/Etios.png',
            'ELITE_SEDAN' => '/assets/img/vehicles/Etios.png',
            'SUV' => '/assets/img/vehicles/Suv.png',
            'INNOVA' => '/assets/img/vehicles/Innova.png',
            'CRYSTA' => '/assets/img/vehicles/innova-crysta.png',
        ];

        $isDynamic = !empty($config['enable_dynamic_pricing']);

        $cardsHtml = "";
        foreach ($vehicles as $v) {
            $type = strtoupper($v['value']);
            $slug = strtolower($v['value']);
            $rateOneway = $v['rate'] ?? ($fares['baseFareOneWay'][$type] ?? 0);
            $rateRound = $fares['baseFareRoundTrip'][$type] ?? ($rateOneway - 1);
            
            $enableHighlighting = $this->config['enablePriceHighlighting'] ?? true;
            $oldRateOne = ($enableHighlighting && $isDynamic && !empty($v['old_rate']) && $v['old_rate'] > $rateOneway) ? $v['old_rate'] : 0;
            $oldRateRound = ($enableHighlighting && $isDynamic && !empty($fares['oldFareRoundTrip'][$type]) && $fares['oldFareRoundTrip'][$type] > $rateRound) ? $fares['oldFareRoundTrip'][$type] : 0;

            $img = $vehicleImages[$type] ?? '/assets/img/vehicles/Etios.png';
            $model = $v['model'] ?? $v['label'] ?? $type;
            $cardTitle = $shortNames[$slug] ?? ucfirst(strtolower(str_replace('_', ' ', $v['value'])));
            $passengers = $v['capacity'] ?? "4+1";
            $luggage = $v['luggage'] ?? "3";
            $isAc = $v['is_ac'] ?? true;

            $oneWayPriceHtml = $oldRateOne ? "<span class='strikethrough-fare'>₹{$oldRateOne}</span>₹{$rateOneway}/km" : "₹{$rateOneway}/km";
            $roundTripPriceHtml = $oldRateRound ? "<span class='strikethrough-fare'>₹{$oldRateRound}</span>₹{$rateRound}/km" : "₹{$rateRound}/km";

            $cardsHtml .= "
                    <div class='fleet-showcase__card fleet-slider-slide' data-category='{$slug}'>
                        <div class='fleet-showcase__img'>
                            <img src='{$img}' alt='{$type}' loading='lazy'>
                        </div>
                        <div class='fleet-showcase__content'>
                            <div class='fleet-showcase__head'>
                                <h3>{$cardTitle}</h3>
                                <span>₹{$rateOneway}/km</span>
                            </div>
                            <p class='fleet-showcase__category'>{$model}</p>
                            <ul class='fleet-showcase__features'>
                                <li><span class='feature-icon feature-icon--passengers'><i class='fa-solid fa-users'></i></span> Passengers: {$passengers}</li>
                                <li><span class='feature-icon feature-icon--luggage'><i class='fa-solid fa-suitcase'></i></span> Luggage: {$luggage}</li>
                                <li><span class='feature-icon feature-icon--ac'><i class='fa-solid fa-snowflake'></i></span> AC: " . ($isAc ? "Yes" : "No") . "</li>
                                <li class='pricing-detail'><span class='feature-icon feature-icon--arrow'><i class='fa-solid fa-arrow-right'></i></span> One-way: {$oneWayPriceHtml}</li>
                                <li class='pricing-detail'><span class='feature-icon feature-icon--arrow'><i class='fa-solid fa-arrows-left-right'></i></span> Round Trip: {$roundTripPriceHtml}</li>
                            </ul>
                            <a href='{$bookLink}' class='btn-primary'>BOOK NOW</a>
                        </div>
                    </div>";
        }

        $html = "
    <!-- Explore Our Options Section -->
    <section class='fleet-showcase fleet-showcase--slider' id='{$id}' data-fleet-hybrid='1'>
        <div class='container'>
            <p class='eyebrow'>{$eyebrow}</p>
            <h2>{$title}</h2>
            
            <div class='fleet-filter'>
                {$filterHtml}
            </div>

            <div class='fleet-slider-container' id='fleet-slider-{$id}' tabindex='0' role='region' aria-roledescription='carousel' aria-label='Vehicle fleet'>
                <div class='fleet-slider-track'>
                    {$cardsHtml}
                </div>
            </div>
        </div>
        <script>
        (function() {
            const container = document.getElementById('fleet-slider-{$id}');
            const section = container ? container.closest('.fleet-showcase') : null;
            if (!container || !section) return;
            
            const track = container.querySelector('.fleet-slider-track');
            const slides = Array.from(track.querySelectorAll('.fleet-slider-slide'));
            const filterBtns = Array.from(section.querySelectorAll('.fleet-filter__btn'));
            
            let currentIndex = 0;
            let autoSlideInterval;
            let currentFilter = '*';
            let scrollSyncTimer;
            const prefersReduced = typeof window.matchMedia === 'function' &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches;

            function scrollBehavior() {
                return prefersReduced ? 'auto' : 'smooth';
            }

            function scrollToSlide(index) {
                if (index < 0 || index >= slides.length) return;
                const slide = slides[index];
                if (slide.style.display === 'none') return;
                const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
                const left = slide.offsetLeft - (container.clientWidth - slide.offsetWidth) / 2;
                const target = Math.max(0, Math.min(left, maxScroll));
                container.scrollTo({ left: target, behavior: scrollBehavior() });
                currentIndex = index;
                slides.forEach(function(s, i) {
                    s.classList.toggle('active', currentFilter === '*' && i === index);
                });
            }

            function syncFromScroll() {
                if (currentFilter !== '*') return;
                const center = container.getBoundingClientRect().left + container.clientWidth / 2;
                let best = 0;
                let minD = Infinity;
                slides.forEach(function(slide, i) {
                    if (slide.style.display === 'none') return;
                    const r = slide.getBoundingClientRect();
                    const c = r.left + r.width / 2;
                    const d = Math.abs(c - center);
                    if (d < minD) {
                        minD = d;
                        best = i;
                    }
                });
                if (best !== currentIndex) {
                    currentIndex = best;
                    slides.forEach(function(s, i) {
                        s.classList.toggle('active', i === best);
                    });
                }
            }

            function updateSlider(index) {
                if (index >= slides.length) index = 0;
                scrollToSlide(index);
            }
            
            function nextSlide() {
                if (slides.length <= 1) return;
                const nextIndex = (currentIndex + 1) % slides.length;
                scrollToSlide(nextIndex);
            }
            
            function startAutoSlide() {
                stopAutoSlide();
                if (currentFilter !== '*') return;
                autoSlideInterval = setInterval(nextSlide, 5000);
            }
            
            function stopAutoSlide() {
                if (autoSlideInterval) clearInterval(autoSlideInterval);
            }

            function applyFilter(filter) {
                currentFilter = filter;
                currentIndex = 0;
                
                filterBtns.forEach(function(btn) {
                    btn.classList.toggle('fleet-filter__btn--active', btn.dataset.filter === filter);
                });
                
                slides.forEach(function(s) {
                    const matches = filter === '*' || s.dataset.category === filter;
                    s.style.display = matches ? 'block' : 'none';
                });
                
                if (filter === '*') {
                    section.classList.add('fleet-showcase--slider');
                    track.classList.remove('fleet-slider-track--static');
                    container.scrollLeft = 0;
                    requestAnimationFrame(function() {
                        requestAnimationFrame(function() {
                            scrollToSlide(0);
                            startAutoSlide();
                        });
                    });
                } else {
                    stopAutoSlide();
                    section.classList.remove('fleet-showcase--slider');
                    track.classList.add('fleet-slider-track--static');
                    slides.forEach(function(s) {
                        s.classList.toggle('active', s.style.display !== 'none');
                    });
                }
            }
            
            filterBtns.forEach(function(btn) {
                btn.addEventListener('click', function() {
                    applyFilter(btn.getAttribute('data-filter') || '*');
                });
            });

            container.addEventListener('scroll', function() {
                clearTimeout(scrollSyncTimer);
                scrollSyncTimer = setTimeout(syncFromScroll, 64);
            }, { passive: true });

            if ('onscrollend' in window) {
                container.addEventListener('scrollend', syncFromScroll, { passive: true });
            }

            container.addEventListener('keydown', function(e) {
                if (currentFilter !== '*') return;
                if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    scrollToSlide(Math.max(0, currentIndex - 1));
                } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    scrollToSlide(Math.min(slides.length - 1, currentIndex + 1));
                }
            });
            
            window.addEventListener('resize', function() {
                if (currentFilter === '*') {
                    scrollToSlide(currentIndex);
                }
            });
            
            container.addEventListener('mouseenter', stopAutoSlide);
            container.addEventListener('mouseleave', startAutoSlide);
            container.addEventListener('touchstart', stopAutoSlide, { passive: true });
            container.addEventListener('touchend', function() {
                setTimeout(startAutoSlide, 2500);
            }, { passive: true });
            
            applyFilter('*');
        })();
        </script>
    </section>";
        return $html;
    }

    /**
     * Render Active Marketing Banners & Popups
     * [LEGACY - DEPRECATED in favor of index.php interceptor]
     */
    public function renderMarketingAssets() {
        return '';
    }
}
