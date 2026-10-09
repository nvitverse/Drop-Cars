"""Default terms, rules and policies for the brands' estimates and invoices, and the starter rate cards.

Two families: TAXI (Drop Cars and its sister taxi brands - pure taxi service) and TOURS (Arunachala Travels, Mukil Travels - tours and travels).
The wording is firm about what the customer must know (cancellation, refund, belongings, fare change) and gentle about liability: it states what
the company does (verified drivers, insured vehicles, 24x7 support) before it states the limits. Everything here is only the STARTING text - the
Owner edits it per brand in the Admin App (Invoices > Brands) and the document copies the brand text when it is issued."""
from typing import Any, Dict, List

TAXI_TERMS_INVOICE = "\n".join([
    "Charges shown under 'Not included' (toll, parking, state permit, hill / ghat charges and similar) are payable at actuals and are not part of the total above.",
    "Night driving allowance applies for driving between 10:00 PM and 5:00 AM. Waiting charges apply beyond the free waiting time agreed for the booking.",
    "Payment is due on completion of the trip unless a different date was agreed in writing. A receipt can be issued for every payment on request.",
    "Please report any billing question within 7 days of the trip on the phone number above and we will correct it promptly.",
    "This invoice is computer generated and is valid with the invoice number and the brand details printed on it.",
])
TAXI_TERMS_ESTIMATE = "\n".join([
    "This estimate is based on the details you gave us (route, dates, vehicle). The final fare is on the actual distance driven and the actual waiting, if these differ.",
    "The estimate is valid until the date shown. Rates can change after that because of fuel price, demand and vehicle availability.",
    "Your booking is confirmed only after the advance is received. The advance is adjusted in the final bill.",
    "Toll, parking, state permit and similar charges listed under 'Not included' are paid at actuals during the trip.",
    "Extra stops, a changed route or a changed pickup time can change the fare; we will tell you before the trip so there are no surprises.",
])
TAXI_RULES = "\n".join([
    "VEHICLE AND DRIVER: Every driver is verified with a valid driving licence, vehicle RC, insurance and fitness certificate before the trip is assigned. "
    "The driver's name and vehicle number are shared with you before pickup.",
    "VEHICLE CHANGE: We confirm a vehicle of the type you booked. If that exact model is not available at the last moment, we offer a similar or better vehicle of the same seating class.",
    "LAST-MINUTE AVAILABILITY: In rare cases (festival rush, heavy rain, a breakdown) a vehicle cannot be arranged at the quoted rate close to pickup time. "
    "Within 1 hour of pickup we may request a revised rate (for example Rs 16 or Rs 17 per km instead of Rs 15 per km) or ask you to pay the driver an agreed amount directly. "
    "You are free to accept, to choose another vehicle, or to cancel at no charge.",
    "CANCELLATION BY YOU: Free until a driver is assigned. After assignment the advance may be kept in part, up to the driver's reporting cost, according to how close the pickup time is. "
    "Cancel by phone or message as early as you can - it helps us release the vehicle to another customer.",
    "CANCELLATION BY US: If we cannot serve your booking we tell you as early as possible and refund the full advance within 5-7 working days to the source account.",
    "REFUNDS: Refunds are made to the original payment method within 5-7 working days after the cancellation is confirmed. Adjustments for unused services are made in the final bill.",
    "YOUR BELONGINGS: Please check the vehicle before you get down. Items left behind are kept safe and returned on request; the driver's return cost may be charged. "
    "Carry valuables and documents with you - the vehicle is not a storage space.",
    "SAFETY: Seat belts are to be worn. Smoking, alcohol and illegal items are not allowed. Our drivers follow speed limits and rest rules; please do not ask them to break traffic rules.",
    "DOCUMENTS: Carry a valid photo ID. For inter-state trips the state permit and tax are collected as per the invoice. Our drivers carry the vehicle papers and permit.",
    "OUR RESPONSIBILITY: We take every care to give you a safe, on-time trip and our support team is available throughout. "
    "Our liability is limited to the value of the trip fare, except where the law says otherwise. We are not liable for delays caused by traffic, weather, road closures or events beyond our control.",
    "FEEDBACK: Tell us if anything was not right - we answer every complaint within 24 hours on the phone number above.",
])

