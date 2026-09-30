# crud/admin.py
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.admin import Admin
from typing import Optional
from app.core.security import get_password_hash, verify_password
# from app.models.vehicle_owner import VehicleOwner
import uuid

def get_admin_by_id(db: Session, admin_id: str):
    """Get admin by ID"""
    return db.query(Admin).filter(
        Admin.id == admin_id
    ).first()

def get_admin_by_username(db: Session, username: str):
    """Get admin by username"""
    return db.query(Admin).filter(
        Admin.username == username
    ).first()

def get_admin_by_phone(db: Session, phone: str):
    """Get admin by phone number"""
    return db.query(Admin).filter(
        Admin.phone == phone
    ).first()

def get_admin_by_email(db: Session, email: str):
    """Get admin by email address"""
    return db.query(Admin).filter(
        Admin.email == email
    ).first()

def create_admin(db: Session, username: str, hashed_password: str, role: str, email: str, phone: str, permissions: Optional[list] = None):
    """Create a new admin"""
    admin = Admin(
        username=username,
        password=hashed_password,
        role=role,
        email=email,
        phone=phone,
        permissions=permissions or [],
    )
    
    try:
        db.add(admin)
        db.commit()
        db.refresh(admin)
        return admin
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create admin: {str(e)}"
        )

def authenticate_admin(db: Session, username: str, password: str):
    """Authenticate admin with username, email, or phone and password"""
    from app.core.security import verify_password
    
    clean_identifier = username.strip() if username else ""
    admin = (
        get_admin_by_username(db, clean_identifier) 
        or get_admin_by_email(db, clean_identifier) 
        or get_admin_by_phone(db, clean_identifier)
    )
    
    if not admin or not verify_password(password, admin.password):
        return None
    
    return admin

def get_all_admins(db: Session, skip: int = 0, limit: int = 100):
    """Get all admins with pagination"""
    admins = db.query(Admin).offset(skip).limit(limit).all()
    total_count = db.query(Admin).count()
    return admins, total_count

def update_admin(db: Session, admin_id: str, **kwargs):
    """Update admin details"""
    admin = get_admin_by_id(db, admin_id)
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Admin not found"
        )
    
    try:
        for key, value in kwargs.items():
            if hasattr(admin, key):
                setattr(admin, key, value)
        
        db.commit()
        db.refresh(admin)
        return admin
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update admin: {str(e)}"
        )

def delete_admin(db: Session, admin_id: str):
    """Delete admin"""
    admin = get_admin_by_id(db, admin_id)
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Admin not found"
        )
    
    try:
        db.delete(admin)
        db.commit()
        return {"message": "Admin deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete admin: {str(e)}"
        )

def get_user_by_primary_number(db: Session, role: str, primary_number: str):
    """Get user by primary number and role"""
    if role == "VehicleOwner":
        from app.models.vehicle_owner import VehicleOwnerCredentials
        from app.models.vehicle_owner_details import VehicleOwnerDetails
        data = db.query(VehicleOwnerCredentials).filter(
            VehicleOwnerCredentials.primary_number == primary_number
        ).first()
        user_details = db.query(VehicleOwnerDetails).filter(
            VehicleOwnerDetails.vehicle_owner_id == data.id
        ).first()
        return {
            "id": data.id,
            "full_name": user_details.full_name,
            "role" : "Driver",
            "account_status": data.account_status.value,
            "primary_number": data.primary_number,
            "created_at": data.created_at
        }
    elif role == "Driver":
        from app.models.car_driver import CarDriver
        data = db.query(CarDriver).filter(
            CarDriver.primary_number == primary_number
        ).first()
        return {
            "id": data.id,
            "full_name": data.full_name,
            "role" : "Quick Driver",
            "account_status": data.driver_status.value,
            "primary_number": data.primary_number,
            "created_at": data.created_at
        }
        
    elif role == "Vendor":
        from app.models.vendor import VendorCredentials
        from app.models.vendor_details import VendorDetails
        data =  db.query(VendorCredentials).filter(
            VendorCredentials.primary_number == primary_number
        ).first()
        user_details = db.query(VendorDetails).filter(
            VendorDetails.vendor_id == data.id
        ).first()
        return {
            "id": data.id,
            "full_name": user_details.full_name,
            "role" : "Vendor",
            "account_status": data.account_status.value,
            "primary_number": data.primary_number,
            "created_at": data.created_at
        }
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid role specified"
        )
        
        
        
