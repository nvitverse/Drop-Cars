"""
Razorpay charges Drop Cars a fee (2% + 18% GST on that fee, ~2.36% effective)
that used to be silently absorbed - the platform received less than the
amount it actually needed. This grosses up what the PAYER is charged so the
platform always nets the exact amount it asked for; Razorpay's cut comes out
of the markup, not out of Drop Cars' revenue.

Manual UPI/QR payments bypass Razorpay entirely and are never grossed up.
"""
from typing import Optional
from sqlalchemy.orm import Session

from app.models.platform_setting import PlatformSetting

DEFAULTS = {
    "razorpay_fee_percent": "2",
    "razorpay_gst_percent": "18",  # GST on the fee itself, not on the base amount
}


def _get_raw(db: Session, key: str) -> Optional[str]:
    row = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
    return row.value if row else DEFAULTS.get(key)


def get_razorpay_fee_rates(db: Session) -> dict:
    fee_percent = float(_get_raw(db, "razorpay_fee_percent") or 2)
    gst_percent = float(_get_raw(db, "razorpay_gst_percent") or 18)
    # Effective multiplier: base + (base * fee%) + (base * fee% * gst%)
    effective_rate = (fee_percent / 100) * (1 + gst_percent / 100)
    return {
        "fee_percent": fee_percent,
        "gst_percent": gst_percent,
        "effective_rate": effective_rate,
    }


def gross_up(db: Session, net_amount_rupees: float) -> dict:
    """What the payer must be charged so `net_amount_rupees` still lands net
    of Razorpay's fee + GST on that fee. Returns whole-rupee amounts (paise
    rounding is handled by the Razorpay client itself)."""
    rates = get_razorpay_fee_rates(db)
    fee = round(net_amount_rupees * rates["fee_percent"] / 100, 2)
    gst = round(fee * rates["gst_percent"] / 100, 2)
    payable = round(net_amount_rupees + fee + gst, 2)
    return {
        "base_amount": round(net_amount_rupees, 2),
        "fee": fee,
        "gst": gst,
        "payable_amount": payable,
        "fee_percent": rates["fee_percent"],
        "gst_percent": rates["gst_percent"],
    }


def net_from_charged(db: Session, charged_amount_rupees: float) -> float:
    """Reverse of gross_up: given what was actually charged (e.g. read back
    from a captured Razorpay transaction), what net amount should be
    credited/recognized. Assumes the fee rate hasn't changed between order
    creation and payment capture (a platform_settings value, not something
    that moves mid-checkout)."""
    rates = get_razorpay_fee_rates(db)
    return round(charged_amount_rupees / (1 + rates["effective_rate"]), 2)
