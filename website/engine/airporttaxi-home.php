<?php
/**
 * AirportTaxi.International — homepage controller.
 *
 * Required by index.php when ThemeEngine resolves the active theme to
 * 'airporttaxi' (see the guarded hook added near the top of index.php, and
 * data/themes.json). Reuses the same UIShell header/footer chrome as every
 * other theme ($shell is already constructed by index.php before handing
 * off here) so navigation, footer, WhatsApp float, dark-mode toggle etc.
 * are the real shared components — only the hero/booking-form content below
 * is AirportTaxi-specific, because its trip types and tariff model are
 * genuinely different from Drop Cars' one-way/round-trip/hourly form.
 *
 * Booking flow wiring:
 *   Check Fare  -> POST api/airporttaxi-quote.php   (live, server-computed)
 *   Confirm     -> POST api/airporttaxi-confirm-booking.php
 *                  (persists via the same dropcars_persist_confirmation_booking(),
 *                   emails via the same dropcars_admin_send_mail(), alerts via
 *                   the same sendTelegramMessage())
 * After confirmation the customer is sent to the SAME
 * /track-booking/{id} and /customer-login pages Drop Cars already runs —
 * those are reused completely unchanged.
 */

require_once __DIR__ . '/airporttaxi-fare.php';
$tariffCfg = dropcars_airporttaxi_config();
$vehicles = dropcars_airporttaxi_vehicles();

$title = $activeTheme['metaTitle'] ?? 'Airport Taxi Tamil Nadu | AirportTaxi.International';
$description = $activeTheme['metaDesc'] ?? 'Premium, all-inclusive airport taxi service across Tamil Nadu and South India border cities.';

// True only on the real airporttaxi.international domain (or a local preview
// server that spoofs its Host header) — false when this page is reached via
// /airporttaxi under Drop Cars' own domain, where it should stay on-brand
// with Drop Cars' blue palette instead of the standalone gold identity.
$isNativeAirportTaxi = function_exists('dropcars_is_native_airporttaxi_host') && dropcars_is_native_airporttaxi_host();
$atiBodyModeClass = $isNativeAirportTaxi ? 'ati-native' : 'ati-embedded';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="<?php echo htmlspecialchars($description, ENT_QUOTES, 'UTF-8'); ?>" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="<?php echo htmlspecialchars(dropcars_canonical_request_url(), ENT_QUOTES, 'UTF-8'); ?>" />
    <title><?php echo htmlspecialchars($title, ENT_QUOTES, 'UTF-8'); ?></title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" />
    <link rel="stylesheet" href="/assets/css/base.css" />
    <link rel="stylesheet" href="/assets/css/layout.css" />
    <link rel="stylesheet" href="/assets/css/navbar.css" />
    <link rel="stylesheet" href="/assets/css/footer.css" />
    <link rel="stylesheet" href="/assets/css/responsive.css" />
    <link rel="stylesheet" href="/assets/css/whatsapp.css" />
    <link rel="stylesheet" href="/assets/css/theme-airporttaxi.css" />
    <?php include __DIR__ . '/../includes/google-tag.php'; ?>
</head>
<body class="theme-airporttaxi <?php echo $atiBodyModeClass; ?>">
<?php echo $shell->renderHeader(); ?>