TOURS_TERMS_INVOICE = "\n".join([
    "Charges under 'Not included' (toll, parking, permit, entry tickets, guide fees, personal expenses) are payable at actuals and are not part of the total.",
    "Package prices are per vehicle for the itinerary and number of days shown. Extra days, extra kilometres and changes in the plan are charged at the rates agreed.",
    "Payment is due as agreed at booking. Please keep the payment reference for any future query.",
    "Report any billing query within 7 days of the trip on the phone number above.",
    "This invoice is computer generated.",
])
TOURS_TERMS_ESTIMATE = "\n".join([
    "This estimate / package quote is valid until the date shown. Prices depend on the dates, season, vehicle and number of travellers and can change after that.",
    "The booking is confirmed on receipt of the advance. The balance is due before the trip starts or as agreed in writing.",
    "What the package includes and does not include is listed in the quote. Anything not listed is extra and is paid at actuals.",
    "Festival days, school holidays and weekends are high-demand days; the quote already reflects the season, but a late change in dates can change the price.",
])
TOURS_RULES = "\n".join([
    "VEHICLE AND DRIVER: Verified drivers with valid licence, RC, insurance, permit and fitness certificate. Driver and vehicle details are shared before the trip.",
    "ROUTE AND PLAN: The route and timings can be adjusted on the way (traffic, weather, road closures) while keeping the stops agreed with you wherever possible.",
    "LAST-MINUTE AVAILABILITY: If the booked vehicle cannot be arranged at the last moment, we offer an equal or better vehicle; if that needs a higher rate we ask you first, "
    "within 1 hour of pickup, and you can accept, choose another option or cancel without charge.",
    "CANCELLATION: Free up to 7 days before the trip. 3-7 days before: up to 25% of the package may be kept. Within 72 hours: up to 50%. Within 24 hours or no-show: the advance may be kept. "
    "Cancel early and we will do our best to refund more.",
    "REFUNDS: Made to the original payment method within 7 working days after the cancellation is confirmed.",
    "STAY AND TICKETS: Hotel, entry ticket and guide charges are included only where the package says so. Third-party bookings follow that provider's own cancellation rules.",
    "YOUR BELONGINGS: Please keep valuables and documents with you. Items left in the vehicle are kept safe and returned on request.",
    "SAFETY AND CONDUCT: Seat belts on; no smoking or alcohol in the vehicle; please respect local rules at every place you visit. Elders and children travel in their guardians' care.",
    "OUR RESPONSIBILITY: We arrange safe, comfortable travel and stay in touch throughout the trip. Our liability is limited to the package value except where the law says otherwise; "
    "we are not liable for delays or changes caused by weather, traffic, closures, strikes or other events beyond our control.",
    "FEEDBACK: Tell us during the trip if anything is not right so that we can fix it on the spot. We answer every complaint within 24 hours.",
])

TOURS_BRANDS = ("arunachala", "mukiltravels")


def family(code: str) -> str:
    return "TOURS" if (code or "").lower() in TOURS_BRANDS else "TAXI"


def defaults_for(code: str) -> Dict[str, str]:
    if family(code) == "TOURS":
        return {"terms_invoice": TOURS_TERMS_INVOICE, "terms_estimate": TOURS_TERMS_ESTIMATE, "rules_text": TOURS_RULES}
    return {"terms_invoice": TAXI_TERMS_INVOICE, "terms_estimate": TAXI_TERMS_ESTIMATE, "rules_text": TAXI_RULES}


# the older, shorter seeded texts - a brand still holding exactly one of these has never been edited, so it is safe to upgrade it
OLD_SEEDED = {
    "Toll, parking and state permit charges are billed at actuals unless they are shown as included in this invoice.",
    "This estimate is based on the details given and is valid until the date shown. Final fare is as per the actual distance driven.",
    "Minimum billable distance applies as per the trip type (one way / round trip / multi city).",
}


def is_old_seed(text: str) -> bool:
    first = (text or "").strip().split("\n")[0].strip()
    return first in OLD_SEEDED


# ---------------------------------------------------------------- Arunachala Travels starter rate cards (copied from its website fareEngine.js)
_ARUN_CAR = [
    # key, name, baseFare, coverage, minChargeable, startRate, roundRate, minRoundPerDay, allowance, local {5,8,12}, local km limits
    ("sedan", "Sedan (Dzire / Etios)", 1500, 50, 50, 11.5, 12.5, 250, 400, (1400, 2000, 2800)),
    ("suv", "SUV / Ertiga", 2000, 50, 50, 12.5, 17.0, 250, 400, (2000, 2800, 3800)),
    ("innova", "Innova", 2500, 50, 50, 13.5, 18.0, 250, 500, (2400, 3400, 4500)),
    ("crysta", "Innova Crysta", 3500, 50, 50, 15.0, 21.0, 250, 600, (2800, 4000, 5200)),
    ("tempo12", "Tempo Traveller 12+1 AC", 4000, 50, 100, 22.0, 26.0, 300, 800, None),
    ("tempo17", "Tempo Traveller 17 Seater", 4500, 50, 100, 25.0, 28.0, 300, 800, None),
    ("tourister", "Mahindra Tourister", 3500, 50, 100, 20.0, 23.0, 300, 800, None),
]


