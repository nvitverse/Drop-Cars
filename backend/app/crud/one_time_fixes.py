"""One-time data repairs, each guarded by a platform-setting flag so it runs exactly once."""
from sqlalchemy import text

FLAG = "fix_false_invalid_documents_2026_10_09"


def reset_false_invalid_documents(db) -> dict:
    """Before 2026-10-09 the automatic check marked a document INVALID whenever it could not read it (blurry, "looks like a photocopy",
    not recognised) - real originals were rejected and owners phoned support. Those rejections carry no stored reason (reasons
    only exist for what the check is sure about, saved from 2026-10-09). Turn them back into "waiting for a check"; a person
    can still reject for real in the Admin App."""
    from app.crud.customer_booking_request import get_platform_setting_value, set_platform_setting_value
    if (get_platform_setting_value(db, FLAG, "") or "") == "done":
        return {"skipped": True}
    n = 0
    for table, cols in (
        ("car_details", ("rc_front_status", "rc_back_status", "insurance_status", "fc_status", "permit_status", "pollution_status", "car_img_status")),
        ("car_driver", ("licence_front_status", "licence_back_status", "aadhar_front_status", "aadhar_back_status", "police_verification_status")),
    ):
        for col in cols:
            try:
                res = db.execute(text(f"UPDATE {table} SET {col} = 'NEEDS_REVIEW' WHERE {col} = 'INVALID' AND document_notes IS NULL"))
                n += res.rowcount or 0
            except Exception as e:      # a column that does not exist on this deployment must not stop the rest
                db.rollback()
                print(f"false-invalid repair skipped {table}.{col}: {e}")
    db.commit()
    set_platform_setting_value(db, FLAG, "done")
    return {"reset": n}
