<?php
/**
 * Same booking form structure as the public home page (index.php) for admin manual entry.
 * Expects paths.php to be loaded (dropcars_url).
 */
require_once __DIR__ . '/paths.php';

$configPath = __DIR__ . '/../data/config.json';
$config = is_file($configPath) ? json_decode(file_get_contents($configPath), true) : [];
$fares = $config['fares'] ?? [];

// Dynamic support phone logic
$companyRawPhone = $config['company']['phone'] ?? '7200217986';
$companyPhoneDigits = preg_replace('/\D/', '', $companyRawPhone);
if (strlen($companyPhoneDigits) === 10) {
    $companyPhoneDisplay = '+91 ' . $companyPhoneDigits;
    $companyPhoneTel = '+91' . $companyPhoneDigits;
} else {
    $companyPhoneDisplay = '+' . $companyPhoneDigits;
    $companyPhoneTel = '+' . $companyPhoneDigits;
}
$vehicles = $config['vehicles'] ?? [
    ['value' => 'SEDAN', 'label' => 'Sedan', 'rate' => 14],
    ['value' => 'SUV', 'label' => 'SUV', 'rate' => 19],
    ['value' => 'INNOVA', 'label' => 'Innova', 'rate' => 20],
    ['value' => 'CRYSTA', 'label' => 'Crysta', 'rate' => 23],
];
$vehicleImgs = [
    'SEDAN' => 'assets/img/vehicles/Etios.png',
    'SUV' => 'assets/img/vehicles/Suv.png',
    'INNOVA' => 'assets/img/vehicles/Innova.png',
    'CRYSTA' => 'assets/img/vehicles/innova-crysta.png',
];
$u = static function (string $path): string {
    return htmlspecialchars(dropcars_url($path), ENT_QUOTES, 'UTF-8');
};
?>
<div class="booking-card booking-card--home admin-booking-flow" aria-label="Drop Cars admin booking form">
    <div class="booking-card__header" style="margin-bottom: 0.85rem;">
        <p class="booking-card__eyebrow" style="display:inline-block;margin:0 0 0.35rem;font-size:0.62rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#b45309;background:#fef3c7;padding:3px 10px;border-radius:999px;border:1px solid #fde68a;">Manual Entry</p>
        <h2 style="margin:0;font-size:1.05rem;font-weight:800;color:#0f172a;letter-spacing:-0.01em;">Book Your Customer's Taxi</h2>
    </div>
    <form id="booking-form" class="booking-form">

        <!-- 1. Trip Type + Subtypes -->
        <div class="trip-type-block">
            <label class="field trip-type-field">
                <select name="serviceType" id="service-type" class="visually-hidden" tabindex="-1" aria-hidden="true" required>
                    <option value="one_way">Drop Taxi</option>
                    <option value="multi_city">Multi City</option>
                    <option value="airport_transfer">Airport Transfer</option>
                    <option value="round_trip">Round Trip</option>
                    <option value="hourly_rental">Local Rental</option>
                </select>
                <div class="trip-type-options fare-toggle__switch" role="group" aria-label="Trip type">
                    <button type="button" class="trip-type-option trip-type-option--active" data-type="one_way">One-Way</button>
                    <button type="button" class="trip-type-option" data-type="round_trip">Round Trip</button>
                    <button type="button" class="trip-type-option" data-type="hourly_rental">Local</button>
                </div>
            </label>
            <div class="oneway-subtypes fare-toggle__switch">
                <input type="radio" name="oneway_subtype" id="subtype-oneway" value="one_way" checked />
                <label for="subtype-oneway">Outstation</label>
                <input type="radio" name="oneway_subtype" id="subtype-airport" value="airport_transfer" />
                <label for="subtype-airport">Airport</label>
                <input type="radio" name="oneway_subtype" id="subtype-multicity" value="multi_city" />
                <label for="subtype-multicity">Multi City</label>
            </div>
        </div>

        <!-- 2. Locations (stacked: pickup ? swap btn ? stops ? drop) -->
        <div id="locations-wrapper" style="position: relative; width: 100%; display: flex; flex-direction: column; gap: 0.5rem;">
            <label class="field" id="pickup-field-container">
                <span id="pickup-label-text">Pick Up Location *</span>
                <input type="text" name="pickup" id="pickup" placeholder="Pick Up Location" required />
            </label>

            <div id="swap-btn-container" class="hidden" style="display: none; justify-content: center; z-index: 10; position: relative;">
                <button type="button" id="airport-swap-btn" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border: 3px solid #fff; border-radius: 50%; width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 10px rgba(247,183,51,0.35); transition: transform 0.3s ease, box-shadow 0.3s ease;" onmouseover="this.style.transform='scale(1.08) rotate(180deg)';" onmouseout="this.style.transform='scale(1) rotate(0deg)';" aria-label="Swap Locations">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f7b733" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v10"/><path d="M11 16l-4 4-4-4"/><path d="M17 14V4"/><path d="M21 8l-4-4-4 4"/></svg>
                </button>
            </div>

            <div class="stops-control hidden" id="stops-control">
                <div class="stops-control__header">
                    <p id="stops-note" style="margin: 0; font-weight: 600; font-size: 0.8rem;">Add optional stops between pickup and drop.</p>
                    <button type="button" id="add-stop" class="btn-chips">+ Add Stop</button>
                </div>
                <div class="stops-list" id="stops-list"></div>
                <p class="stops-limit" style="margin: 0; font-size: 0.75rem; color: var(--gray-400);">Up to 10 stops • reorder with the ↑/↓ buttons</p>
            </div>

            <label class="field" id="drop-field">
                <span id="drop-label-text">Drop Location *</span>
                <input type="text" name="drop" id="drop" placeholder="Drop Location" required />
            </label>
        </div>

        <!-- 3. Date + Time -->
        <div class="field-pair">
            <label class="field">
                <span>Start Date *</span>
                <input type="date" name="date" required />
            </label>
            <label class="field">
                <span>Pick-up Time *</span>
                <input type="time" name="time" required />
            </label>
        </div>

        <!-- 4. Contact Info -->
        <div class="field-pair field-pair--contact-primary">
            <label class="field">
                <span>Name *</span>
                <input type="text" name="customerName" placeholder="Your Name" required />
            </label>
            <div class="field">
                <div class="field__label-row">
                    <span>Phone *</span>
                    <label class="wa-check-label" style="display: flex; align-items: center; gap: 0.35rem; margin: 0; font-size: 0.8125rem; font-weight: 600; color: var(--blue-dark); cursor: pointer;">
                        <span class="wa-label-icon" aria-hidden="true"><svg viewBox="0 0 32 32" width="18" height="18" fill="#25D366"><path d="M16 3C9.4 3 4 8.4 4 15c0 2.4.7 4.7 1.9 6.7L4 29l7.5-1.9A13 13 0 0 0 16 27c6.6 0 12-5.4 12-12S22.6 3 16 3Zm0 22.5c-2 0-4-.6-5.6-1.7l-.4-.2-4.4 1.1 1.2-4.3-.3-.4A10 10 0 1 1 26 15c0 5.5-4.5 10-10 10Zm6-7.4c-.3-.2-1.7-.8-2-.9s-.5-.2-.7.2c-.2.3-.8 1-1 1.2-.2.3-.4.2-.7.1-2-.8-3.2-2.6-3.4-3-.2-.3 0-.4.2-.6l.5-.6c.2-.2.2-.3.3-.5s0-.4 0-.6c0-.2-.7-1.8-1-2.5-.2-.6-.5-.6-.7-.6h-.6c-.2 0-.5.1-.7.3-.2.3-1 1-1 2.4s1 2.8 1.2 3.1c.1.2 2 3.3 5 4.6.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.1-1.4s-.3-.2-.6-.4Z"/></svg></span>
                        <input type="checkbox" id="use-whatsapp-check" checked style="margin: 0; width: 14px; height: 14px; accent-color: var(--blue);" aria-label="Use WhatsApp for contact" />
                    </label>
                </div>
                <div class="phone-input-wrapper phone-input-wrapper--country">
                    <div class="country-code-field" data-cc-default="+91">
                        <input type="hidden" name="countryCode" id="country-code-hidden" value="+91" />
                        <button type="button" class="country-code-trigger" id="country-code-trigger" aria-haspopup="dialog" aria-expanded="false" aria-controls="country-code-popover" title="Country code">+91</button>
                        <div id="country-code-popover" class="country-code-popover is-hidden" role="dialog" aria-label="Choose or type country code">
                            <button type="button" class="country-code-option" data-code="+91">+91</button>
                            <input type="text" class="country-code-manual-inline" id="country-code-manual-input" inputmode="tel" autocomplete="off" maxlength="12" placeholder="" aria-label="Type country code e.g. +65" />
                        </div>
                    </div>
                    <input type="tel" name="contactPhone" placeholder="9876543210" id="contact-phone" class="phone-national-input" inputmode="numeric" pattern="[0-9]*" maxlength="10" autocomplete="tel" required />
                </div>
            </div>
        </div>

        <div class="field-pair field-pair--contact-second" id="whatsapp-extra-row">
            <div class="field hidden" id="whatsapp-field">
                <span>WhatsApp Number *</span>
                <div class="phone-input-wrapper phone-input-wrapper--country">
                    <div class="country-code-field" data-cc-default="+91">
                        <input type="hidden" name="waCountryCode" id="wa-country-code-hidden" value="+91" />
                        <button type="button" class="country-code-trigger" id="wa-country-code-trigger" aria-haspopup="dialog" aria-expanded="false" aria-controls="wa-country-code-popover" title="Country code">+91</button>
                        <div id="wa-country-code-popover" class="country-code-popover is-hidden" role="dialog" aria-label="Choose or type country code">
                            <button type="button" class="country-code-option" data-code="+91">+91</button>
                            <input type="text" class="country-code-manual-inline" id="wa-country-code-manual-input" inputmode="tel" autocomplete="off" maxlength="12" placeholder="" aria-label="Type country code e.g. +65" />
                        </div>
                    </div>
                    <input type="tel" name="whatsappPhone" placeholder="9876543210" id="whatsapp-phone" class="phone-national-input" inputmode="numeric" pattern="[0-9]*" maxlength="15" autocomplete="tel" />
                </div>
            </div>
            <label class="field email-field" id="email-field">
                <span>Email (Optional)</span>
                <input type="email" name="contactEmail" placeholder="name@email.com" id="contact-email" />
                <span class="field-hint" style="font-size: 0.72rem; margin-top: 4px; display: block;">Provide email ID to get real time updates</span>
            </label>
            <div id="phone-spacer" style="display: none;"></div>
        </div>

        <input type="hidden" name="contactMode" value="phone" id="contact-mode-input" />

        <!-- 5. Round trip / hourly controls (hidden by default) -->
        <div class="field-pair hidden" id="end-date-drop-time-control">
            <label class="field">
                <span>End Date *</span>
                <input type="date" name="endDate" id="end-date-input" placeholder="mm/dd/yyyy" />
            </label>
            <label class="field">
                <span>Drop Time *</span>
                <input type="time" name="dropTime" id="drop-time-input" value="21:30" />
            </label>
        </div>

        <label class="field hidden" id="hourly-pickup-field">
            <span>Hourly Rental Pickup Location</span>
            <input type="text" name="hourlyPickup" placeholder="e.g., Chennai Central" />
        </label>
        <div class="hourly-control hidden" id="hourly-control">
            <span>Rental Duration</span>
            <div class="hourly-options" role="group" aria-label="Hourly rental duration">
                <button type="button" class="hourly-option hourly-option--active" data-hours="5_hours">5 Hours</button>
                <button type="button" class="hourly-option" data-hours="8_hours">8 Hours</button>
                <button type="button" class="hourly-option" data-hours="10_hours">10 Hours</button>
                <button type="button" class="hourly-option" data-hours="12_hours">12 Hours</button>
            </div>
            <input type="hidden" name="hourlyPackage" id="hourly-package" value="5_hours" />
        </div>

        <!-- 6. Vehicle Selector -->
        <div class="field" id="vehicle-selector-field">
            <input type="hidden" name="vehicleType" id="vehicle-type-input" value="" />
            <div class="vehicle-selector-grid" role="group" aria-label="Vehicle type">
                <?php foreach ($vehicles as $v):
                    $type = strtoupper($v['value'] ?? '');
                    $rate = $v['rate'] ?? ($fares['baseFareOneWay'][$type] ?? 0);
                    $img = $vehicleImgs[$type] ?? 'assets/img/vehicles/Etios.png';
                    $label = ucfirst(strtolower($v['value'] ?? ''));
                    if ($type === 'SEDAN') {
                        $label = 'Sedan';
                    }
                    ?>
                    <button type="button" class="vehicle-selector-card" data-vehicle="<?php echo htmlspecialchars($type, ENT_QUOTES, 'UTF-8'); ?>">
                        <img src="<?php echo $u($img); ?>" alt="<?php echo htmlspecialchars($label, ENT_QUOTES, 'UTF-8'); ?>" width="160" height="90" loading="lazy" decoding="async" onerror="this.style.display='none'" <?php echo ($type === 'SEDAN' ? 'style="transform: scale(0.85); object-fit: contain;"' : ''); ?> />
                        <span class="vehicle-selector-card__name"><?php echo htmlspecialchars($label, ENT_QUOTES, 'UTF-8'); ?></span>
                        <span class="vehicle-selector-card__price">
                            ₹<?php echo htmlspecialchars((string) $rate, ENT_QUOTES, 'UTF-8'); ?>/km
                        </span>
                    </button>
                <?php endforeach; ?>
            </div>
        </div>

        <!-- 7. Fare Type Toggle -->
        <div class="fare-toggle-wrap">
            <div class="fare-toggle__switch" role="group" aria-label="Fare type">
                <input type="radio" name="fareType" id="fare-base" value="base" checked />
                <label for="fare-base">Excl. Tolls &amp; Taxes</label>
                <input type="radio" name="fareType" id="fare-inclusive" value="inclusive" />
                <label for="fare-inclusive">Incl. Tolls, Taxes &amp; GST</label>
            </div>
            <button type="button" class="fare-info-btn" id="fare-inclusions-info-btn" aria-label="What is included in toll and tax?" title="Click to view inclusions breakdown">
                <span class="info-icon">ℹ️</span>
            </button>
            <div class="fare-info-popover is-hidden" id="fare-inclusions-popover" role="tooltip">
                <div class="fare-info-popover__header">
                    <strong>🧾 Fare Inclusions &amp; Tax Info</strong>
                    <button type="button" class="fare-info-popover__close" id="fare-inclusions-close" aria-label="Close info">✕</button>
                </div>
                <div class="fare-info-popover__body">
                    <ul class="fare-info-list">
                        <li><strong>✅ Highway Tolls:</strong> Estimated route toll charges included when selected.</li>
                        <li><strong>✅ 5% GST:</strong> Official CGST 2.5% + SGST 2.5% included for tax invoice.</li>
                        <li><strong>✅ Driver Bata:</strong> Full chauffeur allowance &amp; fuel included.</li>
                        <li><strong>ℹ️ State Border Tax:</strong> Calculated automatically by our smart engine. In rare cases where border entry taxes apply, it is applicable if crossing state borders only.</li>
                    </ul>
                </div>
            </div>
        </div>

        <!-- 8. Promo Code -->
        <div class="promo-row" id="promo-field">
            <span class="promo-row__text">Promo Code (Optional)</span>
            <input type="text" name="promoCode" id="promo-code" placeholder="Enter Code" autocomplete="off" aria-label="Promo code" />
            <button type="button" class="btn-promo-apply" id="promo-apply-btn">Apply</button>
        </div>

        <!-- 9. Submit / Fare Card -->
        <div class="submit-wrapper">
            <button type="button" class="btn-primary" id="calculate-fare-btn">Get Instant Fare</button>
            <div id="fare-card" class="fare-card" style="display: none;">
                <p class="fare-card__label">Estimated Fare</p>
                <p id="fare-amount" class="fare-card__amount">₹0</p>
                <p id="fare-distance" class="fare-card__meta" style="display: none;"></p>
                <p class="fare-card__disclaimer">Toll, parking &amp; state taxes extra.</p>
                <button type="submit" class="btn-primary btn-primary--confirm" id="confirm-booking-btn">Confirm &amp; save booking</button>
                <p class="fare-card__note admin-booking-fare-note">Saved to bookings with the same rules as the website.</p>
            </div>
        </div>

        <p id="form-response" class="form-response" role="status"></p>
    </form>

    <div class="sticky-submit-wrapper">
        <button type="button" class="btn-primary" id="sticky-calculate-btn">Get Instant Fare</button>
    </div>
</div>

<div class="quote-modal" id="quote-modal" aria-hidden="true">
    <div class="quote-modal__card" role="dialog" aria-modal="true">
        <button class="quote-modal__close" id="quote-close" aria-label="Close">&times;</button>
        <p class="eyebrow">Your fare options</p>
        <h3 id="quote-summary">Pick a vehicle &amp; fare</h3>
        <div class="quote-modal__meta"><span id="quote-route"></span><span id="quote-fare"></span></div>
        <div class="vehicle-grid" id="vehicle-grid"></div>
        <p class="quote-modal__cta">Call <a href="tel:<?php echo htmlspecialchars($companyPhoneTel); ?>"><?php echo htmlspecialchars($companyPhoneDisplay); ?></a> to confirm.</p>
        <div class="quote-modal__actions">
            <button type="button" class="btn-outline" id="quote-back">Back</button>
            <button type="button" class="btn-primary" id="quote-continue">Continue</button>
        </div>
    </div>
</div>
