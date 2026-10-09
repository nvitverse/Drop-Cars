"""Pricing rules for estimates: state-wise, location-wise, route-wise, hill-wise ... Staff define them in the Admin App; for a trip the editor asks
`suggest()` which rules fit and the staff applies the ones they want. Nothing here changes a price on its own unless a rule has auto_apply on.

Examples (all editable, none hard-coded):
  Karnataka round trip needs 300 km minimum per day          -> scope STATE, keywords [karnataka], effect MIN_KM_PER_DAY 300, trip_types [round]
  Rs 1 more per km on the Bengaluru side                     -> scope LOCATION, keywords [bengaluru|bangalore], effect RATE_DELTA +1
  Rs 1 less per km on Chennai - Madurai                      -> scope ROUTE, route_from [chennai], route_to [madurai], effect RATE_DELTA -1
  Hill charges: Rs 300 one way per hill, Rs 500 round trip a day -> scope HILL, effect HILL_CHARGE (Ooty to Kodaikanal = 2 hills = Rs 600)"""
import re
import uuid
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.billing import BillingRule

SCOPES = ("STATE", "LOCATION", "ROUTE", "HILL", "ALL")
EFFECTS = ("MIN_KM_PER_DAY", "MIN_KM_ONEWAY", "RATE_DELTA", "BATA_DELTA", "CHARGE", "HILL_CHARGE", "PERCENT")
EFFECT_LABELS = {
    "MIN_KM_PER_DAY": "Minimum km per day (round / multi-city)", "MIN_KM_ONEWAY": "Minimum km for a one-way trip", "RATE_DELTA": "Rate per km: add / reduce (Rs)",
    "BATA_DELTA": "Driver bata per day: add / reduce (Rs)", "CHARGE": "Extra charge line", "HILL_CHARGE": "Hill charges (per hill, one way / round trip)",
    "PERCENT": "Surcharge / discount % on the fare",
}
MATCH_ON = ("ANY", "PICKUP", "DROP", "BOTH")

# a few well-known hill stations as the starting list of the hill rule - the Owner edits it freely
STARTER_HILLS = ["ooty|udhagamandalam|udhagai", "kodaikanal|kodai", "yercaud", "valparai", "munnar", "yelagiri", "kolli hills|kolli malai", "coonoor", "kotagiri",
                 "topslip", "masinagudi", "thekkady", "wayanad", "coorg|madikeri", "yelagiri hills"]


def _list(v: Any) -> List[str]:
    if v is None:
        return []
    if isinstance(v, str):
        v = re.split(r"[,\n;]+", v)
    return [str(x).strip() for x in v if str(x).strip()]


def _norm(s: Any) -> str:
    return re.sub(r"\s+", " ", str(s or "").lower()).strip()


def trip_kind(trip_type: Any) -> str:
    t = _norm(trip_type)
    if "round" in t:
        return "round"
    if "multi" in t or "multy" in t:
        return "multicity"
    return "oneway"


def rule_dict(r: BillingRule) -> Dict[str, Any]:
    return {
        "id": str(r.id), "brand_id": str(r.brand_id) if r.brand_id else None, "name": r.name, "scope": r.scope, "keywords": r.keywords or [],
        "route_from": r.route_from or [], "route_to": r.route_to or [], "match_on": r.match_on, "effect": r.effect, "effect_label": EFFECT_LABELS.get(r.effect, r.effect),
        "value": r.value, "label": r.label, "params": r.params or {}, "trip_types": r.trip_types or [], "vehicles": r.vehicles or [],
        "valid_from": r.valid_from.isoformat() if r.valid_from else None, "valid_to": r.valid_to.isoformat() if r.valid_to else None,
        "auto_apply": bool(r.auto_apply), "is_active": bool(r.is_active), "priority": r.priority, "note": r.note, "created_by": r.created_by,
    }


def _date(v: Any) -> Optional[date]:
    if not v:
        return None
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError:
        raise HTTPException(status_code=422, detail="Dates must be YYYY-MM-DD")


