# app/api/routes/workers.py
from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from app.database.session import get_db
from app.core.security import get_current_admin
from app.models.admin import Admin
from app.models.admin_activity_log import AdminActivityLog
from app.models.worker_management import Worker, WorkerDailyAttendance, WorkerAdvance, PettyCashBook
from typing import List, Optional, Dict, Any
from datetime import date, datetime
from pydantic import BaseModel, Field
import uuid

router = APIRouter(prefix="/admin/workers", tags=["Workers & Operations Hub"])


# --- Schemas ---

class WorkerCreateSchema(BaseModel):
    name: str = Field(..., min_length=2)
    phone: str = Field(..., min_length=10)
    roles: List[str] = Field(default_factory=lambda: ["operations"])
    wage_type: str = Field(default="daily")
    base_wage: float = Field(default=0.0)
    ot_rate_per_hour: float = Field(default=0.0)
    is_company_driver: bool = Field(default=False)
    assigned_vehicle_number: Optional[str] = None
    admin_account_id: Optional[str] = None
    notes: Optional[str] = None


class WorkerUpdateSchema(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    roles: Optional[List[str]] = None
    wage_type: Optional[str] = None
    base_wage: Optional[float] = None
    ot_rate_per_hour: Optional[float] = None
    is_company_driver: Optional[bool] = None
    assigned_vehicle_number: Optional[str] = None
    admin_account_id: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class AttendanceMarkItem(BaseModel):
    worker_id: str
    status: str  # P, A, HD, OT, P_HALF, DOUBLE_DUTY, PA
    ot_minutes: int = 0
    ot_amount: float = 0.0
    remarks: Optional[str] = None


class BulkAttendanceSchema(BaseModel):
    date: date
    records: List[AttendanceMarkItem]


class AdvanceCreateSchema(BaseModel):
    worker_id: str
    date: date
    amount: float
    payment_mode: str = "cash"  # cash, upi, bank
    remarks: Optional[str] = None
    record_in_petty_cash: bool = True


class PettyCashCreateSchema(BaseModel):
    date: date
    transaction_type: str  # IN or OUT
    amount: float
    category: str = "other"  # diesel, toll, maintenance, tea_food, advance, office, other
    payment_mode: str = "cash"
    notes: Optional[str] = None


class OfflineSyncBatchSchema(BaseModel):
    attendance_records: Optional[List[Dict[str, Any]]] = None
    advances: Optional[List[Dict[str, Any]]] = None
    cashbook_entries: Optional[List[Dict[str, Any]]] = None


# --- Endpoints ---

@router.get("")
def get_workers(
    active_only: bool = Query(True),
    role: Optional[str] = Query(None),
    is_company_driver: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """List workers with role tags, wage details, and assigned vehicles."""
    query = db.query(Worker)
    if active_only:
        query = query.filter(Worker.is_active == True)
    if is_company_driver is not None:
        query = query.filter(Worker.is_company_driver == is_company_driver)
    
    workers = query.order_by(Worker.name.asc()).all()
    
    result = []
    for w in workers:
        # If role filter requested, check in roles JSON list
        if role and role not in (w.roles or []):
            continue
        result.append({
            "id": str(w.id),
            "name": w.name,
            "phone": w.phone,
            "roles": w.roles or [],
            "wage_type": w.wage_type,
            "base_wage": w.base_wage,
            "ot_rate_per_hour": w.ot_rate_per_hour,
            "is_company_driver": w.is_company_driver,
            "assigned_vehicle_number": w.assigned_vehicle_number,
            "admin_account_id": str(w.admin_account_id) if w.admin_account_id else None,
            "is_active": w.is_active,
            "joined_at": str(w.joined_at),
            "notes": w.notes,
            "created_by_admin_username": w.created_by_admin_username,
        })
    return {"workers": result, "total": len(result)}


@router.post("")
def create_worker(
    payload: WorkerCreateSchema,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Add new staff/worker with multi-role assignment and audit attribution."""
    worker = Worker(
        name=payload.name.strip(),
        phone=payload.phone.strip(),
        roles=payload.roles or ["operations"],
        wage_type=payload.wage_type,
        base_wage=payload.base_wage,
        ot_rate_per_hour=payload.ot_rate_per_hour,
        is_company_driver=payload.is_company_driver,
        assigned_vehicle_number=payload.assigned_vehicle_number.strip() if payload.assigned_vehicle_number else None,
        admin_account_id=uuid.UUID(payload.admin_account_id) if payload.admin_account_id else None,
        notes=payload.notes,
        created_by_admin_username=current_admin.username,
    )
    db.add(worker)
    
    # Audit trail
    log = AdminActivityLog(
        admin_id=current_admin.id,
        admin_username=current_admin.username,
        admin_role=current_admin.role,
        action="WORKER_CREATED",
        target_type="worker",
        target_name=worker.name,
        details={"phone": worker.phone, "roles": worker.roles, "base_wage": worker.base_wage},
    )
    db.add(log)
    db.commit()
    db.refresh(worker)
    return {"message": "Worker created successfully", "id": str(worker.id)}


@router.put("/{worker_id}")
def update_worker(
    worker_id: str,
    payload: WorkerUpdateSchema,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Update worker roles, wages, or active status."""
    try:
        w_uuid = uuid.UUID(worker_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid worker ID")
    
    worker = db.query(Worker).filter(Worker.id == w_uuid).first()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    
    changes = {}
    if payload.name is not None:
        worker.name = payload.name.strip()
        changes["name"] = worker.name
    if payload.phone is not None:
        worker.phone = payload.phone.strip()
        changes["phone"] = worker.phone
    if payload.roles is not None:
        worker.roles = payload.roles
        changes["roles"] = worker.roles
    if payload.wage_type is not None:
        worker.wage_type = payload.wage_type
    if payload.base_wage is not None:
        worker.base_wage = payload.base_wage
    if payload.ot_rate_per_hour is not None:
        worker.ot_rate_per_hour = payload.ot_rate_per_hour
    if payload.is_company_driver is not None:
        worker.is_company_driver = payload.is_company_driver
    if payload.assigned_vehicle_number is not None:
        worker.assigned_vehicle_number = payload.assigned_vehicle_number.strip() if payload.assigned_vehicle_number else None
    if payload.is_active is not None:
        worker.is_active = payload.is_active
        changes["is_active"] = worker.is_active
    if payload.notes is not None:
        worker.notes = payload.notes
    
    # Audit trail
    log = AdminActivityLog(
        admin_id=current_admin.id,
        admin_username=current_admin.username,
        admin_role=current_admin.role,
        action="WORKER_UPDATED",
        target_type="worker",
        target_id=worker_id,
        target_name=worker.name,
        details=changes,
    )
    db.add(log)
    db.commit()
    return {"message": "Worker updated successfully"}


# --- Attendance & Hajri Endpoints ---

@router.get("/attendance")
def get_daily_attendance(
    target_date: Optional[date] = Query(None),
    role: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Retrieve full attendance list for target date with worker info in a single fast query."""
    d = target_date or date.today()
    
    # 1. Fetch all active workers
    workers = db.query(Worker).filter(Worker.is_active == True).order_by(Worker.name.asc()).all()
    
    # 2. Fetch all existing attendance for this date (index seek)
    attendance_records = db.query(WorkerDailyAttendance).filter(WorkerDailyAttendance.date == d).all()
    att_map = {str(a.worker_id): a for a in attendance_records}
    
    summary = {"total": 0, "present": 0, "absent": 0, "half_day": 0, "overtime": 0, "other": 0}
    items = []
    
    for w in workers:
        if role and role not in (w.roles or []):
            continue
        
        w_id = str(w.id)
        att = att_map.get(w_id)
        
        status_val = att.status if att else None
        ot_minutes = att.ot_minutes if att else 0
        ot_amount = att.ot_amount if att else 0.0
        remarks = att.remarks if att else None
        marked_by = att.marked_by_admin_username if att else None
        
        summary["total"] += 1
        if status_val == "P":
            summary["present"] += 1
        elif status_val == "A":
            summary["absent"] += 1
        elif status_val == "HD":
            summary["half_day"] += 1
        elif status_val == "OT":
            summary["overtime"] += 1
        elif status_val is not None:
            summary["other"] += 1
            
        items.append({
            "worker_id": w_id,
            "worker_name": w.name,
            "phone": w.phone,
            "roles": w.roles or [],
            "base_wage": w.base_wage,
            "ot_rate_per_hour": w.ot_rate_per_hour,
            "is_company_driver": w.is_company_driver,
            "assigned_vehicle_number": w.assigned_vehicle_number,
            "status": status_val,
            "ot_minutes": ot_minutes,
            "ot_amount": ot_amount,
            "remarks": remarks,
            "marked_by_admin_username": marked_by,
        })
    
    return {
        "date": str(d),
        "summary": summary,
        "records": items,
    }


@router.post("/attendance/bulk")
def mark_bulk_attendance(
    payload: BulkAttendanceSchema,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Cloud SQL cost-saving bulk upsert: processes multiple worker attendance marks
    in a single atomic transaction instead of 30+ separate roundtrips."""
    d = payload.date
    if not payload.records:
        return {"message": "No records to update"}
    
    # Pre-fetch worker names for denormalization
    worker_ids = [uuid.UUID(r.worker_id) for r in payload.records]
    workers = db.query(Worker).filter(Worker.id.in_(worker_ids)).all()
    name_map = {str(w.id): w for w in workers}
    
    existing = db.query(WorkerDailyAttendance).filter(
        and_(WorkerDailyAttendance.date == d, WorkerDailyAttendance.worker_id.in_(worker_ids))
    ).all()
    existing_map = {str(e.worker_id): e for e in existing}
    
    for item in payload.records:
        w_obj = name_map.get(item.worker_id)
        if not w_obj:
            continue
        
        # Calculate OT amount if OT hours/minutes provided
        ot_amt = item.ot_amount
        if item.ot_minutes > 0 and ot_amt == 0.0 and w_obj.ot_rate_per_hour > 0:
            ot_amt = round((item.ot_minutes / 60.0) * w_obj.ot_rate_per_hour, 2)
        
        if item.worker_id in existing_map:
            # Update existing
            rec = existing_map[item.worker_id]
            rec.status = item.status
            rec.ot_minutes = item.ot_minutes
            rec.ot_amount = ot_amt
            rec.remarks = item.remarks
            rec.marked_by_admin_id = current_admin.id
            rec.marked_by_admin_username = current_admin.username
        else:
            # Insert new
            new_rec = WorkerDailyAttendance(
                worker_id=w_obj.id,
                worker_name=w_obj.name,
                date=d,
                status=item.status,
                ot_minutes=item.ot_minutes,
                ot_amount=ot_amt,
                remarks=item.remarks,
                marked_by_admin_id=current_admin.id,
                marked_by_admin_username=current_admin.username,
            )
            db.add(new_rec)
    
    # Audit log
    log = AdminActivityLog(
        admin_id=current_admin.id,
        admin_username=current_admin.username,
        admin_role=current_admin.role,
        action="BULK_ATTENDANCE_MARKED",
        target_type="attendance",
        target_name=str(d),
        details={"date": str(d), "count": len(payload.records)},
    )
    db.add(log)
    db.commit()
    return {"message": f"Successfully updated attendance for {len(payload.records)} workers on {d}"}


# --- Advances & Wage Settlement ---

@router.get("/advances")
def get_worker_advances(
    worker_id: Optional[str] = Query(None),
    unsettled_only: bool = Query(True),
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """List advances disbursed to workers with audit stamps."""
    query = db.query(WorkerAdvance)
    if worker_id:
        try:
            query = query.filter(WorkerAdvance.worker_id == uuid.UUID(worker_id))
        except Exception:
            pass
    if unsettled_only:
        query = query.filter(WorkerAdvance.is_settled == False)
        
    records = query.order_by(WorkerAdvance.date.desc(), WorkerAdvance.created_at.desc()).limit(100).all()
    
    return {
        "advances": [
            {
                "id": str(r.id),
                "worker_id": str(r.worker_id),
                "worker_name": r.worker_name,
                "date": str(r.date),
                "amount": r.amount,
                "payment_mode": r.payment_mode,
                "remarks": r.remarks,
                "is_settled": r.is_settled,
                "approved_by_admin_username": r.approved_by_admin_username,
            }
            for r in records
        ]
    }


@router.post("/advances")
def add_worker_advance(
    payload: AdvanceCreateSchema,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Disburse advance to worker, attribute approver, and optionally record in Petty Cash."""
    try:
        w_uuid = uuid.UUID(payload.worker_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid worker ID")
        
    worker = db.query(Worker).filter(Worker.id == w_uuid).first()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
        
    adv = WorkerAdvance(
        worker_id=worker.id,
        worker_name=worker.name,
        date=payload.date,
        amount=payload.amount,
        payment_mode=payload.payment_mode,
        remarks=payload.remarks,
        approved_by_admin_id=current_admin.id,
        approved_by_admin_username=current_admin.username,
    )
    db.add(adv)
    
    # Auto-reflect in Petty Cash OUT if requested
    if payload.record_in_petty_cash:
        cash_entry = PettyCashBook(
            date=payload.date,
            transaction_type="OUT",
            amount=payload.amount,
            category="wage_advance",
            payment_mode=payload.payment_mode,
            notes=f"Advance to {worker.name}: {payload.remarks or ''}".strip(),
            logged_by_admin_id=current_admin.id,
            logged_by_admin_username=current_admin.username,
        )
        db.add(cash_entry)
        
    # Audit trail
    log = AdminActivityLog(
        admin_id=current_admin.id,
        admin_username=current_admin.username,
        admin_role=current_admin.role,
        action="ADVANCE_DISBURSED",
        target_type="worker_advance",
        target_name=worker.name,
        details={"worker_id": str(worker.id), "amount": payload.amount, "mode": payload.payment_mode},
    )
    db.add(log)
    db.commit()
    db.refresh(adv)
    return {"message": "Advance recorded successfully", "id": str(adv.id)}


@router.get("/{worker_id}/payroll")
def get_worker_payroll_summary(
    worker_id: str,
    month: Optional[str] = Query(None),  # "YYYY-MM"
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Compute monthly wage balance: Earned - Advance = Net Balance + WhatsApp Message generator."""
    try:
        w_uuid = uuid.UUID(worker_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid worker ID")
        
    worker = db.query(Worker).filter(Worker.id == w_uuid).first()
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
        
    target_month = month or datetime.now().strftime("%Y-%m")
    year_str, month_str = target_month.split("-")
    y, m = int(year_str), int(month_str)
    
    # Fetch attendance for this month
    attendance_list = db.query(WorkerDailyAttendance).filter(
        and_(
            WorkerDailyAttendance.worker_id == w_uuid,
            func.extract('year', WorkerDailyAttendance.date) == y,
            func.extract('month', WorkerDailyAttendance.date) == m,
        )
    ).order_by(WorkerDailyAttendance.date.asc()).all()
    
    # Counts
    p_count = 0
    a_count = 0
    hd_count = 0
    ot_count = 0
    p_half_count = 0
    double_count = 0
    pa_count = 0
    total_ot_amount = 0.0
    
    for a in attendance_list:
        if a.status == "P":
            p_count += 1
        elif a.status == "A":
            a_count += 1
        elif a.status == "HD":
            hd_count += 1
        elif a.status == "OT":
            ot_count += 1
        elif a.status == "P_HALF":
            p_half_count += 1
        elif a.status == "DOUBLE_DUTY":
            double_count += 1
        elif a.status == "PA":
            pa_count += 1
        total_ot_amount += (a.ot_amount or 0.0)
        
    effective_days = p_count + (0.5 * hd_count) + (1.5 * p_half_count) + (2.0 * double_count) + pa_count
    base_earned = round(effective_days * worker.base_wage, 2)
    total_gross = round(base_earned + total_ot_amount, 2)
    
    # Advances in this month
    advances = db.query(WorkerAdvance).filter(
        and_(
            WorkerAdvance.worker_id == w_uuid,
            func.extract('year', WorkerAdvance.date) == y,
            func.extract('month', WorkerAdvance.date) == m,
        )
    ).all()
    total_advance = round(sum(adv.amount for adv in advances), 2)
    net_payable = round(total_gross - total_advance, 2)
    
    # Pre-formatted WhatsApp Payslip message (Tamil + English)
    whatsapp_text = (
        f"*Drop Cars - சம்பள அறிக்கை ({target_month})*\n"
        f"தொழிலாளி: *{worker.name}*\n"
        f"-----------------------------\n"
        f"• வேலை செய்த நாட்கள்: *{effective_days}* (P:{p_count}, HD:{hd_count})\n"
        f"• அடிப்படை கூலி: ₹{worker.base_wage}/நாள்\n"
        f"• மொத்த சம்பாத்தியம்: *₹{total_gross:,}* (OT: ₹{total_ot_amount:,})\n"
        f"• பெற்ற முன்பணம் (Advance): *₹{total_advance:,}*\n"
        f"-----------------------------\n"
        f"👉 *மீதி கொடுக்க வேண்டிய பாக்கி: ₹{net_payable:,}*\n\n"
        f"_Drop Cars நிர்வாகம் மூலம் கணக்கிடப்பட்டது._"
    )
    
    return {
        "worker": {
            "id": str(worker.id),
            "name": worker.name,
            "phone": worker.phone,
            "roles": worker.roles or [],
            "base_wage": worker.base_wage,
            "ot_rate_per_hour": worker.ot_rate_per_hour,
        },
        "month": target_month,
        "effective_days": effective_days,
        "counts": {
            "present": p_count,
            "absent": a_count,
            "half_day": hd_count,
            "overtime": ot_count,
            "one_and_half": p_half_count,
            "double_duty": double_count,
            "paid_leave": pa_count,
        },
        "base_earned": base_earned,
        "total_ot_amount": total_ot_amount,
        "total_gross_earned": total_gross,
        "total_advance_deduction": total_advance,
        "net_balance_payable": net_payable,
        "whatsapp_slip_text": whatsapp_text,
    }


# --- Cashbook & Petty Cash Endpoints ---

@router.get("/cashbook")
def get_cashbook(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Retrieve daily/monthly Cash In / Cash Out ledger with running balance."""
    start_d = date_from or date.today()
    end_d = date_to or start_d
    
    entries = db.query(PettyCashBook).filter(
        and_(PettyCashBook.date >= start_d, PettyCashBook.date <= end_d)
    ).order_by(PettyCashBook.date.desc(), PettyCashBook.created_at.desc()).all()
    
    # Compute totals
    total_in = round(sum(e.amount for e in entries if e.transaction_type == "IN"), 2)
    total_out = round(sum(e.amount for e in entries if e.transaction_type == "OUT"), 2)
    net_balance = round(total_in - total_out, 2)
    
    return {
        "date_from": str(start_d),
        "date_to": str(end_d),
        "total_cash_in": total_in,
        "total_cash_out": total_out,
        "net_cash_balance": net_balance,
        "entries": [
            {
                "id": str(e.id),
                "date": str(e.date),
                "type": e.transaction_type,
                "amount": e.amount,
                "category": e.category,
                "payment_mode": e.payment_mode,
                "notes": e.notes,
                "logged_by_admin_username": e.logged_by_admin_username,
            }
            for e in entries
        ],
    }


@router.post("/cashbook")
def add_cashbook_entry(
    payload: PettyCashCreateSchema,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Record a Cash In (+ வரவு) or Cash Out (− செலவு) entry."""
    entry = PettyCashBook(
        date=payload.date,
        transaction_type=payload.transaction_type.upper(),
        amount=payload.amount,
        category=payload.category,
        payment_mode=payload.payment_mode,
        notes=payload.notes,
        logged_by_admin_id=current_admin.id,
        logged_by_admin_username=current_admin.username,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {"message": "Cashbook entry logged successfully", "id": str(entry.id)}


# --- Offline-First Sync Batch Endpoint ---

@router.post("/sync-offline-batch")
def sync_offline_batch(
    payload: OfflineSyncBatchSchema,
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Unified Offline-First Synchronization Endpoint:
    Processes all offline-queued attendance marks, advances, and petty cash transactions
    in a single atomic transaction. Saves massive Cloud Run & Cloud SQL bill costs."""
    synced_counts = {"attendance": 0, "advances": 0, "cashbook": 0}
    
    # 1. Sync Attendance
    if payload.attendance_records:
        for rec in payload.attendance_records:
            try:
                w_id = uuid.UUID(rec["worker_id"])
                d_obj = datetime.strptime(rec["date"], "%Y-%m-%d").date()
                w_obj = db.query(Worker).filter(Worker.id == w_id).first()
                if not w_obj:
                    continue
                
                existing = db.query(WorkerDailyAttendance).filter(
                    and_(WorkerDailyAttendance.worker_id == w_id, WorkerDailyAttendance.date == d_obj)
                ).first()
                
                if existing:
                    existing.status = rec["status"]
                    existing.ot_minutes = rec.get("ot_minutes", 0)
                    existing.ot_amount = rec.get("ot_amount", 0.0)
                    existing.remarks = rec.get("remarks")
                    existing.marked_by_admin_id = current_admin.id
                    existing.marked_by_admin_username = current_admin.username
                else:
                    new_att = WorkerDailyAttendance(
                        worker_id=w_id,
                        worker_name=w_obj.name,
                        date=d_obj,
                        status=rec["status"],
                        ot_minutes=rec.get("ot_minutes", 0),
                        ot_amount=rec.get("ot_amount", 0.0),
                        remarks=rec.get("remarks"),
                        marked_by_admin_id=current_admin.id,
                        marked_by_admin_username=current_admin.username,
                    )
                    db.add(new_att)
                synced_counts["attendance"] += 1
            except Exception:
                continue
                
    # 2. Sync Advances
    if payload.advances:
        for adv_data in payload.advances:
            try:
                w_id = uuid.UUID(adv_data["worker_id"])
                d_obj = datetime.strptime(adv_data["date"], "%Y-%m-%d").date()
                w_obj = db.query(Worker).filter(Worker.id == w_id).first()
                if not w_obj:
                    continue
                new_adv = WorkerAdvance(
                    worker_id=w_id,
                    worker_name=w_obj.name,
                    date=d_obj,
                    amount=float(adv_data["amount"]),
                    payment_mode=adv_data.get("payment_mode", "cash"),
                    remarks=adv_data.get("remarks"),
                    approved_by_admin_id=current_admin.id,
                    approved_by_admin_username=current_admin.username,
                )
                db.add(new_adv)
                synced_counts["advances"] += 1
            except Exception:
                continue
                
    # 3. Sync Cashbook
    if payload.cashbook_entries:
        for cb in payload.cashbook_entries:
            try:
                d_obj = datetime.strptime(cb["date"], "%Y-%m-%d").date()
                entry = PettyCashBook(
                    date=d_obj,
                    transaction_type=cb["transaction_type"].upper(),
                    amount=float(cb["amount"]),
                    category=cb.get("category", "other"),
                    payment_mode=cb.get("payment_mode", "cash"),
                    notes=cb.get("notes"),
                    logged_by_admin_id=current_admin.id,
                    logged_by_admin_username=current_admin.username,
                )
                db.add(entry)
                synced_counts["cashbook"] += 1
            except Exception:
                continue
                
    db.commit()
    return {"message": "Offline batch synchronized successfully", "synced": synced_counts}


# --- Owner Live Audit Stream Endpoint ---

@router.get("/audit-trail")
def get_team_audit_trail(
    limit: int = Query(50, le=100),
    db: Session = Depends(get_db),
    current_admin: Admin = Depends(get_current_admin),
):
    """Owner stream showing 'Who Did What': real-time log of staff actions."""
    logs = db.query(AdminActivityLog).order_by(AdminActivityLog.created_at.desc()).limit(limit).all()
    return {
        "logs": [
            {
                "id": str(l.id),
                "admin_username": l.admin_username,
                "admin_role": l.admin_role,
                "action": l.action,
                "target_type": l.target_type,
                "target_name": l.target_name,
                "details": l.details,
                "created_at": str(l.created_at),
            }
            for l in logs
        ]
    }
