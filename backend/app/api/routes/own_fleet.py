# api/routes/own_fleet.py
"""Own Fleet - Drop Cars' company cars and salaried drivers: cars, drivers,
daily attendance, salary advances, running expenses and monthly payroll.
See models/own_fleet.py for why this is separate from partner fleet drivers."""
import calendar
from datetime import date as _date, timedelta
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import get_current_admin
from app.database.session import get_db
from app.models.own_fleet import (
    OwnFleetAdvance, OwnFleetAttendance, OwnFleetCar, OwnFleetDriver, OwnFleetExpense, OwnFleetPayroll,
)

router = APIRouter(prefix="/admin/own-fleet", tags=["Own Fleet"])

CAR_STATUSES = {"AVAILABLE", "ON_TRIP", "MAINTENANCE"}
ATTENDANCE_STATUSES = {"P", "A", "HD", "L", "OT"}
EXPENSE_CATEGORIES = {"FUEL", "SERVICE", "REPAIR", "TOLL", "PARKING", "INSURANCE", "OTHER"}
PAID_DAY_WEIGHT = {"P": 1.0, "OT": 1.0, "L": 1.0, "HD": 0.5, "A": 0.0}


def _require_fleet(admin) -> None:
    if admin.role == "Owner":
        return
    perms = set(admin.permissions or [])
    if "fleet" not in perms:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You need 'fleet' access for Own Fleet.")


def _require_money(admin) -> None:
    from app.api.routes.admin import require_payment_release_permission
    require_payment_release_permission(admin)


def _month_bounds(month: str):
    try:
        y, m = (int(p) for p in month.split("-"))
        start = _date(y, m, 1)
    except Exception:
        raise HTTPException(status_code=400, detail="month must be YYYY-MM")
    end = _date(y, m, calendar.monthrange(y, m)[1])
    return start, end


def _car_out(c: OwnFleetCar) -> dict:
    return {
        "id": str(c.id), "name": c.name, "car_number": c.car_number, "car_type": c.car_type,
        "status": c.status, "insurance_expiry": c.insurance_expiry.isoformat() if c.insurance_expiry else None,
        "fc_expiry": c.fc_expiry.isoformat() if c.fc_expiry else None,
        "permit_expiry": c.permit_expiry.isoformat() if c.permit_expiry else None,
        "odometer_km": c.odometer_km, "next_service_km": c.next_service_km, "notes": c.notes, "is_active": c.is_active,
    }


def _driver_out(d: OwnFleetDriver, cars_by_id: dict) -> dict:
    car = cars_by_id.get(d.assigned_car_id) if d.assigned_car_id else None
    return {
        "id": str(d.id), "name": d.name, "phone": d.phone, "salary_type": d.salary_type,
        "base_salary": d.base_salary, "daily_wage": d.daily_wage, "per_trip_bata": d.per_trip_bata,
        "ot_rate_per_hour": d.ot_rate_per_hour,
        "assigned_car_id": str(d.assigned_car_id) if d.assigned_car_id else None,
        "assigned_car_number": car.car_number if car else None,
        "licence_number": d.licence_number,
        "licence_expiry": d.licence_expiry.isoformat() if d.licence_expiry else None,
        "joined_on": d.joined_on.isoformat() if d.joined_on else None, "is_active": d.is_active,
    }


# ---------------------------------------------------------------- summary