def save_rule(db: Session, p: Dict[str, Any], who: str, rule: Optional[BillingRule] = None) -> BillingRule:
    r = rule or BillingRule(created_by=who, name="", effect="CHARGE")
    if "name" in p:
        r.name = (p.get("name") or "").strip()
    if not r.name:
        raise HTTPException(status_code=422, detail="Give the rule a name")
    if "scope" in p:
        sc = str(p.get("scope") or "LOCATION").upper()
        if sc not in SCOPES:
            raise HTTPException(status_code=422, detail="Choose State, Location, Route, Hill or All")
        r.scope = sc
    if "effect" in p:
        ef = str(p.get("effect") or "").upper()
        if ef not in EFFECTS:
            raise HTTPException(status_code=422, detail="Choose what the rule does")
        r.effect = ef
    if "brand_id" in p:
        r.brand_id = uuid.UUID(str(p["brand_id"])) if p.get("brand_id") else None
    for k in ("keywords", "route_from", "route_to", "trip_types", "vehicles"):
        if k in p:
            setattr(r, k, [_norm(x) for x in _list(p.get(k))])
    if "match_on" in p:
        m = str(p.get("match_on") or "ANY").upper()
        r.match_on = m if m in MATCH_ON else "ANY"
    if "value" in p:
        r.value = float(p["value"]) if p.get("value") not in (None, "") else None
    for k in ("label", "note"):
        if k in p:
            setattr(r, k, (p.get(k) or "").strip() or None)
    if "params" in p:
        r.params = p.get("params") or {}
    if "valid_from" in p:
        r.valid_from = _date(p.get("valid_from"))
    if "valid_to" in p:
        r.valid_to = _date(p.get("valid_to"))
    for k in ("auto_apply", "is_active"):
        if k in p:
            setattr(r, k, bool(p[k]))
    if "priority" in p and p.get("priority") not in (None, ""):
        r.priority = int(p["priority"])
    if r.scope == "ROUTE" and not (r.route_from and r.route_to):
        raise HTTPException(status_code=422, detail="A route rule needs both a From place and a To place")
    if r.scope in ("STATE", "LOCATION", "HILL") and not r.keywords:
        raise HTTPException(status_code=422, detail="Add at least one place / state word to match")
    if r.effect in ("MIN_KM_PER_DAY", "MIN_KM_ONEWAY", "RATE_DELTA", "BATA_DELTA", "PERCENT", "CHARGE") and r.value is None:
        raise HTTPException(status_code=422, detail="Enter the value for this rule")
    if r.effect == "HILL_CHARGE" and not ((r.params or {}).get("one_way") or (r.params or {}).get("round_amount")):
        raise HTTPException(status_code=422, detail="Enter the hill charge for one way and / or for a round trip day")
    if rule is None:
        db.add(r)
    db.commit()
    db.refresh(r)
    return r


def list_rules(db: Session, brand_id: Optional[str] = None, include_inactive: bool = False) -> List[BillingRule]:
    q = db.query(BillingRule)
    if brand_id:
        q = q.filter(or_(BillingRule.brand_id.is_(None), BillingRule.brand_id == uuid.UUID(str(brand_id))))
    if not include_inactive:
        q = q.filter(BillingRule.is_active.is_(True))
    return q.order_by(BillingRule.priority, BillingRule.name).all()


# ---------------------------------------------------------------- matching
def _hits(words: List[str], texts: List[str]) -> List[str]:
    """Which of the keyword entries ('ooty|udhagamandalam') appear in any of the texts. One entry counts once however many aliases match."""
    found = []
    for entry in words:
        aliases = [a.strip() for a in _norm(entry).split("|") if a.strip()]
        if any(a and re.search(r"(?<![a-z])" + re.escape(a) + r"(?![a-z])", t) for a in aliases for t in texts):
            found.append(aliases[0])
    return found


def _matches(r: BillingRule, ctx: Dict[str, Any]) -> Optional[List[str]]:
    """The words that made the rule match, or None if it does not fit the trip."""
    if r.valid_from or r.valid_to:
        on = _date(ctx.get("on_date")) or date.today()
        if (r.valid_from and on < r.valid_from) or (r.valid_to and on > r.valid_to):
            return None
    if r.trip_types and not any(ctx["kind"] in t or t in ctx["kind"] for t in [_norm(x) for x in r.trip_types]):
        return None
    if r.vehicles:
        vtxt = _norm(ctx.get("vehicle"))
        if not any(_norm(v) in vtxt for v in r.vehicles) or not vtxt:
            return None
    pick, drop, stops = ctx["pickup"], ctx["drop"], ctx["stops"]
    if r.scope == "ALL":
        return ["all trips"]
    if r.scope == "ROUTE":
        a, b = r.route_from or [], r.route_to or []
        fwd = _hits(a, [pick]) and _hits(b, [drop])
        rev = _hits(a, [drop]) and _hits(b, [pick])
        return (_hits(a, [pick]) + _hits(b, [drop])) if fwd else ((_hits(a, [drop]) + _hits(b, [pick])) if rev else None)
    words = r.keywords or []
    if r.match_on == "PICKUP":
        h = _hits(words, [pick])
    elif r.match_on == "DROP":
        h = _hits(words, [drop])
    elif r.match_on == "BOTH":
        hp, hd = _hits(words, [pick]), _hits(words, [drop])
        h = (hp + hd) if hp and hd else []
    else:
        h = _hits(words, stops)
    return h or None


def _rs(n: float) -> str:
    return f"Rs {int(round(n)):,}"