# def reset_password_by_id(db: Session, role: str, id: str, password : str):
#     """Get user by primary number and role"""
#     if role == "Driver":
#         from app.models.vehicle_owner import VehicleOwnerCredentials
#         from app.models.vehicle_owner_details import VehicleOwnerDetails
#         data = db.query(VehicleOwnerCredentials).filter(
#             VehicleOwnerCredentials.primary_number == id
#         ).first()
#         user_details = db.query(VehicleOwnerDetails).filter(
#             VehicleOwnerDetails.vehicle_owner_id == data.id
#         ).first()
#         return {
#             "id": data.id,
#             "full_name": user_details.full_name,
#             "role" : "Driver",
#             "account_status": data.account_status.value,
#             "primary_number": data.primary_number,
#             "created_at": data.created_at
#         }
#     elif role == "Quick Driver":
#         from app.models.car_driver import CarDriver
#         data = db.query(CarDriver).filter(
#             CarDriver.id == id
#         ).first()
#         return {
#             "id": data.id,
#             "full_name": data.full_name,
#             "role" : "Quick Driver",
#             "account_status": data.driver_status.value,
#             "primary_number": data.primary_number,
#             "created_at": data.created_at
#         }
        
#     elif role == "Vendor":
#         from app.models.vendor import VendorCredentials
#         data =  db.query(VendorCredentials).filter(
#             VendorCredentials.id == id
#         ).first()
#         return {
#             "id": data.id,
#             "full_name": user_details.full_name,
#             "role" : "Vendor",
#             "account_status": data.account_status.value,
#             "primary_number": data.primary_number,
#             "created_at": data.created_at
#         }
#     else:
#         raise HTTPException(
#             status_code=status.HTTP_400_BAD_REQUEST,
#             detail="Invalid role specified"
#         )


def reset_password_by_id(db: Session, role: str, id: str, password: str):
    hashed_password = get_password_hash(password)

    if role == "Driver":
        from app.models.vehicle_owner import VehicleOwnerCredentials

        user = db.query(VehicleOwnerCredentials).filter(
            VehicleOwnerCredentials.id == id
        ).first()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Driver not found"
            )

        user.hashed_password = hashed_password
        db.commit()
        db.refresh(user)

        return {"message": "Password reset successfully", "role": "Driver"}

    elif role == "Quick Driver":
        from app.models.car_driver import CarDriver

        user = db.query(CarDriver).filter(
            CarDriver.id == id
        ).first()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Quick Driver not found"
            )

        user.hashed_password = hashed_password
        db.commit()
        db.refresh(user)

        return {"message": "Password reset successfully", "role": "Quick Driver"}

    elif role == "Vendor":
        from app.models.vendor import VendorCredentials

        user = db.query(VendorCredentials).filter(
            VendorCredentials.id == id
        ).first()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Vendor not found"
            )

        user.hashed_password = hashed_password
        db.commit()
        db.refresh(user)

        return {"message": "Password reset successfully", "role": "Vendor"}

    elif role == "Customer":
        from app.models.customer import CustomerCredentials

        user = db.query(CustomerCredentials).filter(
            CustomerCredentials.id == id
        ).first()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Customer not found"
            )

        user.hashed_password = hashed_password
        db.commit()
        db.refresh(user)

        return {"message": "Password reset successfully", "role": "Customer"}

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid role specified"
        )