def arunachala_rate_cards() -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    order = 0
    for key, name, base, cov, minc, start, rnd, minday, allow, local in _ARUN_CAR:
        order += 1
        slab = {"base_fare": base, "base_coverage_km": cov, "min_chargeable_km": minc, "start_rate": start, "increment_by": 1.0, "increment_every_km": 200, "max_increments": None}
        out.append({"method": "SLAB_DROP", "vehicle_key": key, "vehicle_name": name, "name": f"{name} - drop trip", "params": slab, "sort_order": order * 10})
        out.append({"method": "SLAB_ROUND", "vehicle_key": key, "vehicle_name": name, "name": f"{name} - round trip",
                    "params": {"round_rate": rnd, "min_km_per_day": minday, "driver_allowance": allow, "increment_by": 1.0, "increment_every_km": 200, "max_increments": None},
                    "sort_order": order * 10 + 1})
        if local:
            out.append({"method": "LOCAL", "vehicle_key": key, "vehicle_name": name, "name": f"{name} - local packages",
                        "params": {"packages": {"5hrs": local[0], "8hrs": local[1], "12hrs": local[2]}, "km_limit_by_package": {"5hrs": 50, "8hrs": 80, "12hrs": 120}},
                        "sort_order": order * 10 + 2})
    return out


def dropcars_rate_cards() -> List[Dict[str, Any]]:
    """Starter Drop Cars entries. The km rates are placeholders the Owner edits - the real booking rates are read from the vehicle tariff when a booking id is entered."""
    return [
        {"method": "KM_BATA", "vehicle_key": "sedan", "vehicle_name": "Sedan", "name": "Sedan - km fare + bata", "params": {"rate_per_km": 12, "bata_per_day": 300}, "sort_order": 10},
        {"method": "KM_BATA", "vehicle_key": "suv", "vehicle_name": "SUV / Ertiga", "name": "SUV - km fare + bata", "params": {"rate_per_km": 16, "bata_per_day": 400}, "sort_order": 20},
        {"method": "KM_BATA", "vehicle_key": "innova", "vehicle_name": "Innova", "name": "Innova - km fare + bata", "params": {"rate_per_km": 18, "bata_per_day": 500}, "sort_order": 30},
        {"method": "DAY_RENT", "vehicle_key": "sedan", "vehicle_name": "Sedan", "name": "Sedan - day rent with km limit",
         "params": {"rent_per_day": 2200, "km_limit_per_day": 250, "extra_km_rate": 12, "fuel_per_km": 0, "fuel_applies": "ALL"}, "sort_order": 40},
        {"method": "DAY_RENT", "vehicle_key": "suv", "vehicle_name": "SUV / Ertiga", "name": "SUV - day rent with km limit",
         "params": {"rent_per_day": 3200, "km_limit_per_day": 250, "extra_km_rate": 16, "fuel_per_km": 0, "fuel_applies": "ALL"}, "sort_order": 50},
    ]


def arunachala_packages() -> List[Dict[str, Any]]:
    """Tours & travels packages the Admin App can edit (itinerary, inclusions, exclusions). Amounts are placeholders until the Owner sets them."""
    return [
        {"method": "PACKAGE", "vehicle_key": "tour", "vehicle_name": "Package", "name": "Tiruvannamalai Girivalam weekend", "sort_order": 900,
         "params": {"amount": 0, "days": 2, "itinerary": ["Pickup and drive to Tiruvannamalai", "Arunachaleswarar temple darshan", "Girivalam (14 km)", "Return drive"],
                    "includes": ["AC vehicle", "driver bata", "toll", "parking", "fuel"], "excludes": ["Hotel", "food", "temple special darshan tickets"]}},
        {"method": "PACKAGE", "vehicle_key": "tour", "vehicle_name": "Package", "name": "Pondicherry - Mahabalipuram 2 days", "sort_order": 910,
         "params": {"amount": 0, "days": 2, "itinerary": ["Pickup", "Pondicherry beach and Auroville", "Night stay (not included)", "Mahabalipuram shore temple", "Drop"],
                    "includes": ["AC vehicle", "driver bata", "toll", "parking", "fuel"], "excludes": ["Hotel", "food", "entry tickets"]}},
    ]


