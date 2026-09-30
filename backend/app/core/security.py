import os
import uuid
from dotenv import load_dotenv
load_dotenv()
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.database.session import get_db

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError(
        "JWT_SECRET_KEY environment variable is not set. "
        "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(64))\""
    )
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))  # default 24 hours

# Driver tokens: 6-month session (was the old 24h default, which was the
# real, currently-live cause of drivers being forced back to password
# login roughly once a day - app/quick-dashboard.tsx's isJWTExpired check
# fires on any restart after the old 24h expiry). 6 months is a deliberate
# dial-back from an earlier fully-permanent (10yr) version of this fix -
# still far longer than any normal usage gap, while keeping a real
# periodic re-auth for a lost/stolen device. Security safety net
# independent of this expiry: `token_version` (already embedded in every
# driver token + checked on every request via verify_toke_driver) lets an
# Owner/admin force-logout a specific driver instantly at any time.
ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24 * 30 * 6)))  # 6 months
DRIVER_ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("DRIVER_ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24 * 30 * 6)))  # 6 months

# Same fix, same root cause, for the OTHER two mobile-app sessions that were
# still silently on the 24h default above - fleet Owner (vehicle_owner.py's
# /users/vehicle-owner/signin) and Vendor (vendor.py's signup/signin). The
# Driver App is used by fleet owners constantly (Duty tab, Wallet, dashboard
# all run on the owner token via axiosInstance.tsx) - the driver-side fix
# never touched this, so owners kept hitting the exact "logged out ~daily"
# bug the driver fix was written for. Found 2026-09-05 chasing a live
# "Driver App adikkadi session expired" report. Same safety net applies:
# token_version is already embedded + checked on every request for both, so
# an admin can still force-logout a specific owner/vendor instantly.
OWNER_ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("OWNER_ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24 * 30 * 6)))  # 6 months
VENDOR_ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("VENDOR_ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24 * 30 * 6)))  # 6 months

# Same "permanent until logout" treatment for Customer App sessions issued
# via the hybrid auth flows (Google/Phone - see api/routes/hybrid_auth.py).
# The existing password-based /users/customer/signin flow is untouched -
# only Google/Phone-issued tokens use this, so nothing about existing
# email+password customer sessions changes.
CUSTOMER_ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("CUSTOMER_ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24 * 365 * 10)))  # 10 years

security = HTTPBearer()

def get_password_hash(password):
    return pwd_context.hash(password)

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(token: str):
    """Verify JWT token and return payload"""
    from app.crud.vehicle_owner import get_vehicle_owner_credentails_by_id
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
def verify_token_vehicle_owner_end(token: str, db: Session):
    """Verify JWT token and return payload"""
    from app.crud.vehicle_owner import get_vehicle_owner_credentails_by_id
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        token_version = payload.get("token_version")
        print(token_version)
        vehcile_owner_verify = get_vehicle_owner_credentails_by_id(db, user_id)
        if vehcile_owner_verify is None:
            from app.crud.vendor import get_vendor_by_id
            vehcile_owner_verify = get_vendor_by_id(db, user_id)
        # Token may belong to a driver/other role or a deleted account -
        # that is a 401, not a crash (was: NoneType.token_version -> 500).
        if vehcile_owner_verify is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not a fleet owner session",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if (token_version or 0) != (getattr(vehcile_owner_verify, "token_version", 0) or 0):
            raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Force Logout Action Raised",
            headers={"WWW-Authenticate": "Bearer"},
            )
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
def verify_token_vendor_endpoint(token: str):
    """Verify JWT token and return payload"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
def verify_token_admin(token: str):
    """Verify JWT token and return payload"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

def verify_toke_driver(token: str,db: Session):
    from app.crud.car_driver import get_driver_by_id
    """Verify JWT token and return payload"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        token_version = payload.get("token_version")
        driver_cred = get_driver_by_id(db, user_id)
        # Token belongs to a non-driver or a deleted driver -> 401, not a crash.
        if driver_cred is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not a driver session",
                headers={"WWW-Authenticate": "Bearer"},
            )
        # Treat missing token_version as 0 on BOTH sides so a null in either
        # place (legacy token / legacy row) does not spuriously force logout.
        if (token_version or 0) != (getattr(driver_cred, "token_version", 0) or 0):
            raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Force Logout Action Raised",
            headers={"WWW-Authenticate": "Bearer"},
            )
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
def get_current_user_sub(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = verify_token(token)
        sub: str = payload.get("sub")
        user: str = payload.get("user")
        
        if sub is None:
            raise HTTPException(status_code=401, detail="Invalid JWT payload")
        return sub,user
    except JWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    """Get current authenticated fleet owner from token"""
    # Import here to avoid circular import
    from app.crud.vehicle_owner import get_vehicle_owner_by_id
    from app.crud.vendor import get_vendor_by_id
    
    token = credentials.credentials
    payload = verify_token(token)
    user_id = payload.get("sub")
    
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # get_vehicle_owner_by_id/get_vendor_by_id both compare user_id against a
    # UUID-typed column - a wrong-role token (e.g. a customer token, whose
    # `sub` is that customer's phone number, not a UUID) hitting a route that
    # depends on this function used to blow through as a raw 500
    # (psycopg2 "invalid input syntax for type uuid") instead of a clean 401.
    # Found 2026-09-04 chasing a recurring Cloud Run error on
    # /vehicle_owner/pending. Validate the shape first so any mismatched
    # token cleanly 401s here, before ever reaching the database.
    try:
        uuid.UUID(str(user_id))
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Get user from database (vehicle_owner or vendor)
    user = get_vehicle_owner_by_id(db, user_id)
    if user is None:
        user = get_vendor_by_id(db, user_id)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return user

def get_current_vendor(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    """Get current authenticated vendor from token"""
    # Import here to avoid circular import
    from app.crud.vendor import get_vendor_by_id
    
    token = credentials.credentials
    payload = verify_token_vendor_endpoint(token)
    vendor_id = payload.get("sub")
    token_version = payload.get("token_version")
    # print("Check token version",token_version)
    
    if vendor_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Get vendor from database
    vendor = get_vendor_by_id(db, vendor_id)
    # Was checking vendor.token_version BEFORE this None check - found
    # 2026-09-04 during a broader bug sweep. A token whose vendor_id no
    # longer exists (deleted account, or any malformed/stale sub) raised a
    # raw AttributeError ('NoneType' has no attribute 'token_version')
    # instead of ever reaching the clean 401 a few lines below - same
    # "dead code after a crash" bug class as several other fixes this
    # session, just from a check-ordering mistake instead of route order.
    if vendor is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Vendor not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if token_version != vendor.token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Force Logout Action Raised",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return vendor

def get_current_customer(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    """Get current authenticated customer from token"""
    from app.crud.customer import get_customer_by_id

    token = credentials.credentials
    payload = verify_token_vendor_endpoint(token)
    customer_id = payload.get("sub")
    token_version = payload.get("token_version")

    if customer_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    customer = get_customer_by_id(db, customer_id)
    if customer is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Customer not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if token_version != customer.token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Force Logout Action Raised",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return customer

def get_current_vehicleOwner_id(credentials: HTTPAuthorizationCredentials = Depends(security),  db: Session = Depends(get_db)) -> str:
    token = credentials.credentials
    payload = verify_token_vehicle_owner_end(token,db)
    return payload.get("sub")  # This should be the vehicle_owner_id

def get_current_driver(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    """Get current authenticated driver from token"""
    # Import here to avoid circular import
    from app.crud.car_driver import get_driver_by_id
    
    token = credentials.credentials
    payload = verify_toke_driver(token,db)
    driver_id = payload.get("sub")
    
    if driver_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Get driver from database
    driver = get_driver_by_id(db, driver_id)
    if driver is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Driver not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return driver

def get_current_driver_id(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    token = credentials.credentials
    payload = verify_token(token)
    return payload.get("sub")  # This should be the driver_id

def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    """Get current authenticated admin from token"""
    # Import here to avoid circular import
    from app.crud.admin import get_admin_by_id
    
    token = credentials.credentials
    payload = verify_token_admin(token)
    admin_id = payload.get("sub")
    
    if admin_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Get admin from database
    admin = get_admin_by_id(db, admin_id)
    if admin is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Force-logout support: token must carry the admin's current token_version
    token_version = payload.get("token_version") or 1
    admin_token_version = getattr(admin, "token_version", 1) or 1
    if token_version != admin_token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Force Logout Action Raised",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return admin


def get_current_user_flexible(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)) -> dict:
    """
    Accepts a session token from any Drop Cars app (customer, driver, fleet
    driver / vehicle owner, vendor, admin).

    Returns {"user_id", "role", "payload"} where role is one of CUSTOMER,
    DRIVER, VEHICLE_OWNER, VENDOR, ADMIN. The role comes from the token's
    "user" claim and the account must still exist with a matching
    token_version, so force-logout is honoured here too. Unknown or missing
    roles are rejected instead of silently becoming CUSTOMER.
    """
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise unauthorized

    user_id = payload.get("sub")
    claim = str(payload.get("user") or payload.get("role") or "").strip().lower()
    if not user_id or not claim:
        raise unauthorized

    from app.models.admin import Admin
    from app.models.car_driver import CarDriver
    from app.models.customer import CustomerCredentials
    from app.models.vehicle_owner import VehicleOwnerCredentials
    from app.models.vendor import VendorCredentials

    # claim -> (role, model, default token_version when the column is null)
    role_map = {
        "customer": ("CUSTOMER", CustomerCredentials, 1),
        "driver": ("DRIVER", CarDriver, 0),
        "vehicle_owner": ("VEHICLE_OWNER", VehicleOwnerCredentials, 0),
        "vendor": ("VENDOR", VendorCredentials, 0),
        "admin": ("ADMIN", Admin, 1),
    }
    if claim not in role_map:
        raise unauthorized
    role, model, default_version = role_map[claim]

    try:
        account = db.query(model).filter(model.id == user_id).first()
    except Exception:
        db.rollback()
        account = None
    if account is None:
        raise unauthorized

    token_version = payload.get("token_version")
    if token_version is None:
        token_version = default_version
    if token_version != (getattr(account, "token_version", None) or default_version):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Force Logout Action Raised",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return {"user_id": str(user_id), "role": role, "payload": payload}
