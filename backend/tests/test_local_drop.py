"""Local Drop: per-km, driver allowance included, km limit, own rate beyond it (owner 2026-10-13)."""
from app.crud.local_drop import find_item, local_drop_extra_amount, local_drop_item


def test_item_carries_the_terms_in_plain_words():
    it = local_drop_item(50, 30, 25)
    assert it["key"] == "local_drop" and it["km_limit"] == 50 and it["extra_km_rate"] == 30 and it["rate_per_km"] == 25
    assert "up to 50 km at Rs 25/km" in it["label"] and "Extra km Rs 30/km" in it["label"] and "extra" in it["label"].lower()
    assert local_drop_item(50, None, 25)["extra_km_rate"] == 25          # blank extra rate = same as the normal rate


def test_only_km_beyond_the_limit_get_the_other_rate():
    items = [{"label": "Toll", "included": False}, local_drop_item(50, 30, 25)]
    assert find_item(items)["km_limit"] == 50
    assert local_drop_extra_amount(items, 40, 25) == 0                    # inside the limit
    assert local_drop_extra_amount(items, 50, 25) == 0
    assert local_drop_extra_amount(items, 58, 25) == 8 * (30 - 25)        # 8 km beyond at +5
    assert local_drop_extra_amount([local_drop_item(50, 20, 25)], 60, 25) == -50   # a cheaper extra rate lowers the bill
    assert local_drop_extra_amount(None, 80, 25) == 0 and local_drop_extra_amount([{"label": "x"}], 80, 25) == 0


def test_same_rate_means_no_adjustment():
    assert local_drop_extra_amount([local_drop_item(50, None, 25)], 90, 25) == 0