<main class="ati-home">
    <section class="ati-hero">
        <div class="container ati-hero__grid">
            <div>
                <p class="ati-eyebrow">★ Elite Airport Transfers, All-Inclusive</p>
                <h1>Airport Transfers, <span>All-Inclusive.</span><br/>No Surprises at Drop-Off.</h1>
                <div class="ati-hero-divider"></div>
                <p class="ati-lead">Dedicated airport pickup &amp; drop across Tamil Nadu and South India's border cities — one clean, all-inclusive fare. Toll, driver allowance, state tax and GST already in the price.</p>
                <?php if ($isNativeAirportTaxi): ?>
                <p class="ati-lead" style="font-size:0.85rem;opacity:0.7;">A Drop Cars company. Need a non-airport outstation cab? <a href="/drop-cars" style="color:var(--ati-accent-solid);">Book with Drop Cars →</a></p>
                <?php endif; ?>
            </div>

            <div class="ati-card" id="ati-booking-card">
                <div class="ati-tabs">
                    <button type="button" class="ati-tab active" data-main="airport">Airport Transfer</button>
                    <button type="button" class="ati-tab" data-main="rental">Rental Package</button>
                </div>
                <div class="ati-subtabs" id="ati-subtabs">
                    <button type="button" class="ati-subtab active" data-sub="outstation">Outstation</button>
                    <button type="button" class="ati-subtab" data-sub="local">Local</button>
                </div>

                <div id="ati-fields-outstation">
                    <label class="ati-field"><span>Pickup *</span><input type="text" id="ati-outstation-pickup" placeholder="e.g., Chennai Airport (MAA)" /></label>
                    <label class="ati-field"><span>Drop *</span><input type="text" id="ati-outstation-drop" placeholder="e.g., Tiruvannamalai" /></label>
                    <div class="ati-field-row">
                        <label class="ati-field"><span>Approx. Distance (KM)</span><input type="number" id="ati-outstation-distance" min="0" /></label>
                        <label class="ati-field"><span>State Borders Crossed</span><input type="number" id="ati-border-count" min="0" max="3" value="0" /></label>
                    </div>
                </div>
                <div id="ati-fields-local" style="display:none;">
                    <label class="ati-field"><span>Pickup *</span><input type="text" id="ati-local-pickup" placeholder="e.g., Chennai Airport (MAA)" /></label>
                    <label class="ati-field"><span>Drop *</span><input type="text" id="ati-local-drop" placeholder="e.g., T. Nagar, Chennai" /></label>
                    <label class="ati-field"><span>Approx. Distance (KM)</span><input type="number" id="ati-local-distance" min="0" /></label>
                </div>
                <div id="ati-fields-rental" style="display:none;">
                    <label class="ati-field"><span>Pickup *</span><input type="text" id="ati-rental-pickup" placeholder="e.g., Coimbatore Airport (CJB)" /></label>
                    <label class="ati-field"><span>Expected Distance (KM)</span><input type="number" id="ati-rental-distance" min="0" /></label>
                    <div class="ati-subtabs" id="ati-hours-group">
                        <?php foreach ([5, 8, 10, 12] as $i => $h): ?>
                        <button type="button" class="ati-subtab ati-hours-btn <?php echo $i === 0 ? 'active' : ''; ?>" data-hours="<?php echo $h; ?>"><?php echo $h; ?> Hrs</button>
                        <?php endforeach; ?>
                    </div>
                </div>

                <div class="ati-field-row">
                    <label class="ati-field"><span>Date *</span><input type="date" id="ati-date" /></label>
                    <label class="ati-field"><span>Time *</span><input type="time" id="ati-time" /></label>
                </div>
                <label class="ati-field"><span>Full Name *</span><input type="text" id="ati-name" /></label>
                <div class="ati-field-row">
                    <label class="ati-field">
                        <span>Phone * <label style="font-weight:600;font-size:0.75rem;"><input type="checkbox" id="ati-wa-same" checked /> Same for WhatsApp</label></span>
                        <input type="tel" id="ati-phone" maxlength="10" />
                    </label>
                    <label class="ati-field"><span>Email *</span><input type="email" id="ati-email" /></label>
                </div>
                <label class="ati-field" id="ati-wa-field" style="display:none;"><span>WhatsApp Number *</span><input type="tel" id="ati-wa-phone" maxlength="10" /></label>

                <div class="ati-vehicle-picker" id="ati-vehicle-picker">
                    <?php foreach ($vehicles as $v): $vv = $tariffCfg['vehicles'][$v]; ?>
                    <div class="ati-vpick" data-vehicle="<?php echo $v; ?>">
                        <span class="ati-vicon"><?php echo $vv['icon']; ?></span>
                        <span class="ati-vname"><?php echo htmlspecialchars($vv['label']); ?></span>
                    </div>
                    <?php endforeach; ?>
                </div>

                <p class="ati-error" id="ati-error"></p>
                <button type="button" class="ati-btn-gold" id="ati-check-fare-btn" style="width:100%;">Check Fare Now</button>
            </div>
        </div>
    </section>

    <section class="ati-fleet">
        <div class="container">
            <p class="ati-eyebrow" style="color:var(--ati-accent-solid);">Our Fleet</p>
            <h2 style="color:var(--ati-ivory);">A Vehicle for Every Airport Run</h2>
            <div class="ati-fleet-grid">
                <?php foreach ($vehicles as $v): $vv = $tariffCfg['vehicles'][$v]; $local = $tariffCfg['local']; ?>
                <div class="ati-fleet-card">
                    <div style="font-size:2.2rem;"><?php echo $vv['icon']; ?></div>
                    <h4><?php echo htmlspecialchars($vv['label']); ?></h4>
                    <div style="font-size:0.75rem;opacity:0.6;"><?php echo htmlspecialchars($vv['seats']); ?> seats · <?php echo htmlspecialchars($vv['tagline']); ?></div>
                    <div style="font-family:'Playfair Display';font-size:1.3rem;color:var(--ati-accent-solid);margin-top:0.5rem;">₹<?php echo number_format($local['minPrice'][$v]); ?><small style="display:block;font-family:Inter;font-size:0.65rem;opacity:0.6;">up to <?php echo $local['includedKm']; ?> km, all-inclusive</small></div>
                </div>
                <?php endforeach; ?>
            </div>
        </div>
    </section>
