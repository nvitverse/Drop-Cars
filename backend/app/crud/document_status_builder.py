"""One place that turns a car / driver row into the "documents" dict the apps show (status, image, expiry or registration date,
days left, and the plain-words reason a document was not accepted). The Driver App's My Cars / My Drivers screens read
`/vehicle-owner/all-document-status`; the per-car and per-driver endpoints use the same builder so they can never drift apart."""
from app.crud.document_expiry import expiry_fields
from app.crud.document_notes import reason_for


def _st(v) -> str:
    return v.value if v else "Pending"


def build_car_documents(car) -> dict:
    docs = {}
    rows = (
        ("rc_front", car.rc_front_img_url, car.rc_front_status, None),
        ("rc_back", car.rc_back_img_url, car.rc_back_status, None),
        ("insurance", car.insurance_img_url, car.insurance_status, car.insurance_expiry_date),
        ("fc", car.fc_img_url, car.fc_status, car.fc_expiry_date),
        ("car_img", car.car_img_url, car.car_img_status, None),
        ("permit", car.permit_img_url, car.permit_status, car.permit_expiry_date),
    )
    for key, url, status, expiry in rows:
        if not url:
            continue
        d = {"document_type": key, "status": _st(status), "image_url": url, "updated_at": None,
             "reason": reason_for(car, key, status), **expiry_fields(expiry)}
        if key in ("rc_front", "rc_back"):          # an RC has no expiry date, only a registration date
            d["date_label"] = "Registration date"
            d["registration_date"] = car.registration_date.isoformat() if car.registration_date else None
        docs[key] = d
    return docs


def build_driver_documents(driver, include_aadhar: bool = True) -> dict:
    docs = {}
    if driver.licence_front_img:
        docs["licence"] = {"document_type": "licence", "status": _st(driver.licence_front_status), "image_url": driver.licence_front_img,
                           "updated_at": None, "reason": reason_for(driver, "licence", driver.licence_front_status),
                           **expiry_fields(driver.licence_expiry_date)}
    if driver.licence_back_img:
        docs["licence_back"] = {"document_type": "licence_back", "status": _st(driver.licence_back_status), "image_url": driver.licence_back_img,
                                "updated_at": None, "reason": reason_for(driver, "licence_back", driver.licence_back_status)}
    if include_aadhar:
        for key, img, st in (("aadhar", driver.aadhar_front_img, driver.aadhar_front_status), ("aadhar_back", driver.aadhar_back_img, driver.aadhar_back_status)):
            if img:
                docs[key] = {"document_type": key, "status": _st(st), "image_url": img, "updated_at": None, "reason": reason_for(driver, key, st)}
    if driver.police_verification_img:
        docs["police"] = {"document_type": "police", "status": _st(driver.police_verification_status), "image_url": driver.police_verification_img,
                          "updated_at": None, "reason": reason_for(driver, "police", driver.police_verification_status)}
    return docs
