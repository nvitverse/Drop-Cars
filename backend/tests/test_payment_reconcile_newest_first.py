"""2026-10-13: a driver paid for the Trusted plan and nothing activated. The reconcile sweep looked at the 25 OLDEST unpaid (abandoned)
orders on every run, so a newer order that really was paid was never reached."""
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.crud import payment_reconcile as pr


def _txn(i, minutes_old, now):
    return SimpleNamespace(rp_order_id=f"order_{i}", created_at=now - timedelta(minutes=minutes_old))


def test_a_new_order_is_reached_even_when_many_old_abandoned_ones_exist():
    now = datetime.now(timezone.utc)
    rows = [_txn(i, 5 + i, now) for i in range(100)]            # newest first, as the query now returns them
    picked = pr._pick_orders_to_check(rows, now, seen={})
    assert picked[0].rp_order_id == "order_0" and len(picked) == pr.MAX_PER_RUN


def test_an_order_razorpay_said_is_unpaid_is_not_asked_again_every_five_minutes():
    now = datetime.now(timezone.utc)
    old = _txn(1, 600, now)
    fresh = _txn(2, 10, now)
    seen = {"order_1": now - timedelta(minutes=5), "order_2": now - timedelta(minutes=5)}
    picked = [t.rp_order_id for t in pr._pick_orders_to_check([fresh, old], now, seen=seen)]
    assert picked == ["order_2"]                                 # fresh orders are checked every run, a 10-hour-old unpaid one rests
    seen["order_1"] = now - timedelta(hours=4)
    assert "order_1" in [t.rp_order_id for t in pr._pick_orders_to_check([old], now, seen=seen)]


def test_paid_order_behind_many_abandoned_ones_is_activated(pg_session, monkeypatch):
    from app.models.razorpay_transactions import RazorpayTransaction, RazorpayPaymentStatusEnum
    from app.models.vehicle_owner import VehicleOwnerCredentials
    pr._unpaid_seen.clear()
    o = VehicleOwnerCredentials(primary_number="9" + str(uuid.uuid4().int)[:9], hashed_password="x")
    pg_session.add(o)
    pg_session.flush()
    now = datetime.now(timezone.utc)
    paid_id = "order_paid_" + uuid.uuid4().hex[:8]
    for i in range(60):                                          # 60 abandoned orders, older than the paid one
        pg_session.add(RazorpayTransaction(vehicle_owner_id=o.id, rp_order_id=f"order_abandoned_{uuid.uuid4().hex[:8]}", amount=19900,
                                           status=RazorpayPaymentStatusEnum.CREATED, created_at=now - timedelta(hours=5, minutes=i)))
    pg_session.add(RazorpayTransaction(vehicle_owner_id=o.id, rp_order_id=paid_id, amount=0, status=RazorpayPaymentStatusEnum.CREATED,
                                       created_at=now - timedelta(minutes=20)))
    pg_session.flush()
    asked = []

    class FakeClient:
        def get_order_payments(self, oid):
            asked.append(oid)
            return {"items": [{"id": "pay_x", "status": "captured"}]} if oid == paid_id else {"items": []}

        def get_order(self, oid):
            return {"notes": {"purpose": ""}}
    monkeypatch.setattr("app.utils.razorpay_client.RazorpayClient", FakeClient)
    monkeypatch.setattr("app.crud.wallet.credit_wallet", lambda *a, **k: (0, None))
    out = pr.reconcile_razorpay_payments(pg_session)
    assert paid_id in asked and out["wallet_credited"] == 1