</main>

<!-- QUOTE MODAL -->
<div class="ati-modal-overlay" id="ati-quote-modal">
    <div class="ati-modal-card">
        <button class="ati-modal-close" id="ati-quote-close">✕</button>
        <p class="ati-eyebrow">Instant Quote</p>
        <h3 id="ati-quote-title">Your Fare</h3>
        <div id="ati-quote-list"></div>
        <div id="ati-quote-breakdown"></div>
        <button class="ati-btn-gold" id="ati-confirm-btn" style="width:100%;margin-top:1rem;" disabled>Confirm Booking</button>
        <p id="ati-confirm-result" style="font-size:0.85rem;margin-top:0.6rem;"></p>
    </div>
</div>

<style>
/* AirportTaxi.International — dedicated airport-taxi booking page, shared by
   two contexts:
   - Reached at /airporttaxi under Drop Cars' own domain ("embedded"): stays
     on Drop Cars' navy/sky-blue palette, since the page belongs to Drop Cars.
   - Reached on the real airporttaxi.international domain ("native", flagged
     by dropcars_is_native_airporttaxi_host()): switches to the standalone
     elite obsidian/champagne-gold identity via the .ati-native overrides. */
body.theme-airporttaxi{
  /* Embedded default — mirrors Drop Cars' own --blue/--blue-dark/--accent (assets/css/base.css) */
  --ati-bg-1:#070d18; --ati-bg-2:#0f1c2e; --ati-bg-3:#1a2b45;
  --ati-bg-solid:#070d18; --ati-tab-active-1:#0f1c2e; --ati-tab-active-2:#070d18;
  --ati-ivory:#f7f3ea; --ati-ivory-muted:rgba(247,243,234,0.72);
  --ati-accent-1:#7dd3fc; --ati-accent-2:#38bdf8; --ati-accent-3:#0ea5e9;
  --ati-accent-solid:#38bdf8; --ati-accent-mid:#0ea5e9;
  --ati-soft-1:#e0f2fe; --ati-soft-2:#bae6fd; --ati-soft-text:#075985;
  --ati-btn-text:#ffffff;
  --ati-glow-a:rgba(56,189,248,0.14); --ati-glow-b:rgba(56,189,248,0.08);
  --ati-border-a:rgba(56,189,248,0.18); --ati-border-b:rgba(56,189,248,0.35);
  --ati-border-c:rgba(56,189,248,0.15); --ati-border-d:rgba(56,189,248,0.22);
  --ati-border-e:rgba(56,189,248,0.55);
  --ati-shadow-a:rgba(14,165,233,0.5); --ati-shadow-b:rgba(14,165,233,0.6);
  --ati-focus-shadow:rgba(56,189,248,0.16);
}
body.theme-airporttaxi.ati-native{
  /* Native override — elite obsidian + champagne-gold identity */
  --ati-bg-1:#07070a; --ati-bg-2:#0c0c10; --ati-bg-3:#111116;
  --ati-bg-solid:#0a0a0c; --ati-tab-active-1:#171612; --ati-tab-active-2:#0a0a0c;
  --ati-accent-1:#f0d9a3; --ati-accent-2:#d9b46a; --ati-accent-3:#a67c2e;
  --ati-accent-solid:#d9b46a; --ati-accent-mid:#c9a24b;
  --ati-soft-1:#f6e9c7; --ati-soft-2:#eddaa4; --ati-soft-text:#5a4110;
  --ati-btn-text:#171200;
  --ati-glow-a:rgba(217,180,106,0.14); --ati-glow-b:rgba(217,180,106,0.08);
  --ati-border-a:rgba(217,180,106,0.18); --ati-border-b:rgba(217,180,106,0.35);
  --ati-border-c:rgba(217,180,106,0.15); --ati-border-d:rgba(217,180,106,0.22);
  --ati-border-e:rgba(217,180,106,0.55);
  --ati-shadow-a:rgba(166,124,46,0.5); --ati-shadow-b:rgba(166,124,46,0.6);
  --ati-focus-shadow:rgba(201,162,75,0.16);
}

