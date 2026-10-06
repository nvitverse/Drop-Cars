# app/api/routes/unified_google_auth.py
"""
Centralized Multi-Platform Google OAuth 2.0 & OIDC Authentication Endpoint.

Supports all client platforms (Web, Admin, Mobile Apps) and roles:
- CUSTOMER (Rider / Customer)
- DRIVER (Car Driver)
- VEHICLE_OWNER / VENDOR (Fleet Owners & Vendors)
- ADMIN (Owner / Staff Admin)
"""
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status, Header
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.core.security import (
    create_access_token,
    CUSTOMER_ACCESS_TOKEN_EXPIRE_MINUTES,
    DRIVER_ACCESS_TOKEN_EXPIRE_MINUTES,
    OWNER_ACCESS_TOKEN_EXPIRE_MINUTES,
    ACCESS_TOKEN_EXPIRE_MINUTES,
)
from app.utils.google_signin import (
    verify_google_id_token,
    GoogleAuthNotConfigured,
    InvalidGoogleToken,
)

# Models & CRUDs
from app.crud.customer import (
    find_or_create_customer_by_google,
    get_customer_by_email,
)
from app.models.admin import Admin
from app.models.car_driver import CarDriver
from app.models.vehicle_owner import VehicleOwnerCredentials as VehicleOwner
from app.models.vendor import VendorCredentials as Vendor

router = APIRouter()


class UnifiedGoogleAuthRequest(BaseModel):
    id_token: str = Field(..., description="Google ID Token (JWT) retrieved by frontend SDK")
    role: str = Field(default="CUSTOMER", description="Target role: CUSTOMER, DRIVER, OWNER, VENDOR, ADMIN")
    full_name_fallback: Optional[str] = Field(default="Drop Cars User", description="Fallback name if not in Google profile")


class UserProfileOut(BaseModel):
    id: str
    email: str
    full_name: Optional[str] = None
    role: str
    avatar_url: Optional[str] = None
    permissions: Optional[List[str]] = None
    organization_id: Optional[str] = None


class UnifiedAuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user: UserProfileOut
    raw_profile: Optional[Dict[str, Any]] = None


@router.post("/auth/google", response_model=UnifiedAuthResponse)
@router.post("/v1/auth/google", response_model=UnifiedAuthResponse)
def unified_google_auth(
    body: UnifiedGoogleAuthRequest,
    db: Session = Depends(get_db)
):
    """
    Centralized endpoint to authenticate Google users across all Drop Cars platforms.
    """
    # 1. Verify Google ID Token
    try:
        payload = verify_google_id_token(body.id_token)
    except GoogleAuthNotConfigured as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Google Authentication is not configured: {str(e)}"
        )
    except InvalidGoogleToken as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Google Authentication credentials: {str(e)}"
        )

    google_sub = payload.get("sub")
    email = (payload.get("email") or "").strip().lower()
    name = payload.get("name") or body.full_name_fallback or "Drop Cars User"
    picture = payload.get("picture")
    requested_role = (body.role or "CUSTOMER").strip().upper()

    # -------------------------------------------------------------------------
    # 2. ROLE-BASED AUTHENTICATION & ACCOUNT LINKING
    # -------------------------------------------------------------------------

    # Case A: ADMIN / STAFF LOGIN
    if requested_role in ["ADMIN", "OWNER", "STAFF"]:
        admin = db.query(Admin).filter(Admin.email.ilike(email)).first()
        if not admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: No Admin account found with email '{email}'. Please contact your Organization Owner."
            )

        # Issue Admin Token
        token_data = {
            "sub": str(admin.id),
            "username": admin.username,
            "email": admin.email,
            "role": admin.role or "Owner",
            "permissions": admin.permissions or [],
            "token_version": admin.token_version,
            "user": "admin",
        }
        access_token = create_access_token(
            token_data,
            expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        )

        return UnifiedAuthResponse(
            access_token=access_token,
            role=admin.role or "Owner",
            user=UserProfileOut(
                id=str(admin.id),
                email=admin.email,
                full_name=admin.username or name,
                role=admin.role or "Owner",
                avatar_url=picture,
                permissions=admin.permissions or [],
                organization_id=str(admin.organization_id) if admin.organization_id else None,
            ),
            raw_profile=payload,
        )

    # Case B: DRIVER LOGIN
    elif requested_role == "DRIVER":
        driver = db.query(CarDriver).filter(CarDriver.email.ilike(email)).first()
        if not driver:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Driver account with email '{email}' not found. Please register as a driver first."
            )

        token_data = {
            "sub": str(driver.id),
            "driver_name": driver.driver_name,
            "token_version": driver.token_version,
            "user": "driver",
            "role": "DRIVER",
        }
        access_token = create_access_token(
            token_data,
            expires_delta=timedelta(minutes=DRIVER_ACCESS_TOKEN_EXPIRE_MINUTES)
        )

        return UnifiedAuthResponse(
            access_token=access_token,
            role="DRIVER",
            user=UserProfileOut(
                id=str(driver.id),
                email=driver.email or email,
                full_name=driver.driver_name or name,
                role="DRIVER",
                avatar_url=picture,
            ),
            raw_profile=payload,
        )

    # Case C: FLEET OWNER / VENDOR LOGIN
    elif requested_role in ["OWNER", "VEHICLE_OWNER", "VENDOR"]:
        owner = db.query(VehicleOwner).filter(VehicleOwner.email.ilike(email)).first()
        if not owner:
            # Check Vendor table
            vendor = db.query(Vendor).filter(Vendor.email.ilike(email)).first()
            if not vendor:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Fleet Owner/Vendor account with email '{email}' not found."
                )
            user_id = str(vendor.id)
            user_name = vendor.owner_name or name
            token_version = getattr(vendor, "token_version", 1)
            role_title = "VENDOR"
        else:
            user_id = str(owner.id)
            user_name = owner.owner_name or name
            token_version = getattr(owner, "token_version", 1)
            role_title = "OWNER"

        token_data = {
            "sub": user_id,
            "token_version": token_version,
            "user": "vehicle_owner",
            "role": role_title,
        }
        access_token = create_access_token(
            token_data,
            expires_delta=timedelta(minutes=OWNER_ACCESS_TOKEN_EXPIRE_MINUTES)
        )

        return UnifiedAuthResponse(
            access_token=access_token,
            role=role_title,
            user=UserProfileOut(
                id=user_id,
                email=email,
                full_name=user_name,
                role=role_title,
                avatar_url=picture,
            ),
            raw_profile=payload,
        )

    # Case D: CUSTOMER / RIDER LOGIN (Default)
    else:
        credentials, details = find_or_create_customer_by_google(
            db,
            google_sub=google_sub,
            email=email,
            full_name=name,
        )

        token_data = {
            "sub": str(credentials.id),
            "token_version": credentials.token_version,
            "user": "customer",
            "role": "CUSTOMER",
        }
        access_token = create_access_token(
            token_data,
            expires_delta=timedelta(minutes=CUSTOMER_ACCESS_TOKEN_EXPIRE_MINUTES)
        )

        return UnifiedAuthResponse(
            access_token=access_token,
            role="CUSTOMER",
            user=UserProfileOut(
                id=str(credentials.id),
                email=credentials.email or email,
                full_name=details.full_name or name,
                role="CUSTOMER",
                avatar_url=picture,
            ),
            raw_profile=payload,
        )
