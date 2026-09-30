"""Old document images, kept until the replacement is verified, then removed from storage and the database."""
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.stale_document_file import StaleDocumentFile

MAX_KEEP_DAYS = 180  # safety net: never keep an old file forever even if the new one is never verified


def register_stale_file(db: Session, entity_type: str, entity_id, status_field: str, url) -> None:
    """Remember a replaced document image instead of deleting it right away. Caller commits."""
    if not url:
        return
    db.add(StaleDocumentFile(entity_type=entity_type, entity_id=str(entity_id), status_field=status_field, url=str(url)))


def _entity(db: Session, row: StaleDocumentFile):
    if row.entity_type == "driver":
        from app.models.car_driver import CarDriver
        return db.query(CarDriver).filter(CarDriver.id == row.entity_id).first()
    if row.entity_type == "car":
        from app.models.car_details import CarDetails
        return db.query(CarDetails).filter(CarDetails.id == row.entity_id).first()
    if row.entity_type == "owner":
        from app.models.vehicle_owner_details import VehicleOwnerDetails
        return db.query(VehicleOwnerDetails).filter(VehicleOwnerDetails.vehicle_owner_id == row.entity_id).first()
    return None


def purge_verified_stale_files(db: Session) -> int:
    """Delete old images whose replacement is now VERIFIED (or whose owner record is gone / that are very old)."""
    from app.utils.gcs import delete_gcs_file_by_url

    rows = db.query(StaleDocumentFile).limit(500).all()
    if not rows:
        return 0
    cutoff = datetime.now(timezone.utc) - timedelta(days=MAX_KEEP_DAYS)
    removed = 0
    for row in rows:
        ent = _entity(db, row)
        status = getattr(getattr(ent, row.status_field, None), "value", getattr(ent, row.status_field, None)) if ent is not None else None
        created = row.created_at if row.created_at is None or row.created_at.tzinfo else row.created_at.replace(tzinfo=timezone.utc)
        if ent is None or str(status).upper() == "VERIFIED" or (created is not None and created < cutoff):
            try:
                delete_gcs_file_by_url(row.url)
            except Exception as e:
                print(f"stale document delete failed (will retry next sweep): {e}")
                continue
            db.delete(row)
            removed += 1
    db.commit()
    return removed