@router.get("/summary")
def own_fleet_summary(current_admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    _require_fleet(current_admin)
    today = _date.today()
    cars = db.query(OwnFleetCar).filter(OwnFleetCar.is_active.is_(True)).all()
    drivers = db.query(OwnFleetDriver).filter(OwnFleetDriver.is_active.is_(True)).all()
    todays = db.query(OwnFleetAttendance).filter(OwnFleetAttendance.date == today).all()
    month_start, month_end = _month_bounds(today.strftime("%Y-%m"))
    month_expenses = db.query(OwnFleetExpense).filter(
        OwnFleetExpense.date >= month_start, OwnFleetExpense.date <= month_end
    ).all()
    soon = today + timedelta(days=30)
    expiring = []
    for c in cars:
        for label, d in (("Insurance", c.insurance_expiry), ("FC", c.fc_expiry), ("Permit", c.permit_expiry)):
            if d and d <= soon:
                expiring.append({"kind": "car", "name": f"{c.name} ({c.car_number})", "document": label, "expires_on": d.isoformat(), "expired": d < today})
    for dr in drivers:
        if dr.licence_expiry and dr.licence_expiry <= soon:
            expiring.append({"kind": "driver", "name": dr.name, "document": "Licence", "expires_on": dr.licence_expiry.isoformat(), "expired": dr.licence_expiry < today})
    unrecovered = db.query(OwnFleetAdvance).filter(OwnFleetAdvance.recovered_in_month.is_(None)).all()
    return {
        "cars_total": len(cars),
        "cars_available": sum(1 for c in cars if c.status == "AVAILABLE"),
        "cars_on_trip": sum(1 for c in cars if c.status == "ON_TRIP"),
        "cars_maintenance": sum(1 for c in cars if c.status == "MAINTENANCE"),
        "drivers_total": len(drivers),
        "attendance_marked_today": len(todays),
        "present_today": sum(1 for a in todays if a.status in ("P", "OT", "HD")),
        "month_expenses_total": sum(e.amount for e in month_expenses),
        "advances_outstanding": sum(a.amount for a in unrecovered),
        "expiring_documents": sorted(expiring, key=lambda x: x["expires_on"]),
    }


# ---------------------------------------------------------------- cars

class CarIn(BaseModel):
    name: str
    car_number: str
    car_type: str
    status: Optional[str] = "AVAILABLE"
    insurance_expiry: Optional[_date] = None
    fc_expiry: Optional[_date] = None
    permit_expiry: Optional[_date] = None
    odometer_km: Optional[int] = None
    next_service_km: Optional[int] = None
    notes: Optional[str] = None


class CarPatch(BaseModel):
    name: Optional[str] = None
    car_number: Optional[str] = None
    car_type: Optional[str] = None
    status: Optional[str] = None
    insurance_expiry: Optional[_date] = None
    fc_expiry: Optional[_date] = None
    permit_expiry: Optional[_date] = None
    odometer_km: Optional[int] = None
    next_service_km: Optional[int] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/cars")
def list_cars(include_inactive: bool = False, current_admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    _require_fleet(current_admin)
    q = db.query(OwnFleetCar)
    if not include_inactive:
        q = q.filter(OwnFleetCar.is_active.is_(True))
    return [_car_out(c) for c in q.order_by(OwnFleetCar.created_at.desc()).all()]


@router.post("/cars")
def create_car(body: CarIn, current_admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    _require_fleet(current_admin)
    if body.status and body.status not in CAR_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of {sorted(CAR_STATUSES)}")
    number = body.car_number.strip().upper()
    if db.query(OwnFleetCar).filter(OwnFleetCar.car_number == number).first():
        raise HTTPException(status_code=409, detail="A car with this number already exists")
    car = OwnFleetCar(**{**body.model_dump(), "car_number": number, "name": body.name.strip()})
    db.add(car)
    db.commit()
    db.refresh(car)
    return _car_out(car)


@router.patch("/cars/{car_id}")
def update_car(car_id: UUID, body: CarPatch, current_admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    _require_fleet(current_admin)
    car = db.query(OwnFleetCar).filter(OwnFleetCar.id == car_id).first()
    if not car:
        raise HTTPException(status_code=404, detail="Car not found")
    data = body.model_dump(exclude_unset=True)
    if "status" in data and data["status"] not in CAR_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of {sorted(CAR_STATUSES)}")
    if "car_number" in data and data["car_number"]:
        data["car_number"] = data["car_number"].strip().upper()
    for k, v in data.items():
        setattr(car, k, v)
    db.commit()
    db.refresh(car)
    return _car_out(car)


# ---------------------------------------------------------------- drivers

class DriverIn(BaseModel):
    name: str
    phone: str
    salary_type: Optional[str] = "MONTHLY"
    base_salary: Optional[int] = 0
    daily_wage: Optional[int] = 0
    per_trip_bata: Optional[int] = 0
    ot_rate_per_hour: Optional[int] = 0
    assigned_car_id: Optional[UUID] = None
    licence_number: Optional[str] = None
    licence_expiry: Optional[_date] = None
    joined_on: Optional[_date] = None


class DriverPatch(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    salary_type: Optional[str] = None
    base_salary: Optional[int] = None
    daily_wage: Optional[int] = None
    per_trip_bata: Optional[int] = None
    ot_rate_per_hour: Optional[int] = None
    assigned_car_id: Optional[UUID] = None
    licence_number: Optional[str] = None
    licence_expiry: Optional[_date] = None
    joined_on: Optional[_date] = None
    is_active: Optional[bool] = None


def _cars_by_id(db: Session) -> dict:
    return {c.id: c for c in db.query(OwnFleetCar).all()}


@router.get("/drivers")
def list_drivers(include_inactive: bool = False, current_admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    _require_fleet(current_admin)
    q = db.query(OwnFleetDriver)
    if not include_inactive:
        q = q.filter(OwnFleetDriver.is_active.is_(True))
    cars = _cars_by_id(db)
    return [_driver_out(d, cars) for d in q.order_by(OwnFleetDriver.name.asc()).all()]


@router.post("/drivers")
def create_driver(body: DriverIn, current_admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    _require_fleet(current_admin)
    if body.salary_type not in ("MONTHLY", "DAILY"):
        raise HTTPException(status_code=400, detail="salary_type must be MONTHLY or DAILY")
    phone = "".join(ch for ch in body.phone if ch.isdigit())[-10:]
    if len(phone) != 10:
        raise HTTPException(status_code=400, detail="Enter a valid 10-digit phone number")
    if db.query(OwnFleetDriver).filter(OwnFleetDriver.phone == phone).first():
        raise HTTPException(status_code=409, detail="A driver with this phone number already exists")
    d = OwnFleetDriver(**{**body.model_dump(), "phone": phone, "name": body.name.strip(), "joined_on": body.joined_on or _date.today()})
    db.add(d)
    db.commit()
    db.refresh(d)
    return _driver_out(d, _cars_by_id(db))


@router.patch("/drivers/{driver_id}")
def update_driver(driver_id: UUID, body: DriverPatch, current_admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    _require_fleet(current_admin)
    d = db.query(OwnFleetDriver).filter(OwnFleetDriver.id == driver_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Driver not found")
    data = body.model_dump(exclude_unset=True)
    if "salary_type" in data and data["salary_type"] not in ("MONTHLY", "DAILY"):
        raise HTTPException(status_code=400, detail="salary_type must be MONTHLY or DAILY")
    # Changing pay terms must not quietly rewrite what an already-paid
    # month shows - paid months are frozen in own_fleet_payroll rows.
    for k, v in data.items():
        setattr(d, k, v)
    db.commit()
    db.refresh(d)
    return _driver_out(d, _cars_by_id(db))


# ---------------------------------------------------------------- attendance

class AttendanceRecord(BaseModel):
    driver_id: UUID
    status: str
    trips_count: Optional[int] = 0
    ot_hours: Optional[int] = 0
    notes: Optional[str] = None


class AttendanceBulk(BaseModel):
    date: _date
    records: List[AttendanceRecord]


@router.get("/attendance")
def get_attendance(date: _date = Query(...), current_admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    _require_fleet(current_admin)
    drivers = db.query(OwnFleetDriver).filter(OwnFleetDriver.is_active.is_(True)).order_by(OwnFleetDriver.name.asc()).all()
    rows = {a.driver_id: a for a in db.query(OwnFleetAttendance).filter(OwnFleetAttendance.date == date).all()}
    out = []
    for d in drivers:
        a = rows.get(d.id)
        out.append({
            "driver_id": str(d.id), "name": d.name, "phone": d.phone,
            "status": a.status if a else None, "trips_count": a.trips_count if a else 0,
            "ot_hours": a.ot_hours if a else 0, "notes": a.notes if a else None,
            "marked_by": a.marked_by if a else None,
        })
    return {"date": date.isoformat(), "drivers": out}


@router.post("/attendance")
def mark_attendance(body: AttendanceBulk, current_admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    _require_fleet(current_admin)
    if body.date > _date.today():
        raise HTTPException(status_code=400, detail="Attendance can't be marked for a future date")
    month = body.date.strftime("%Y-%m")
    saved = 0
    for r in body.records:
        if r.status not in ATTENDANCE_STATUSES:
            raise HTTPException(status_code=400, detail=f"status must be one of {sorted(ATTENDANCE_STATUSES)}")
        if db.query(OwnFleetPayroll).filter(OwnFleetPayroll.driver_id == r.driver_id, OwnFleetPayroll.month == month).first():
            raise HTTPException(status_code=409, detail=f"Payroll for {month} is already paid for one of these drivers - attendance for that month is locked")
        row = db.query(OwnFleetAttendance).filter(
            OwnFleetAttendance.driver_id == r.driver_id, OwnFleetAttendance.date == body.date
        ).first()
        if not row:
            row = OwnFleetAttendance(driver_id=r.driver_id, date=body.date)
            db.add(row)
        row.status = r.status
        row.trips_count = max(0, r.trips_count or 0)
        row.ot_hours = max(0, r.ot_hours or 0)
        row.notes = r.notes
        row.marked_by = current_admin.username
        saved += 1
    db.commit()
    return {"saved": saved}


# ---------------------------------------------------------------- advances

class AdvanceIn(BaseModel):
    driver_id: UUID
    amount: int
    date: Optional[_date] = None
    note: Optional[str] = None


@router.get("/advances")
def list_advances(driver_id: Optional[UUID] = None, current_admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    _require_fleet(current_admin)
    q = db.query(OwnFleetAdvance)
    if driver_id:
        q = q.filter(OwnFleetAdvance.driver_id == driver_id)
    names = {d.id: d.name for d in db.query(OwnFleetDriver).all()}
    return [{
        "id": str(a.id), "driver_id": str(a.driver_id), "driver_name": names.get(a.driver_id, ""),
        "amount": a.amount, "date": a.date.isoformat(), "note": a.note,
        "recovered_in_month": a.recovered_in_month, "recorded_by": a.recorded_by,
    } for a in q.order_by(OwnFleetAdvance.date.desc()).limit(300).all()]


@router.post("/advances")
def record_advance(body: AdvanceIn, current_admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    _require_money(current_admin)
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")
    if not db.query(OwnFleetDriver).filter(OwnFleetDriver.id == body.driver_id).first():
        raise HTTPException(status_code=404, detail="Driver not found")
    a = OwnFleetAdvance(driver_id=body.driver_id, amount=body.amount, date=body.date or _date.today(), note=body.note, recorded_by=current_admin.username)
    db.add(a)
    db.commit()
    return {"id": str(a.id)}


# ---------------------------------------------------------------- expenses

class ExpenseIn(BaseModel):
    category: str
    amount: int
    car_id: Optional[UUID] = None
    driver_id: Optional[UUID] = None
    date: Optional[_date] = None
    note: Optional[str] = None


@router.get("/expenses")
def list_expenses(month: str = Query(...), current_admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    _require_fleet(current_admin)
    start, end = _month_bounds(month)
    cars = _cars_by_id(db)
    rows = db.query(OwnFleetExpense).filter(OwnFleetExpense.date >= start, OwnFleetExpense.date <= end).order_by(OwnFleetExpense.date.desc()).all()
    by_category: dict = {}
    for e in rows:
        by_category[e.category] = by_category.get(e.category, 0) + e.amount
    return {
        "month": month,
        "total": sum(e.amount for e in rows),
        "by_category": by_category,
        "entries": [{
            "id": str(e.id), "category": e.category, "amount": e.amount, "date": e.date.isoformat(), "note": e.note,
            "car_number": cars[e.car_id].car_number if e.car_id and e.car_id in cars else None,
            "recorded_by": e.recorded_by,
        } for e in rows],
    }


@router.post("/expenses")
def add_expense(body: ExpenseIn, current_admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    _require_fleet(current_admin)
    if body.category not in EXPENSE_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"category must be one of {sorted(EXPENSE_CATEGORIES)}")
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")
    e = OwnFleetExpense(**{**body.model_dump(), "date": body.date or _date.today(), "recorded_by": current_admin.username})
    db.add(e)
    db.commit()
    return {"id": str(e.id)}


# ---------------------------------------------------------------- payroll

def _compute_payroll(db: Session, d: OwnFleetDriver, month: str) -> dict:
    start, end = _month_bounds(month)
    days_in_month = (end - start).days + 1
    att = db.query(OwnFleetAttendance).filter(
        OwnFleetAttendance.driver_id == d.id, OwnFleetAttendance.date >= start, OwnFleetAttendance.date <= end
    ).all()
    paid_days = sum(PAID_DAY_WEIGHT.get(a.status, 0.0) for a in att)
    trips = sum(a.trips_count or 0 for a in att)
    ot_hours = sum(a.ot_hours or 0 for a in att)
    if d.salary_type == "DAILY":
        salary = int(round((d.daily_wage or 0) * paid_days))
    else:
        salary = int(round((d.base_salary or 0) * paid_days / days_in_month))
    bata = trips * (d.per_trip_bata or 0)
    ot_amount = ot_hours * (d.ot_rate_per_hour or 0)
    gross = salary + bata + ot_amount
    # Oldest advances first, only whole advances that still fit inside this
    # month's gross - the rest carry to next month instead of producing a
    # negative salary.
    pending = db.query(OwnFleetAdvance).filter(
        OwnFleetAdvance.driver_id == d.id, OwnFleetAdvance.recovered_in_month.is_(None), OwnFleetAdvance.date <= end
    ).order_by(OwnFleetAdvance.date.asc()).all()
    deducted, deducted_ids = 0, []
    for a in pending:
        if deducted + a.amount <= gross:
            deducted += a.amount
            deducted_ids.append(a.id)
    return {
        "paid_days": paid_days, "days_marked": len(att), "trips": trips, "ot_hours": ot_hours,
        "salary_amount": salary, "bata_amount": bata, "ot_amount": ot_amount, "gross": gross,
        "advances_pending": sum(a.amount for a in pending), "advances_deducted": deducted,
        "net_payable": gross - deducted, "_deducted_ids": deducted_ids,
    }


@router.get("/payroll")
def payroll_for_month(month: str = Query(...), current_admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    _require_fleet(current_admin)
    _month_bounds(month)
    drivers = db.query(OwnFleetDriver).filter(OwnFleetDriver.is_active.is_(True)).order_by(OwnFleetDriver.name.asc()).all()
    paid = {p.driver_id: p for p in db.query(OwnFleetPayroll).filter(OwnFleetPayroll.month == month).all()}
    out = []
    for d in drivers:
        p = paid.get(d.id)
        if p:
            out.append({
                "driver_id": str(d.id), "name": d.name, "status": "PAID",
                "paid_days": float(p.paid_days), "salary_amount": p.salary_amount, "bata_amount": p.bata_amount,
                "ot_amount": p.ot_amount, "gross": p.salary_amount + p.bata_amount + p.ot_amount,
                "advances_deducted": p.advances_deducted, "net_payable": p.net_paid,
                "paid_via": p.paid_via, "paid_by": p.paid_by, "paid_at": p.paid_at.isoformat() if p.paid_at else None,
            })
        else:
            calc = _compute_payroll(db, d, month)
            calc.pop("_deducted_ids")
            out.append({"driver_id": str(d.id), "name": d.name, "status": "DUE", **calc})
    return {"month": month, "drivers": out, "total_due": sum(r["net_payable"] for r in out if r["status"] == "DUE")}


class PayIn(BaseModel):
    driver_id: UUID
    month: str
    paid_via: Optional[str] = "CASH"


@router.post("/payroll/pay")
def mark_payroll_paid(body: PayIn, current_admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    _require_money(current_admin)
    d = db.query(OwnFleetDriver).filter(OwnFleetDriver.id == body.driver_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Driver not found")
    if db.query(OwnFleetPayroll).filter(OwnFleetPayroll.driver_id == d.id, OwnFleetPayroll.month == body.month).first():
        raise HTTPException(status_code=409, detail="This month is already marked paid")
    start, _end = _month_bounds(body.month)
    if start > _date.today():
        raise HTTPException(status_code=400, detail="Can't pay a month that hasn't started")
    calc = _compute_payroll(db, d, body.month)
    if calc["days_marked"] == 0:
        raise HTTPException(status_code=400, detail="No attendance marked for this month - mark attendance first")
    for a in db.query(OwnFleetAdvance).filter(OwnFleetAdvance.id.in_(calc["_deducted_ids"])).all() if calc["_deducted_ids"] else []:
        a.recovered_in_month = body.month
    db.add(OwnFleetPayroll(
        driver_id=d.id, month=body.month, paid_days=str(calc["paid_days"]),
        salary_amount=calc["salary_amount"], bata_amount=calc["bata_amount"], ot_amount=calc["ot_amount"],
        advances_deducted=calc["advances_deducted"], net_paid=calc["net_payable"],
        paid_via=(body.paid_via or "CASH").upper(), paid_by=current_admin.username,
    ))
    db.commit()
    from app.crud.admin_activity_log import log_admin_action
    log_admin_action(
        db, admin_id=str(current_admin.id), admin_username=current_admin.username, admin_role=current_admin.role,
        action="OWN_FLEET_SALARY_PAID", target_type="own_fleet_driver", target_id=str(d.id), target_name=d.name,
        details={"month": body.month, "net_paid": calc["net_payable"], "paid_via": body.paid_via},
    )
    return {"net_paid": calc["net_payable"]}
