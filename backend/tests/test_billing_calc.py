from app.utils.billing_calc import compute_totals, fare_lines, normalize_lines

LINES = [
    {"label": "Km fare", "amount": 4000, "kind": "FARE"},
    {"label": "Driver bata", "amount": 600, "kind": "CHARGE"},
    {"label": "Toll", "amount": 400, "kind": "CHARGE"},
]


def test_gst_is_added_on_the_km_fare_only_by_default():
    t = compute_totals(LINES, gst_mode="EXTRA", gst_rate=5)
    assert t["subtotal"] == 5000 and t["taxable_value"] == 4000
    assert t["gst_amount"] == 200 and t["cgst"] == 100 and t["sgst"] == 100 and t["igst"] == 0
    assert t["total_amount"] == 5200 and t["amount_due"] == 5200 and t["balance_due"] == 5200


def test_gst_on_every_charge_and_interstate_split():
    t = compute_totals(LINES, gst_mode="EXTRA", gst_rate=5, applies_to="ALL", interstate=True)
    assert t["gst_amount"] == 250 and t["igst"] == 250 and t["cgst"] == 0 and t["total_amount"] == 5250


def test_gst_included_does_not_change_the_total():
    t = compute_totals(LINES, gst_mode="INCLUDED", gst_rate=5)
    assert t["total_amount"] == 5000 and t["gst_amount"] == 190 and t["taxable_value"] == 3810


def test_no_gst():
    t = compute_totals(LINES, gst_mode="NONE", gst_rate=5)
    assert t["gst_amount"] == 0 and t["total_amount"] == 5000


def test_gst_shown_but_not_charged_and_gst_paid_later():
    show = compute_totals(LINES, gst_mode="EXTRA", gst_rate=5, gst_collection="SHOW_ONLY")
    assert show["total_amount"] == 5200 and show["amount_due"] == 5000 and show["gst_pending"] == 0
    later = compute_totals(LINES, gst_mode="EXTRA", gst_rate=5, gst_collection="PAY_LATER", payments_total=1000)
    assert later["amount_due"] == 5200 and later["balance_due"] == 4200 and later["gst_pending"] == 200 and later["payable_now"] == 4000
    # once the trip part is paid only the GST is left, and an unpaid GST never turns the invoice into "blocked"
    rest = compute_totals(LINES, gst_mode="EXTRA", gst_rate=5, gst_collection="PAY_LATER", payments_total=5000)
    assert rest["payable_now"] == 0 and rest["gst_pending"] == 200 and rest["payment_status"] == "PARTIAL"


def test_advance_and_payments_settle_the_balance():
    t = compute_totals(LINES, gst_mode="EXTRA", gst_rate=5, payments_total=2000)
    assert t["balance_due"] == 3200 and t["payment_status"] == "PARTIAL"
    assert compute_totals(LINES, gst_mode="EXTRA", gst_rate=5, payments_total=5200)["payment_status"] == "PAID"
    assert compute_totals(LINES, gst_mode="EXTRA", gst_rate=5)["payment_status"] == "UNPAID"


def test_excluded_lines_are_not_added_and_zero_included_lines_vanish():
    lines = LINES + [{"label": "Parking", "amount": 0, "included": False}, {"label": "Hill", "amount": 0, "included": True},
                     {"label": "State tax", "amount": 300, "included": False}]
    assert [l["label"] for l in normalize_lines(lines)] == ["Km fare", "Driver bata", "Toll", "Parking", "State tax"]
    assert compute_totals(lines)["total_amount"] == 5000


def test_discount_is_shared_between_taxable_and_other_lines():
    t = compute_totals(LINES, gst_mode="EXTRA", gst_rate=5, discount=500)
    assert t["subtotal"] == 4500 and t["taxable_value"] == 3600 and t["gst_amount"] == 180 and t["total_amount"] == 4680


def test_a_gst_amount_copied_from_the_booking_wins():
    t = compute_totals(LINES, gst_mode="EXTRA", gst_rate=5, gst_override=210)
    assert t["gst_amount"] == 210 and t["total_amount"] == 5210


def test_fare_lines_follow_the_minimum_coverage_and_bata_days():
    one = fare_lines(trip_type="Oneway", km=80, rate_per_km=14, bata_per_day=300)
    assert one[0]["amount"] == 130 * 14 and one[1]["amount"] == 300
    rt = fare_lines(trip_type="Round Trip", km=300, rate_per_km=13, bata_per_day=300, days=2)
    assert rt[0]["amount"] == 500 * 13 and rt[1]["amount"] == 600
    assert fare_lines(trip_type="oneway", km=400, rate_per_km=12, extra_rate_per_km=1)[0]["amount"] == 400 * 13
