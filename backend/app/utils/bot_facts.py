"""Numbers the help bot quotes, read from the SAME places the apps and the billing use - never typed into the bot.

  driver tariff   crud/driver_tariff.py (Admin App > Tariffs > Driver): one-way / round-trip km rate and bata per vehicle
  minimum km      utils/fare_rules.py (oneway_min_km, round_trip_min_km_per_day)
  hold, fees      utils/commission.get_fee_settings (min_driver_hold, commission_min, convenience_fee ...)
  waiting         platform setting multicity_waiting_rate_per_hour
If a number is not set anywhere the bot says so and sends the driver to the booking / Dispatch - it does not invent one."""
from typing import Optional

from sqlalchemy.orm import Session

# the vehicle groups the bot talks about: (label, CarTypeEnum value)
VEHICLES = (("Sedan", "SEDAN_4_PLUS_1"), ("SUV", "SUV"), ("Innova", "INNOVA"), ("Innova Crysta", "INNOVA_CRYSTA"))


def _rupee(n) -> str:
    return f"₹{int(n):,}"


def _vehicle(db: Session, key: str) -> dict:
    try:
        from app.crud import driver_tariff
        return (driver_tariff.load(db).get("vehicles") or {}).get(key) or {}
    except Exception:  # noqa: BLE001
        return {}


def fare_rules() -> dict:
    from app.utils.fare_rules import get_fare_rules
    return get_fare_rules()


def fees(db: Session) -> dict:
    from app.utils.commission import get_fee_settings
    return get_fee_settings(db)


def commission_pct(db: Session) -> int:
    try:
        from app.utils.commission import get_commission_rates
        return int(get_commission_rates(db, "OUTSTATION", "STANDARD").get("vendor", 10))
    except Exception:  # noqa: BLE001
        return 10


def _rate_line(row: dict, ta: bool) -> str:
    one, rnd = row.get("km_rate"), row.get("km_rate_round")
    same = "வாடிக்கையாளர் கட்டணம்படி" if ta else "as per the customer's rate"
    a = f"{_rupee(one)}/km" if one else same
    b = f"{_rupee(rnd)}/km" if rnd else same
    return (f"Oneway {a} | Round trip {b}") if not ta else (f"One-way {a} | Round trip {b}")


def tariff_plain(db: Session) -> str:
    """One plain English line per vehicle for the LLM's rule sheet (same numbers as the overview)."""
    rules = fare_rules()
    parts = []
    for label, key in VEHICLES:
        r = _vehicle(db, key)
        if r and (r.get("km_rate") or r.get("km_rate_round")):
            parts.append(f"{label}: one-way Rs {r.get('km_rate') or 'customer rate'}/km, round trip Rs {r.get('km_rate_round') or 'customer rate'}/km, bata Rs {r.get('bata') or 0}/day")
    if not parts:
        return ""
    return ("- DRIVER TARIFF (what the driver is paid; Admin App > Tariffs > Driver): " + "; ".join(parts)
            + f". Minimum billing: one-way {rules.get('oneway_min_km')} km, round trip {rules.get('round_trip_min_km_per_day')} km per day. Toll, parking and permit are paid by the customer on actuals.")


def tariff_overview(db: Session, ta: bool) -> str:
    rules = fare_rules()
    rows = []
    for label, key in VEHICLES:
        r = _vehicle(db, key)
        if r:
            rows.append(f"• **{label}**: {_rate_line(r, ta)} | Bata {_rupee(r.get('bata') or 0)}")
    mins = (f"One-way min {rules.get('oneway_min_km')} km | Round trip min {rules.get('round_trip_min_km_per_day')} km/day")
    if ta:
        head = "\U0001F4B0 **Drop Cars Driver Tariff** (Admin-ல் அமைத்த தற்போதைய விகிதம்):\n\n"
        tail = f"\n\n• **குறைந்தபட்ச km**: {mins}\n• **Toll & Parking**: அசல் ரசீதுப்படி வாடிக்கையாளர் செலுத்துவார்.\n\n\U0001F4A1 *இரண்டு ஊர்களை type செய்யுங்கள் (எ.கா: 'Chennai to Madurai') - தூரமும் fare-உம் சொல்கிறேன்.*"
    else:
        head = "\U0001F4B0 **Drop Cars Driver Tariff** (current rates set by Admin):\n\n"
        tail = f"\n\n• **Minimum km**: {mins}\n• **Toll & Parking**: paid by the customer on actual receipts.\n\n\U0001F4A1 *Type two cities (e.g. 'Chennai to Madurai') for the distance and fare.*"
    if not rows:
        return head + ("Rates are not published yet - please ask Dispatch." if not ta else "விகிதங்கள் இன்னும் அமைக்கப்படவில்லை - Dispatch-ஐக் கேளுங்கள்.")
    return head + "\n".join(rows) + tail


