"""Driver city choice: one outdated name must not make the whole save fail (it did - every driver's 'All cities'
tick contained 'Pondicherry', the master list says 'Puducherry' -> 400 for everybody, so nobody's cities were saved)."""
from app.api.routes.cities import normalize_selected_cities, CITY_ALIASES

MASTER = [f"City{i}" for i in range(380)] + ["Chennai", "Madurai", "Puducherry", "Vellore", "Salem", "Erode", "Theni"]


def test_manual_choice_is_kept_in_order():
    assert normalize_selected_cities(["Chennai", "Madurai"], MASTER) == ["Chennai", "Madurai"]


def test_old_spelling_is_mapped_not_rejected():
    assert normalize_selected_cities(["Pondicherry", "Chennai"], MASTER) == ["Puducherry", "Chennai"]
    assert CITY_ALIASES["Pondicherry"] == "Puducherry"


def test_unknown_names_are_dropped_instead_of_failing():
    assert normalize_selected_cities(["Chennai", "Nowhereville", 7], MASTER) == ["Chennai"]
    assert normalize_selected_cities(["Nowhereville"], MASTER) == []
    assert normalize_selected_cities([], MASTER) == []


def test_duplicates_collapse():
    assert normalize_selected_cities(["Chennai", "Chennai"], MASTER) == ["Chennai"]


def test_the_all_cities_tick_is_stored_as_the_whole_master_list():
    app_all = [f"City{i}" for i in range(157)] + ["Pondicherry"]       # what the app sends today
    stored = normalize_selected_cities(app_all, MASTER)
    assert stored == MASTER
    assert len(stored) >= int(len(MASTER) * 0.6)        # crud.notification treats this as "All cities"


def test_exactly_five_by_hand_is_still_a_manual_choice():
    five = ["Chennai", "Madurai", "Vellore", "Salem", "Erode"]
    assert normalize_selected_cities(five, MASTER) == five
    assert normalize_selected_cities(five + ["Theni"], MASTER) == MASTER
