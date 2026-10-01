from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.schemas.customer import (
    CustomerSignup, CustomerSignin, CustomerOut, CustomerTokenResponse, SavedAddressesUpdate,
)
from app.crud.customer import (
    create_customer, authenticate_customer, get_customer_details_by_customer_id,
)
from app.core.security import create_access_token, get_current_customer
from app.database.session import get_db

router = APIRouter()


def _build_customer_out(credentials, details) -> CustomerOut:
    return CustomerOut(
        id=credentials.id,
        full_name=details.full_name,
        primary_number=details.primary_number,
        email=credentials.email,
        created_at=details.created_at,
    )


@router.post("/customer/signup", response_model=CustomerTokenResponse, status_code=status.HTTP_201_CREATED)
def customer_signup(body: CustomerSignup, db: Session = Depends(get_db)):
    credentials, details = create_customer(db, body)
    access_token = create_access_token({
        "sub": str(credentials.id),
        "token_version": credentials.token_version,
        "user": "customer",
    })
    return CustomerTokenResponse(access_token=access_token, customer=_build_customer_out(credentials, details))


@router.post("/customer/signin", response_model=CustomerTokenResponse)
def customer_signin(body: CustomerSignin, db: Session = Depends(get_db)):
    from app.crud.customer import get_customer_by_primary_number
    existing = get_customer_by_primary_number(db, body.primary_number)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NOT_REGISTERED")

    credentials = authenticate_customer(db, body.primary_number, body.password)
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password. Please try again.")

    details = get_customer_details_by_customer_id(db, str(credentials.id))
    if not details:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer details not found")

    access_token = create_access_token({
        "sub": str(credentials.id),
        "token_version": credentials.token_version,
        "user": "customer",
    })
    return CustomerTokenResponse(access_token=access_token, customer=_build_customer_out(credentials, details))


@router.get("/customer/me", response_model=CustomerOut)
def get_my_customer_profile(
    db: Session = Depends(get_db),
    current_customer=Depends(get_current_customer),
):
    details = get_customer_details_by_customer_id(db, str(current_customer.id))
    if not details:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer details not found")
    return _build_customer_out(current_customer, details)


@router.put("/customer/me/addresses")
def update_saved_addresses(
    body: SavedAddressesUpdate,
    db: Session = Depends(get_db),
    current_customer=Depends(get_current_customer),
):
    details = get_customer_details_by_customer_id(db, str(current_customer.id))
    if not details:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer details not found")
    details.saved_addresses = [addr.dict() for addr in body.saved_addresses]
    db.add(details)
    db.commit()
    return {"saved_addresses": details.saved_addresses}
