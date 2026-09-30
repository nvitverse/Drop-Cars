# from fastapi import APIRouter, Depends, HTTPException
# from sqlalchemy.orm import Session
# from app.schemas.car_driver import UserCreate, UserLogin
# from app.crud.driver import create_user, authenticate_user
# from app.core.security import create_access_token
# from app.database.session import get_db

# router = APIRouter()

# @router.post("/driver/signup")
# def signup(user: UserCreate, db: Session = Depends(get_db)):
#     db_user = create_user(db, user)
#     return {"msg": "User created successfully", "user": db_user.id}

# @router.post("/driver/login")
# def login(user: UserLogin, db: Session = Depends(get_db)):
#     db_user = authenticate_user(db, user.mobile_number, user.password)
#     if not db_user:
#         raise HTTPException(status_code=400, detail="Invalid credentials")
#     access_token = create_access_token({"sub": str(db_user.id)})
#     return {"access_token": access_token, "token_type": "bearer"}