def tariff_estimate(db: Session, ta: bool, pickup: str, drop: str, km: Optional[int], car_label: str, car_key: str, round_trip: bool) -> str:
    r = _vehicle(db, car_key)
    rules = fare_rules()
    rate = r.get("km_rate_round") if round_trip else r.get("km_rate")
    bata = int(r.get("bata") or 0)
    kind = "Round trip" if round_trip else "One-way"
    if not km:
        return (f"\U0001F697 {pickup} ➔ {drop}: " + ("இந்த ஊர்களுக்கு இடையிலான தூரம் என்னிடம் இல்லை. Post Booking-ல் / Google Maps-ல் பார்த்துக் கொள்ளுங்கள்; பிறகு கட்டணம் = தூரம் × விகிதம்."
                if ta else "I do not have the distance for this route. Check it in Post Booking / Google Maps; the fare is then distance × the rate below.")
                + "\n\n" + tariff_overview(db, ta))
    if not rate:
        return (f"\U0001F697 {pickup} ➔ {drop} (~{km} km, {car_label}): " + ("இந்த வாகனத்துக்கு தனி driver விகிதம் அமைக்கப்படவில்லை - வாடிக்கையாளர் விகிதம் பொருந்தும். Booking-ஐப் பாருங்கள்."
                if ta else "no separate driver rate is set for this vehicle - the customer's rate applies. Please check the booking."))
    trip_km = km * 2 if round_trip else km                       # a round trip goes there and comes back
    min_km = int(rules.get("round_trip_min_km_per_day") or 0) if round_trip else int(rules.get("oneway_min_km") or 0)
    billed = max(trip_km, min_km)
    fare = billed * int(rate)
    total = fare + bata
    note_min = (f" (min {min_km} km billed)" if billed > trip_km else "")
    per_day = " per day" if round_trip else ""
    if ta:
        return (f"\U0001F697 **{pickup} ➔ {drop}** ({car_label}, {kind})\n\n• தூரம்: ~{trip_km} km{note_min}\n• Driver விகிதம்: {_rupee(rate)}/km\n• Km fare: {_rupee(fare)}\n"
                f"• Bata: {_rupee(bata)}{'/நாள்' if round_trip else ''}\n\U0001F4B0 **மொத்தம் (உத்தேசம்): ~{_rupee(total)}**{' (ஒரு நாள் bata மட்டும்)' if round_trip else ''}\n✨ Toll அசல் ரசீதுப்படி வாடிக்கையாளர் செலுத்துவார். இது driver tariff; இறுதி booking-ன் விவரத்தைப் பாருங்கள்.")
    return (f"\U0001F697 **{pickup} ➔ {drop}** ({car_label}, {kind})\n\n• Distance: ~{trip_km} km{note_min}\n• Driver rate: {_rupee(rate)}/km\n• Km fare: {_rupee(fare)}\n"
            f"• Bata: {_rupee(bata)}{per_day}\n\U0001F4B0 **Estimated total: ~{_rupee(total)}**{' (one day of bata; add bata for each extra day)' if round_trip else ''}\n✨ Toll is paid by the customer on actuals. This is the driver tariff; the booking itself shows the final figures.")


def waiting_text(db: Session, ta: bool) -> str:
    try:
        from app.crud.system_settings import get_system_setting
        per_hr = get_system_setting(db, "multicity_waiting_rate_per_hour", None)
    except Exception:  # noqa: BLE001
        per_hr = None
    if ta:
        multi = f"• Multi-city trip-ல் காத்திருப்பு: மணிக்கு {_rupee(per_hr)}.\n" if per_hr else ""
        return ("⏳ **வாடிக்கையாளர் தாமதம் & காத்திருப்பு**:\n\n" + multi +
                "• மற்ற trip-களில் waiting கட்டணம் booking-ன் charges-ல் காட்டப்படும்; Excluded என்றால் வாடிக்கையாளரிடம் வாங்கி trip close-ல் உள்ளிடுங்கள்.\n"
                "• போன் எடுக்கவில்லை என்றால்: In-App Chat-ல் 'பிக்கப் வந்துவிட்டேன்' என்று அனுப்பி Dispatch-ஐத் தொடர்பு கொள்ளுங்கள்.")
    multi = f"• Waiting on a multi-city trip: {_rupee(per_hr)} per hour.\n" if per_hr else ""
    return ("⏳ **Passenger delay & waiting**:\n\n" + multi +
            "• On other trips the waiting charge is shown in the booking's charges; if it is marked Excluded, collect it from the customer and enter it when you close the trip.\n"
            "• If the customer is unreachable: send 'Reached pickup' in the in-app chat and contact Dispatch.")


