"""Driver tariff: what the DRIVER is paid, separate from what the customer pays (owner, 2026-10-02).

A website booking is posted with the DRIVER fare; whatever is left of the customer's price goes to the "extra" fields:

    per km        driver km rate      | extra km rate     = customer rate - driver rate
    bata          driver bata (300)   | extra bata        = customer bata - driver bata
    permit        driver permit       | extra permit      = customer permit - driver permit

so the Driver / Vendor app shows e.g. "15 | 0", "300 | 100", "400 | 0", and driver + extra always add up to what the customer agreed.
Nothing is ever taken from the driver below what the tariff says, and the driver is never shown more than the customer pays.

Stored as ONE platform setting (`driver_tariff`, JSON), edited from Admin App > Tariffs > Driver:
  vehicles  {car_type: {km_rate, bata}}   km_rate blank = the same as the customer's rate (extra 0); bata default 300
  permits   [{label, keywords, vehicles, driver}]   first matching rule wins. A rule matches when the vehicle is listed (or "*") and
            any stop AFTER the pickup contains one of the keywords (e.g. Pondicherry / Puducherry); the keyword * means any place. No rule = the driver gets the
            customer's permit amount (extra 0).
"""
import json
import logging
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.platform_setting import PlatformSetting

logger = logging.getLogger(__name__)

SETTING_KEY = "driver_tariff"
DEFAULT_BATA = 300
MAX_RULES = 60

# Region keywords offered as a starting point in the editor (the owner edits / adds more)
SUGGESTED_REGIONS = {
    "Pondicherry": ["pondicherry", "puducherry", "pondy"],
    "Andhra Pradesh": ["andhra", "tirupati", "nellore", "vijayawada", "visakhapatnam", "vizag", "chittoor", "kadapa", "ongole", "guntur"],
    "Kerala": ["kerala", "kochi", "cochin", "trivandrum", "thiruvananthapuram", "kozhikode", "calicut", "thrissur", "munnar"],
    "Karnataka": ["karnataka", "bangalore", "bengaluru", "mysore", "mysuru", "mangalore", "hosur"],
}


def default_config() -> Dict[str, Any]:
    from app.models.new_orders import CarTypeEnum
    return {"vehicles": {c.value: {"km_rate": None, "bata": DEFAULT_BATA} for c in CarTypeEnum}, "permits": []}


def _int(v: Any, lo: int, hi: int, field: str, allow_none: bool = False) -> Optional[int]:
    if v in (None, "") and allow_none:
        return None
    try:
        n = int(round(float(v)))
    except (TypeError, ValueError):
        raise ValueError(f"{field} must be a number")
    if not lo <= n <= hi:
        raise ValueError(f"{field} must be between {lo} and {hi}")
    return n


def validate(cfg: Dict[str, Any]) -> Dict[str, Any]:
    """Clean + check an edited tariff. Raises ValueError with a message the admin can read."""
    from app.models.new_orders import CarTypeEnum
    valid_types = {c.value for c in CarTypeEnum}
    out = default_config()
    for car, row in (cfg.get("vehicles") or {}).items():
        if car not in valid_types:
            raise ValueError(f"Unknown vehicle {car}")
        row = row or {}
        out["vehicles"][car] = {"km_rate": _int(row.get("km_rate"), 1, 200, f"{car} km rate", True),
                                "bata": _int(row.get("bata", DEFAULT_BATA), 0, 5000, f"{car} bata")}
    rules = cfg.get("permits") or []
    if len(rules) > MAX_RULES:
        raise ValueError(f"At most {MAX_RULES} permit rules")
    for i, r in enumerate(rules, 1):
        label = str(r.get("label") or "").strip()[:40]
        kws = [str(k).strip().lower() for k in (r.get("keywords") or []) if str(k).strip()]
        if not label or not kws or len(kws) > 25 or any(len(k) > 40 for k in kws):
            raise ValueError(f"Permit rule {i}: needs a name and at least one place name (max 25)")
        vehicles = [str(v) for v in (r.get("vehicles") or ["*"])] or ["*"]
        if any(v != "*" and v not in valid_types for v in vehicles):
            raise ValueError(f"Permit rule {i}: unknown vehicle")
        out["permits"].append({"label": label, "keywords": kws, "vehicles": vehicles, "driver": _int(r.get("driver"), 0, 20000, f"Permit rule {i} driver amount")})
    return out


def load(db: Session) -> Dict[str, Any]:
    cfg = default_config()
    try:
        row = db.query(PlatformSetting).filter(PlatformSetting.key == SETTING_KEY).first()
        if row and row.value:
            saved = json.loads(row.value)
            cfg["vehicles"].update({k: v for k, v in (saved.get("vehicles") or {}).items() if k in cfg["vehicles"]})
            cfg["permits"] = saved.get("permits") or []
    except Exception as e:  # noqa: BLE001
        db.rollback()
        logger.warning("driver tariff unreadable, using defaults: %s", type(e).__name__)
    return cfg


def save(db: Session, cfg: Dict[str, Any]) -> Dict[str, Any]:
    clean = validate(cfg)
    row = db.query(PlatformSetting).filter(PlatformSetting.key == SETTING_KEY).first()
    if row:
        row.value = json.dumps(clean)
    else:
        db.add(PlatformSetting(key=SETTING_KEY, value=json.dumps(clean)))
    db.commit()
    return clean


def _stops_after_pickup(pickup_drop_location: Any) -> str:
    loc = pickup_drop_location if isinstance(pickup_drop_location, dict) else {}
    try:
        keys = sorted(loc.keys(), key=lambda k: int(k))
    except Exception:  # noqa: BLE001
        keys = list(loc.keys())
    return " | ".join(str(loc[k]) for k in keys[1:]).lower()


def permit_rule_for(cfg: Dict[str, Any], car_type: str, pickup_drop_location: Any) -> Optional[Dict[str, Any]]:
    stops = _stops_after_pickup(pickup_drop_location)
    for r in cfg.get("permits") or []:
        if ("*" in r["vehicles"] or car_type in r["vehicles"]) and ("*" in r["keywords"] or any(k in stops for k in r["keywords"])):
            return r
    return None


def split_fare(cfg: Dict[str, Any], *, car_type: str, pickup_drop_location: Any, customer_km_rate: int, customer_bata: int, customer_permit: int) -> Dict[str, Any]:
    """The DRIVER part and the EXTRA part of each fare component. driver + extra == what the customer pays, driver <= customer."""
    veh = (cfg.get("vehicles") or {}).get(car_type) or {}
    km_rate = veh.get("km_rate")
    drv_km = min(int(km_rate), customer_km_rate) if km_rate else customer_km_rate
    bata_cfg = veh.get("bata")
    drv_bata = min(int(DEFAULT_BATA if bata_cfg is None else bata_cfg), customer_bata)
    rule = permit_rule_for(cfg, car_type, pickup_drop_location)
    drv_permit = min(int(rule["driver"]), customer_permit) if rule else customer_permit
    return {
        "cost_per_km": drv_km, "extra_cost_per_km": customer_km_rate - drv_km,
        "driver_allowance": drv_bata, "extra_driver_allowance": customer_bata - drv_bata,
        "permit_charges": drv_permit, "extra_permit_charges": customer_permit - drv_permit,
        "permit_rule": rule["label"] if rule else None,
    }