# ---------------------------------------------------------------- the look of each brand: tagline under the name, header highlights, bottom slogan
# Only the STARTING text. The Owner edits all of it in the Admin App (Invoices > Brands > Details) and it prints exactly as typed.
LOOK = {
    "dropcars": ("Your Trusted One-Way Drop Taxi Service", "Safe journeys. Honest fares. Every single time.",
                 "Verified drivers\nTransparent fares\n24x7 support\nClean, well-maintained cabs"),
    "24droptaxi": ("One-Way & Outstation Cabs, Made Easy", "Book once. Reach on time.",
                   "Pay only for the distance\nVerified drivers\n24x7 support"),
    "tatataxi": ("Your Reliable Outstation Cab Partner", "Travel far. Travel with confidence.",
                 "Experienced drivers\nWell-kept fleet\nClear, upfront pricing"),
    "tatacalltaxi": ("City & Outstation Cabs, One Call Away", "One call. One cab. Right on time.",
                     "Quick pickups\nVerified drivers\n24x7 support"),
    "mukiltravels": ("Tour & Travel Packages, Planned with Care", "Good places are better with good company.",
                     "Customised tour packages\nFamily-friendly vehicles\nExperienced drivers"),
    "yellowboard": ("Commercial Fleet Cabs You Can Count On", "Dependable rides. Every day.",
                    "Commercial permit vehicles\nProfessional drivers\nOn-time service"),
    "arunachala": ("Dedicated to Spiritual Journeys", "Your journey to the sacred begins here.",
                   "Tempo Traveller & Force Urbania specialists\nExperienced drivers\nClear, upfront pricing\nComfortable family travel"),
}
OLD_TAGLINES = {
    "dropcars": ("Standard & Premium Taxis",), "24droptaxi": ("One Way & Outstation Cabs",), "tatataxi": ("Reliable Outstation Fleet",),
    "tatacalltaxi": ("City & Outstation Cabs",), "mukiltravels": ("Versatile Tour & Travel Packages",), "yellowboard": ("Commercial Fleet Cabs",),
    "arunachala": ("Tempo Traveller & Force Urbania Specialist",),
}
OLD_SLOGANS = ("Thank you for travelling with us.",)

# the standard "what's included / not included" lines every estimate shows (Title | note | keywords that hide the item when the bill already has such a charge)
STD_INCLUDES = "\n".join([
    "Fuel & vehicle maintenance",
    "Verified, professional driver",
    "Clean, well-maintained vehicle",
])
STD_EXCLUDES = "\n".join([
    "Parking charges | Actuals, paid at the venue | parking",
    "Waiting charges | Extra after the free waiting time | waiting",
    "Night driving allowance | 10 PM to 5 AM, unless shown above | night",
    "Toll & state permit | Paid on actuals unless shown above | toll,permit",
])
OLD_HIGHLIGHTS = ("Temple tours & Girivalam trips\nTempo Traveller & Force Urbania specialists\nExperienced local drivers\nComfortable family travel",)

# the brand's own look, taken from its website's design system (arunachalatravels.com): ember orange, gold, warm cream, serif display type
STYLE = {
    "arunachala": {"primary": "#C24A1E", "secondary": "#C8A45A", "font": "SERIF", "old_primary": "#8B5CF6"},
}

_NEUTRAL_SWAPS = (
    ("The plan can be adjusted on the way (traffic, weather, temple timings, road closures) while keeping the places promised wherever possible.",
     "The route and timings can be adjusted on the way (traffic, weather, road closures) while keeping the stops agreed with you wherever possible."),
    ("ITINERARY:", "ROUTE AND PLAN:"),
    ("please respect temple, forest and local rules. Elders and children travel with us at their guardians' care.",
     "please respect local rules at every place you visit. Elders and children travel in their guardians' care."),
)


def neutral_tours_text(text: str) -> str:
    """The first tours wording mentioned temples; the estimate is for vehicle trips, so swap those phrases (only where they are still the seeded words)."""
    for old, new in _NEUTRAL_SWAPS:
        text = text.replace(old, new)
    return text


def look_for(code: str) -> Dict[str, str]:
    t, s, h = LOOK.get((code or "").lower(), ("", "Thank you for travelling with us.", ""))
    return {"tagline": t, "slogan": s, "highlights": h}
