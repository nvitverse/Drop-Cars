# app/utils/rate_card.py
from sqlalchemy.orm import Session
from app.models.platform_setting import PlatformSetting
from app.models.new_orders import CarTypeEnum

# Standard defaults for fallback
DEFAULT_RATES = {
    "cost_per_km": {
        CarTypeEnum.HATCHBACK.value: 12,
        CarTypeEnum.SEDAN_4_PLUS_1.value: 14,
        # "Prime Sedan" (Maruti Ciaz / Honda City / Toyota Corolla or
        # equivalent) - owner set 2026-09-29: ~16/km one-way. This flat
        # DEFAULT_RATES dict has no separate one-way/round-trip split (see
        # get_rate_card_for_car_type below - callers that need round trip
        # at 15/km specifically should override via the admin Rate Card
        # page, same as every other car type's round-trip figure).
        CarTypeEnum.NEW_SEDAN_2022_MODEL.value: 16,
        CarTypeEnum.ETIOS_4_PLUS_1.value: 15,
        CarTypeEnum.SUV.value: 18,
        CarTypeEnum.SUV_6_PLUS_1.value: 19,
        CarTypeEnum.SUV_7_PLUS_1.value: 20,
        CarTypeEnum.INNOVA.value: 22,
        CarTypeEnum.INNOVA_6_PLUS_1.value: 23,
        CarTypeEnum.INNOVA_7_PLUS_1.value: 24,
        CarTypeEnum.INNOVA_CRYSTA.value: 25,
        CarTypeEnum.INNOVA_CRYSTA_6_PLUS_1.value: 26,
        CarTypeEnum.INNOVA_CRYSTA_7_PLUS_1.value: 27,
        # PLACEHOLDERS - not real pricing. Scaled above Innova Crysta by
        # seating count as a rough starting point; tune via the admin
        # Rate Card page (GET/PUT /admin/rate-card) before going live.
        CarTypeEnum.TEMPO_TRAVELLER_12.value: 30,
        CarTypeEnum.TEMPO_TRAVELLER_14.value: 32,
        CarTypeEnum.TEMPO_TRAVELLER_18.value: 35,
        CarTypeEnum.URBANIA_12.value: 34,
        CarTypeEnum.URBANIA_14.value: 37,
        CarTypeEnum.URBANIA_16.value: 40,
    },
    "driver_allowance": 300,
    "extra_driver_allowance": 0,
    "permit_charges": 0,
    "extra_permit_charges": 0,
    "hill_charges": 0,
    "toll_charges": 0,
    "extra_cost_per_km": 0,
    "night_charges": 0,
}

def get_rate_card_keys(car_type: str) -> dict:
    return {
        "cost_per_km": f"rate_cost_per_km_{car_type}",
        "driver_allowance": f"rate_driver_allowance_{car_type}",
        "extra_driver_allowance": f"rate_extra_driver_allowance_{car_type}",
        "permit_charges": f"rate_permit_charges_{car_type}",
        "extra_permit_charges": f"rate_extra_permit_charges_{car_type}",
        "hill_charges": f"rate_hill_charges_{car_type}",
        "toll_charges": f"rate_toll_charges_{car_type}",
        "extra_cost_per_km": f"rate_extra_cost_per_km_{car_type}",
        "night_charges": f"rate_night_charges_{car_type}",
    }

def get_rate_card_for_car_type(db: Session, car_type: str) -> dict:
    keys_map = get_rate_card_keys(car_type)
    keys = list(keys_map.values())
    rows = db.query(PlatformSetting).filter(PlatformSetting.key.in_(keys)).all()
    values = {row.key: row.value for row in rows}
    
    fallback_cost_per_km = DEFAULT_RATES["cost_per_km"].get(car_type, 15)
    
    return {
        "cost_per_km": int(values.get(keys_map["cost_per_km"], fallback_cost_per_km)),
        "driver_allowance": int(values.get(keys_map["driver_allowance"], DEFAULT_RATES["driver_allowance"])),
        "extra_driver_allowance": int(values.get(keys_map["extra_driver_allowance"], DEFAULT_RATES["extra_driver_allowance"])),
        "permit_charges": int(values.get(keys_map["permit_charges"], DEFAULT_RATES["permit_charges"])),
        "extra_permit_charges": int(values.get(keys_map["extra_permit_charges"], DEFAULT_RATES["extra_permit_charges"])),
        "hill_charges": int(values.get(keys_map["hill_charges"], DEFAULT_RATES["hill_charges"])),
        "toll_charges": int(values.get(keys_map["toll_charges"], DEFAULT_RATES["toll_charges"])),
        "extra_cost_per_km": int(values.get(keys_map["extra_cost_per_km"], DEFAULT_RATES["extra_cost_per_km"])),
        "night_charges": int(values.get(keys_map["night_charges"], DEFAULT_RATES["night_charges"])),
    }

def get_all_rate_cards(db: Session) -> dict:
    result = {}
    for car_type in CarTypeEnum:
        result[car_type.value] = get_rate_card_for_car_type(db, car_type.value)
    return result

def update_rate_cards(db: Session, updates: dict) -> dict:
    """updates: {car_type: {field: value, ...}}"""
    for car_type, fields in updates.items():
        keys_map = get_rate_card_keys(car_type)
        for field, val in fields.items():
            if field not in keys_map:
                continue
            key = keys_map[field]
            row = db.query(PlatformSetting).filter(PlatformSetting.key == key).first()
            if row:
                row.value = str(val)
            else:
                row = PlatformSetting(key=key, value=str(val))
            db.add(row)
    db.commit()
    return get_all_rate_cards(db)
