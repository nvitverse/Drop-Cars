import os
import hmac
import hashlib
from typing import Optional, Dict, Any

import requests


class RazorpayClient:
    def __init__(self,
                 key_id: Optional[str] = None,
                 key_secret: Optional[str] = None):
        self.key_id = key_id or os.getenv("RAZORPAY_KEY_ID", "")
        self.key_secret = key_secret or os.getenv("RAZORPAY_KEY_SECRET", "")
        self.base_url = "https://api.razorpay.com/v1"

    def _auth(self):
        return (self.key_id, self.key_secret)

    def create_order(self, amount_paise: int, currency: str = "INR", notes: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        payload = {
            "amount": amount_paise*100,
            "currency": currency,
            "payment_capture": 1,
            "notes": notes or {},
        }
        resp = requests.post(f"{self.base_url}/orders", auth=self._auth(), json=payload, timeout=20)
        resp.raise_for_status()
        return resp.json()

    def get_order(self, order_id: str) -> Dict[str, Any]:
        """Fetch an order's authoritative state from Razorpay - used where a
        credited amount must come from what was actually paid, not from a
        client-supplied field (verify_signature alone only proves the
        payment belongs to this order/payment id pair, it does not bind
        any particular amount)."""
        resp = requests.get(f"{self.base_url}/orders/{order_id}", auth=self._auth(), timeout=20)
        resp.raise_for_status()
        return resp.json()

    def get_order_payments(self, order_id: str) -> Dict[str, Any]:
        """All payments made against an order (used to recover payments the app never confirmed)."""
        resp = requests.get(f"{self.base_url}/orders/{order_id}/payments", auth=self._auth(), timeout=20)
        resp.raise_for_status()
        return resp.json()

    @staticmethod
    def verify_signature(order_id: str, payment_id: str, signature: str, key_secret: Optional[str] = None) -> bool:
        secret = key_secret or os.getenv("RAZORPAY_KEY_SECRET", "")
        message = f"{order_id}|{payment_id}".encode()
        expected = hmac.new(secret.encode(), msg=message, digestmod=hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature)

    def refund(self, payment_id: str, amount_rupees: Optional[int] = None, notes: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Refund a captured payment - full refund if amount_rupees is None,
        partial otherwise. Used by the admin refund-request queue (see
        api/routes/website_bookings.py's process-refund) - a real API call,
        not a customer-triggered automatic refund; an admin always decides
        to process it first."""
        payload: Dict[str, Any] = {"notes": notes or {}}
        if amount_rupees is not None:
            payload["amount"] = amount_rupees * 100
        resp = requests.post(
            f"{self.base_url}/payments/{payment_id}/refund", auth=self._auth(), json=payload, timeout=20
        )
        resp.raise_for_status()
        return resp.json()


