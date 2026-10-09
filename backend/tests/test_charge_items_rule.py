from app.crud.new_orders import normalize_charge_items


def test_ticked_with_zero_is_nothing_ticked_with_one_rupee_is_included_unticked_is_excluded():
    items = [
        {"label": "Parking", "amount": 0, "included": True},            # ticked + 0  -> gone (not included, not excluded, no field)
        {"label": "Night halt", "amount": 1, "included": True},         # 1 rupee     -> included
        {"label": "State Tax", "included": False},                     # unticked    -> excluded (driver fills it at trip end)
        {"label": "GST on KM Fare (5%)", "included": True},             # information line without an amount stays
        {"label": "Special: child seat", "included": True},
    ]
    out = normalize_charge_items(items)
    assert [i["label"] for i in out] == ["Night halt", "State Tax", "GST on KM Fare (5%)", "Special: child seat"]


def test_a_zero_toll_line_stays_only_when_the_toll_is_to_be_updated_at_close():
    toll = [{"label": "Toll Charges", "amount": 0, "included": True}]
    assert normalize_charge_items(toll) == []
    assert normalize_charge_items(toll, keep_toll=True) == toll


def test_empty_input_is_unchanged():
    assert normalize_charge_items(None) is None
    assert normalize_charge_items([]) == []