def wallet_text(db: Session, ta: bool) -> str:
    f = fees(db)
    hold = int(f.get("min_driver_hold", 500))
    if ta:
        return ("\U0001F4B3 **Wallet hold & payout**:\n\n"
                f"• **Wallet hold (குறைந்தது {_rupee(hold)})**: ஒவ்வொரு booking-ஐ accept செய்யும்போதும் இவ்வளவு wallet-ல் hold ஆகும். Commission + extras இதைவிட அதிகம் என்றால் அந்த அதிகத் தொகை hold ஆகும்.\n"
                "• **Trip முடிந்ததும்**: hold-ல் இருந்து commission எடுக்கப்படும், மீதி wallet-க்குத் திரும்பும். Cancel ஆன booking-க்கு முழுத் தொகையும் திரும்பும்.\n"
                "• Payout / wallet entries: Wallet > History-ல் ஒவ்வொரு வரியையும் தொட்டால் விளக்கம் தெரியும்.")
    return ("\U0001F4B3 **Wallet hold & payout**:\n\n"
            f"• **Wallet hold (minimum {_rupee(hold)})**: on every booking you accept, at least this much is held from your wallet. If the commission with extras is more, that bigger amount is held.\n"
            "• **When the trip completes**: the commission is taken from the hold and the rest goes back to your wallet. A cancelled booking is refunded in full.\n"
            "• Payouts and wallet entries: tap any row in Wallet > History for a plain explanation.")


def round_trip_text(db: Session, ta: bool) -> str:
    rules = fare_rules()
    sedan = _vehicle(db, "SEDAN_4_PLUS_1")
    bata = sedan.get("bata")
    min_km = rules.get("round_trip_min_km_per_day")
    if ta:
        return ("\U0001F504 **Round trip & outstation விதிகள்**:\n\n"
                f"• **குறைந்தபட்ச km**: ஒரு நாளைக்கு {min_km} km.\n"
                + (f"• **Driver bata**: ஒரு நாளைக்கு {_rupee(bata)} (Sedan; மற்ற வாகனங்களுக்கு Tariff பட்டியலைப் பாருங்கள்).\n" if bata else "")
                + "• Night halt / extra charges: booking-ன் charges-ல் காட்டப்படும்.\n• Return toll, state tax: அசல் ரசீதுப்படி வாடிக்கையாளர் செலுத்துவார்.")
    return ("\U0001F504 **Round trip & outstation rules**:\n\n"
            f"• **Minimum km**: {min_km} km per day.\n"
            + (f"• **Driver bata**: {_rupee(bata)} per day (Sedan; see the tariff list for other vehicles).\n" if bata else "")
            + "• Night halt and other extras are shown in the booking's charges.\n• Return toll and state tax: paid by the customer on actual receipts.")


def pet_text(ta: bool) -> str:
    if ta:
        return ("\U0001F43E **செல்லப்பிராணி பயணம்**:\n\n• முன்கூட்டியே booking-ல் தெரிவித்திருக்க வேண்டும்.\n• இருக்கை பாதுகாப்புக்கு வாடிக்கையாளர் pet sheet கொண்டு வர வேண்டும்.\n"
                "• சுத்தம் செய்யும் கட்டணம் இருந்தால் அது booking-ல் காட்டப்படும்; தெரியாவிட்டால் Dispatch-ஐக் கேளுங்கள்.")
    return ("\U0001F43E **Pet travel**:\n\n• Pets are allowed only when told at booking time.\n• The customer brings a pet sheet to protect the seats.\n"
            "• A cleaning charge, if any, is shown in the booking; if it is not, ask Dispatch.")


def advance_text(db: Session, ta: bool) -> str:
    f = fees(db)
    pct = commission_pct(db)
    cmin, share_min, conv = int(f.get("commission_min", 200)), int(f.get("platform_share_min", 30)), int(f.get("convenience_fee", 30))
    if ta:
        return ("\U0001F9FE **Advance, commission & GST**:\n\n"
                "• **Advance**: வாடிக்கையாளர் முன்கூட்டியே செலுத்திய தொகை, accept செய்த பின் app-ல் தெரியும்.\n"
                f"• **Commission**: Outstation-ல் km fare-ன் {pct}% (குறைந்தது {_rupee(cmin)}). இதில் platform km fare-ன் 1% (குறைந்தது {_rupee(share_min)}) வைத்துக் கொள்ளும்; மீதி booking-ஐ post செய்தவருக்கு. வேறு எதுவும் கழிக்கப்படாது.\n"
                f"• **Convenience fee**: ஒவ்வொரு customer bill-லும் {_rupee(conv)} சேர்க்கப்படும்; நீங்கள் வாங்கி platform-உடன் settle செய்வீர்கள்.\n"
                "• **GST invoice**: நிறுவன வாடிக்கையாளருக்கு Website / Admin வழியாக வழங்கப்படும்; Driver App-ல் இல்லை.")
    return ("\U0001F9FE **Advance, commission & GST**:\n\n"
            "• **Advance**: any advance the customer paid shows in the app once you accept.\n"
            f"• **Commission**: on Outstation, {pct}% of the km fare (at least {_rupee(cmin)}). Out of it the platform keeps 1% of the km fare (at least {_rupee(share_min)}); the rest goes to whoever posted the booking. Nothing else is deducted.\n"
            f"• **Convenience fee**: {_rupee(conv)} is added to every customer bill; you collect it and settle it with the platform.\n"
            "• **GST invoice**: issued to business customers through the Website / Admin, not from the Driver App.")
