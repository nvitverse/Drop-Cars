"""Admin App > Tariffs > Driver: what the DRIVER is paid per vehicle and per permit destination (crud/driver_tariff.py).
Owner only: it decides how much of every website booking goes to the driver and how much to the extras."""
from typing import Any, Dict

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.security import get_current_admin
from app.crud import driver_tariff
from app.database.session import get_db

router = APIRouter(prefix="/admin/driver-tariff", tags=["Driver Tariff"])


def _owner_only(admin) -> None:
    if (getattr(admin, "role", "") or "").lower() != "owner":
        raise HTTPException(status_code=403, detail="Only the Owner can change the driver tariff.")


@router.get("")
def get_driver_tariff(db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    from app.models.new_orders import CarTypeEnum
    return {"config": driver_tariff.load(db), "car_types": [c.value for c in CarTypeEnum],
            "suggested_regions": driver_tariff.SUGGESTED_REGIONS, "default_bata": driver_tariff.DEFAULT_BATA}


@router.put("")
def put_driver_tariff(config: Dict[str, Any] = Body(...), db: Session = Depends(get_db), current_admin=Depends(get_current_admin)):
    _owner_only(current_admin)
    try:
        saved = driver_tariff.save(db, config)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    try:
        from app.crud.admin_activity_log import log_admin_action
        log_admin_action(db, admin_id=str(current_admin.id), admin_username=current_admin.username, admin_role=current_admin.role,
                         action="DRIVER_TARIFF_UPDATED", target_type="platform_setting", target_id=driver_tariff.SETTING_KEY,
                         details={"vehicles": len(saved["vehicles"]), "permit_rules": len(saved["permits"])})
    except Exception:  # noqa: BLE001
        db.rollback()
    return {"config": saved}
