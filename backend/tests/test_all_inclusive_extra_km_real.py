from app.crud.end_records import all_inclusive_extra_km


def test_no_extra_inside_the_package_limit():
    x = all_inclusive_extra_km(updated_km=300, km_limit=300, driver_rate=13, house_rate=2, has_gst=True)
    assert x["extra_km"] == 0 and x["total"] == 0


def test_driver_earns_his_extra_km_rate_and_gst_is_on_the_whole_extra():
    x = all_inclusive_extra_km(updated_km=350, km_limit=300, driver_rate=13, house_rate=2, has_gst=True)
    assert x["extra_km"] == 50 and x["driver"] == 650 and x["house"] == 100
    assert x["gst"] == 38 and x["total"] == 650 + 100 + 38          # ceil(750 * 5%) = 38
    assert x["rate"] == 15


def test_no_gst_when_the_booking_has_none():
    x = all_inclusive_extra_km(updated_km=350, km_limit=300, driver_rate=13, house_rate=2, has_gst=False)
    assert x["gst"] == 0 and x["total"] == 750


def test_no_limit_means_no_extra():
    assert all_inclusive_extra_km(updated_km=900, km_limit=0, driver_rate=13, house_rate=2, has_gst=True)["total"] == 0