def suggest(db: Session, ctx_in: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Rules that fit this trip, each with what it would do. ctx: brand_id, pickup, drop, via[], texts[], trip_type, days, km, vehicle, on_date, fare_total."""
    pickup, drop = _norm(ctx_in.get("pickup")), _norm(ctx_in.get("drop"))
    via = [_norm(x) for x in _list(ctx_in.get("via"))]
    extra = [_norm(x) for x in _list(ctx_in.get("texts"))]
    ctx = {"pickup": pickup, "drop": drop, "stops": [t for t in [pickup, drop] + via + extra if t], "kind": trip_kind(ctx_in.get("trip_type")),
           "vehicle": ctx_in.get("vehicle"), "on_date": ctx_in.get("on_date")}
    days = max(1, int(ctx_in.get("days") or 1))
    fare_total = float(ctx_in.get("fare_total") or 0)
    out: List[Dict[str, Any]] = []
    for r in list_rules(db, ctx_in.get("brand_id")):
        hit = _matches(r, ctx)
        if hit is None:
            continue
        item: Dict[str, Any] = {"rule": rule_dict(r), "matched": hit, "auto_apply": bool(r.auto_apply)}
        v = float(r.value or 0)
        p = r.params or {}
        k = ctx["kind"]
        if r.effect == "MIN_KM_PER_DAY":
            if k == "oneway":
                continue
            item.update(kind="ADJUST", adjust={"min_km_per_day": v}, summary=f"Minimum {int(v)} km per day")
        elif r.effect == "MIN_KM_ONEWAY":
            if k != "oneway":
                continue
            item.update(kind="ADJUST", adjust={"min_km_oneway": v}, summary=f"Minimum {int(v)} km")
        elif r.effect == "RATE_DELTA":
            item.update(kind="ADJUST", adjust={"rate_delta": v}, summary=f"{'+' if v >= 0 else '-'}{_rs(abs(v))} per km")
        elif r.effect == "BATA_DELTA":
            item.update(kind="ADJUST", adjust={"bata_delta": v}, summary=f"{'+' if v >= 0 else '-'}{_rs(abs(v))} driver bata per day")
        elif r.effect == "HILL_CHARGE":
            hills = len(hit)
            one_way, round_amt = float(p.get("one_way") or 0), float(p.get("round_amount") or 0)
            if k == "round" or k == "multicity":
                basis = str(p.get("round_basis") or "DAY").upper()
                times = days * (hills if basis == "HILL_DAY" else 1)
                amt = round_amt * times
                detail = f"{_rs(round_amt)} x {days} day{'s' if days > 1 else ''}" + (f" x {hills} hills" if basis == "HILL_DAY" else "")
            else:
                amt = one_way * hills
                detail = f"{hills} hill{'s' if hills > 1 else ''} x {_rs(one_way)}"
            if amt <= 0:
                continue
            names = ", ".join(x.title() for x in hit)
            item.update(kind="CHARGE", line={"label": f"{r.label or 'Hill charges'} ({names}) {detail}", "amount": int(round(amt)), "kind": "CHARGE", "included": True},
                        summary=f"Hill charges {_rs(amt)} - {names}")
        elif r.effect == "CHARGE":
            basis = str(p.get("basis") or "TRIP").upper()
            mult = days if basis == "DAY" else (len(hit) if basis == "MATCH" else 1)
            amt = v * mult
            if amt == 0:
                continue
            note = f" x {mult}" if mult > 1 else ""
            item.update(kind="CHARGE", line={"label": f"{r.label or r.name}{note}", "amount": int(round(amt)), "kind": "CHARGE", "included": p.get("included") is not False},
                        summary=f"{r.label or r.name} {_rs(amt)}")
        elif r.effect == "PERCENT":
            amt = fare_total * v / 100
            item.update(kind="CHARGE", line={"label": f"{r.label or r.name} ({v:g}%)", "amount": int(round(amt)), "kind": "CHARGE", "included": True} if v >= 0 else None,
                        summary=f"{r.label or r.name} {v:g}% of the fare" + (f" = {_rs(amt)}" if fare_total else ""))
            if v < 0:
                item.update(kind="ADJUST", adjust={"discount": int(round(abs(amt)))}, line=None)
        else:
            continue
        out.append(item)
    return out


def merge_adjust(items: List[Dict[str, Any]]) -> Dict[str, float]:
    """Combine the adjustments of several applied rules: minimums take the highest, deltas add up."""
    adj: Dict[str, float] = {}
    for it in items:
        for k, v in (it.get("adjust") or {}).items():
            if k in ("min_km_per_day", "min_km_oneway"):
                adj[k] = max(adj.get(k, 0), v)
            else:
                adj[k] = adj.get(k, 0) + v
    return adj


# ---------------------------------------------------------------- starter rules (suggest-only)
def seed_starter_rules(db: Session) -> int:
    if db.query(BillingRule.id).first() is not None:
        return 0
    db.add_all([
        BillingRule(name="Hill charges", scope="HILL", keywords=STARTER_HILLS, effect="HILL_CHARGE", label="Hill charges", match_on="ANY", priority=10,
                    params={"one_way": 300, "round_amount": 500, "round_basis": "DAY"},
                    note="Rs 300 per hill for a one-way trip (Ooty to Kodaikanal = 2 hills = Rs 600). Rs 500 per day for a round trip."),
        BillingRule(name="Karnataka round trip minimum", scope="STATE", keywords=["karnataka", "bengaluru|bangalore", "mysuru|mysore", "mangaluru|mangalore", "hubli"],
                    effect="MIN_KM_PER_DAY", value=300, trip_types=["round", "multicity"], priority=20,
                    note="Round trips in Karnataka are billed for at least 300 km a day. Edit the places and the km as needed."),
    ])
    db.commit()
    return 2