.ati-home{font-family:'Inter',sans-serif;color:#171612;}
.ati-eyebrow{text-transform:uppercase;font-size:0.72rem;letter-spacing:0.24em;color:var(--ati-accent-solid);font-weight:700;}

.ati-hero{
  position:relative;
  background:
    radial-gradient(1100px 520px at 85% -10%, var(--ati-glow-a), transparent 60%),
    radial-gradient(900px 500px at -10% 110%, var(--ati-glow-b), transparent 55%),
    linear-gradient(180deg,var(--ati-bg-1) 0%,var(--ati-bg-2) 55%,var(--ati-bg-3) 100%);
  color:var(--ati-ivory);
  padding:4.5rem 0;
  border-bottom:1px solid var(--ati-border-a);
}
.ati-hero__grid{display:grid;grid-template-columns:1.05fr 0.95fr;gap:2.5rem;align-items:start;}
@media (max-width:960px){.ati-hero__grid{grid-template-columns:1fr;}}
.ati-hero h1{font-family:'Playfair Display',serif;font-weight:700;font-size:clamp(1.9rem,4vw,3.1rem);margin:0.7rem 0;letter-spacing:-0.01em;line-height:1.12;color:var(--ati-ivory);}
.ati-hero h1 span{background:linear-gradient(135deg,var(--ati-accent-1) 0%,var(--ati-accent-2) 55%,var(--ati-accent-3) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
.ati-lead{color:var(--ati-ivory-muted);max-width:520px;line-height:1.65;}
.ati-hero-divider{width:56px;height:2px;background:linear-gradient(90deg,var(--ati-accent-solid),transparent);margin:1.1rem 0;}

.ati-card{
  background:#fdfcf8;
  color:#171612;
  border-radius:20px;
  padding:1.6rem;
  border:1px solid var(--ati-border-b);
  box-shadow:0 30px 70px -18px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.02);
  position:relative;
  overflow:hidden;
}
.ati-card::before{
  content:'';
  position:absolute;top:0;left:0;right:0;height:4px;
  background:linear-gradient(90deg,var(--ati-accent-3),var(--ati-accent-1) 50%,var(--ati-accent-3));
}
.ati-tabs{display:flex;background:#f1ede2;border-radius:12px;padding:0.3rem;gap:0.3rem;margin-bottom:0.8rem;}
.ati-tab{flex:1;padding:0.65rem;border:none;background:none;border-radius:9px;font-weight:700;font-size:0.85rem;cursor:pointer;opacity:0.5;color:#171612;transition:all .2s ease;}
.ati-tab.active{background:linear-gradient(135deg,var(--ati-tab-active-1),var(--ati-tab-active-2));color:var(--ati-accent-1);opacity:1;box-shadow:0 4px 12px rgba(0,0,0,0.25);}
.ati-subtabs{display:flex;gap:0.4rem;margin-bottom:0.8rem;flex-wrap:wrap;}
.ati-subtab{flex:1;min-width:70px;padding:0.5rem;border-radius:8px;font-size:0.78rem;font-weight:700;border:1.5px solid #e5decb;background:#fff;cursor:pointer;color:#171612;transition:all .2s ease;}
.ati-subtab.active{border-color:var(--ati-accent-3);background:linear-gradient(135deg,var(--ati-soft-1),var(--ati-soft-2));color:var(--ati-soft-text);}
.ati-field{display:flex;flex-direction:column;gap:0.3rem;font-size:0.8rem;font-weight:700;margin-bottom:0.7rem;}
.ati-field input{border:1.5px solid #e5decb;border-radius:10px;padding:0.6rem 0.75rem;font-size:0.9rem;font-family:inherit;background:#fff;transition:border-color .2s ease, box-shadow .2s ease;}
.ati-field input:focus{outline:none;border-color:var(--ati-accent-mid);box-shadow:0 0 0 3px var(--ati-focus-shadow);}
.ati-field-row{display:grid;grid-template-columns:1fr 1fr;gap:0.7rem;}
.ati-vehicle-picker{display:grid;grid-template-columns:repeat(5,1fr);gap:0.5rem;margin:0.8rem 0;}
@media (max-width:560px){.ati-vehicle-picker{grid-template-columns:repeat(3,1fr);}}
.ati-vpick{border:1.5px solid #e5decb;border-radius:12px;padding:0.5rem 0.3rem;text-align:center;cursor:pointer;transition:all .2s ease;}
.ati-vpick:hover{border-color:var(--ati-accent-mid);transform:translateY(-1px);}
.ati-vpick.active{border-color:var(--ati-accent-3);background:linear-gradient(135deg,var(--ati-soft-1),var(--ati-soft-2));box-shadow:0 6px 16px var(--ati-border-d);}
.ati-vicon{display:block;font-size:1.4rem;}
.ati-vname{display:block;font-size:0.68rem;font-weight:700;}
.ati-btn-gold{
  background:linear-gradient(135deg,var(--ati-accent-1) 0%,var(--ati-accent-2) 45%,var(--ati-accent-3) 100%);
  color:var(--ati-btn-text);border:none;padding:0.95rem 1.6rem;border-radius:999px;
  font-weight:800;cursor:pointer;font-size:0.95rem;letter-spacing:0.01em;
  box-shadow:0 10px 24px -6px var(--ati-shadow-a);
  transition:transform .18s ease, box-shadow .18s ease;
}
.ati-btn-gold:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 14px 30px -6px var(--ati-shadow-b);}
.ati-btn-gold:disabled{opacity:0.55;cursor:not-allowed;}
.ati-error{color:#c0392b;font-size:0.8rem;min-height:1.1em;}

.ati-fleet{background:var(--ati-bg-solid);color:var(--ati-ivory);padding:4rem 0;border-top:1px solid var(--ati-border-c);}
.ati-fleet-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:1rem;margin-top:1.5rem;}
@media (max-width:960px){.ati-fleet-grid{grid-template-columns:repeat(2,1fr);}}
.ati-fleet-card{background:linear-gradient(180deg,var(--ati-glow-a),rgba(255,255,255,0.02));border:1px solid var(--ati-border-d);border-radius:16px;padding:1.4rem 1.1rem;text-align:center;transition:transform .2s ease, border-color .2s ease;}
.ati-fleet-card:hover{transform:translateY(-4px);border-color:var(--ati-border-e);}
.ati-fleet-card h4{font-family:'Playfair Display',serif;margin:0.5rem 0 0.2rem;color:var(--ati-ivory);}

.ati-modal-overlay{position:fixed;inset:0;background:rgba(6,6,8,0.72);display:flex;align-items:center;justify-content:center;z-index:900;opacity:0;pointer-events:none;transition:opacity .3s;padding:1rem;}
.ati-modal-overlay.open{opacity:1;pointer-events:auto;}
.ati-modal-card{background:#fdfcf8;border-radius:20px;max-width:520px;width:100%;max-height:85vh;overflow-y:auto;padding:1.75rem;position:relative;border:1px solid var(--ati-border-b);box-shadow:0 30px 70px -12px rgba(0,0,0,0.6);}
.ati-modal-card::before{content:'';position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,var(--ati-accent-3),var(--ati-accent-1) 50%,var(--ati-accent-3));border-radius:20px 20px 0 0;}
.ati-modal-close{position:absolute;top:1rem;right:1rem;border:none;background:#f1ede2;width:32px;height:32px;border-radius:50%;cursor:pointer;}
.ati-quote-row{display:flex;justify-content:space-between;align-items:center;border:1.5px solid #e5decb;border-radius:12px;padding:0.8rem 1rem;margin-bottom:0.6rem;cursor:pointer;transition:all .2s ease;}
.ati-quote-row:hover{border-color:var(--ati-accent-mid);}
.ati-quote-row.selected{border-color:var(--ati-accent-3);background:linear-gradient(135deg,var(--ati-soft-1),var(--ati-soft-2));}
</style>

<script>
(function(){
  var state = {mainType:'airport', subType:'local', vehicle:null, hours:5, selected:null, lastQuotes:null};

  function q(id){return document.getElementById(id);}
  function showMode(main, sub){
    state.mainType = main; state.subType = sub || 'local';
    document.querySelectorAll('.ati-tab').forEach(function(t){t.classList.toggle('active', t.dataset.main===main);});
    q('ati-subtabs').style.display = main==='airport' ? 'flex' : 'none';
    document.querySelectorAll('#ati-subtabs .ati-subtab').forEach(function(t){t.classList.toggle('active', t.dataset.sub===sub);});
    q('ati-fields-local').style.display = (main==='airport' && sub==='local') ? 'block':'none';
    q('ati-fields-outstation').style.display = (main==='airport' && sub==='outstation') ? 'block':'none';
    q('ati-fields-rental').style.display = (main==='rental') ? 'block':'none';
  }
  document.querySelectorAll('.ati-tab').forEach(function(t){
    t.addEventListener('click', function(){ showMode(t.dataset.main, t.dataset.main==='airport' ? 'local' : null); });
  });
  document.querySelectorAll('#ati-subtabs .ati-subtab').forEach(function(t){
    t.addEventListener('click', function(){ showMode('airport', t.dataset.sub); });
  });
  document.querySelectorAll('.ati-hours-btn').forEach(function(t){
    t.addEventListener('click', function(){
      document.querySelectorAll('.ati-hours-btn').forEach(function(b){b.classList.remove('active');});
      t.classList.add('active'); state.hours = parseInt(t.dataset.hours,10);
    });
  });
  showMode('airport','outstation');

  document.querySelectorAll('.ati-vpick').forEach(function(p){
    p.addEventListener('click', function(){
      var already = p.classList.contains('active');
      document.querySelectorAll('.ati-vpick').forEach(function(x){x.classList.remove('active');});
      if(!already){ p.classList.add('active'); state.vehicle = p.dataset.vehicle; } else { state.vehicle = null; }
    });
  });

  q('ati-wa-same').addEventListener('change', function(){
    q('ati-wa-field').style.display = this.checked ? 'none' : 'flex';
  });

  function gatherParams(){
    if(state.mainType==='rental'){
      return {mode:'rental', hours: state.hours, distanceKm: Number(q('ati-rental-distance').value)||0};
    }
    if(state.subType==='outstation'){
      return {mode:'outstation', distanceKm: Number(q('ati-outstation-distance').value)||0, borders: Number(q('ati-border-count').value)||0};
    }
    return {mode:'local', distanceKm: Number(q('ati-local-distance').value)||0};
  }
  function getPickup(){
    if(state.mainType==='rental') return q('ati-rental-pickup').value.trim();
    if(state.subType==='outstation') return q('ati-outstation-pickup').value.trim();
    return q('ati-local-pickup').value.trim();
  }
  function getDrop(){
    if(state.subType==='outstation') return q('ati-outstation-drop').value.trim();
    if(state.mainType==='airport') return q('ati-local-drop').value.trim();
    return '';
  }
  function validate(){
    var err = q('ati-error'); err.textContent='';
    if(!q('ati-name').value.trim()){ err.textContent='Please enter your name.'; return false; }
    if(!/^\d{10}$/.test(q('ati-phone').value.trim())){ err.textContent='Enter a valid 10-digit phone number.'; return false; }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q('ati-email').value.trim())){ err.textContent='Enter a valid email address.'; return false; }
    if(!q('ati-wa-same').checked && !/^\d{10}$/.test(q('ati-wa-phone').value.trim())){ err.textContent='Enter a valid WhatsApp number.'; return false; }
    if(!getPickup()){ err.textContent='Please enter a pickup location.'; return false; }
    if(state.mainType==='airport' && !getDrop()){ err.textContent='Please enter a drop location.'; return false; }
    return true;
  }

  q('ati-check-fare-btn').addEventListener('click', function(){
    if(!validate()) return;
    var params = gatherParams();
    if(state.vehicle) params.vehicle = state.vehicle;
    fetch('/api/airporttaxi-quote.php', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(params)})
      .then(function(r){return r.json();})
      .then(function(res){
        if(!res.success){ q('ati-error').textContent = res.message || 'Could not fetch fare.'; return; }
        var quotes = res.quote ? (function(){var o={}; o[res.quote.vehicle]=res.quote; return o;})() : res.quotes;
        state.lastQuotes = quotes;
        renderQuoteModal(quotes);
        q('ati-quote-modal').classList.add('open');
      })
      .catch(function(){ q('ati-error').textContent = 'Network error — please try again.'; });
  });

  function vLabel(k){ return (window.ATI_VEHICLE_LABELS||{})[k] || k; }

  function renderQuoteModal(quotes){
    var list = q('ati-quote-list');
    var keys = Object.keys(quotes);
    q('ati-quote-title').textContent = keys.length===1 ? 'Your Fare' : 'Compare Vehicles';
    list.innerHTML = keys.map(function(k){
      var f = quotes[k];
      return '<div class="ati-quote-row" data-vehicle="'+k+'"><span>'+f.vehicle+'</span><b>₹'+f.total.toLocaleString('en-IN')+'</b></div>';
    }).join('');
    document.querySelectorAll('.ati-quote-row').forEach(function(row){
      row.addEventListener('click', function(){
        document.querySelectorAll('.ati-quote-row').forEach(function(r){r.classList.remove('selected');});
        row.classList.add('selected');
        state.selected = quotes[row.dataset.vehicle];
        q('ati-quote-breakdown').innerHTML = '<pre style="white-space:pre-wrap;font-size:0.78rem;background:#f4f2ec;padding:0.8rem;border-radius:8px;">'+JSON.stringify(state.selected, null, 2)+'</pre>';
        q('ati-confirm-btn').disabled = false;
      });
    });
    if(keys.length===1){ list.firstChild.click(); }
  }

  q('ati-quote-close').addEventListener('click', function(){ q('ati-quote-modal').classList.remove('open'); });

  q('ati-confirm-btn').addEventListener('click', function(){
    if(!state.selected) return;
    var params = gatherParams();
    var payload = Object.assign({}, params, {
      vehicle: state.selected.vehicle,
      tripMainType: state.mainType,
      tripSubType: state.subType,
      pickup: getPickup(),
      drop: getDrop(),
      date: q('ati-date').value,
      time: q('ati-time').value,
      customerName: q('ati-name').value.trim(),
      contactPhone: q('ati-phone').value.trim(),
      useWhatsappSameNumber: q('ati-wa-same').checked,
      whatsappPhone: q('ati-wa-phone').value.trim(),
      contactEmail: q('ati-email').value.trim()
    });
    q('ati-confirm-btn').disabled = true;
    q('ati-confirm-btn').textContent = 'Confirming…';
    fetch('/api/airporttaxi-confirm-booking.php', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)})
      .then(function(r){return r.json();})
      .then(function(res){
        if(res.success){
          window.location.href = '/track-booking/' + res.bookingId;
        } else {
          q('ati-confirm-result').textContent = res.message || 'Could not confirm booking.';
          q('ati-confirm-btn').disabled = false;
          q('ati-confirm-btn').textContent = 'Confirm Booking';
        }
      })
      .catch(function(){
        q('ati-confirm-result').textContent = 'Network error — please try again.';
        q('ati-confirm-btn').disabled = false;
        q('ati-confirm-btn').textContent = 'Confirm Booking';
      });
  });
})();
</script>

<?php echo $shell->renderFooter(); ?>
<?php echo $shell->renderScripts(); ?>
</body>
</html>
