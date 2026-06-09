import os
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr, field_validator, model_validator
import bcrypt
from jose import JWTError, jwt

from backend.storage.json_storage import JsonStorage
from backend.entities.user import Seller, Buyer, Admin
from backend.api.dependencies import get_storage

# ---------------------------------------------------------------------------
# Router & Security Config
# ---------------------------------------------------------------------------
router = APIRouter()


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

import logging as _logging
_logger = _logging.getLogger("jhutlink.auth")

SECRET_KEY = os.environ.get("JWT_SECRET", "jhutlink-dev-secret")
if SECRET_KEY == "jhutlink-dev-secret":
    _logger.warning("JWT_SECRET not set. Using insecure default. Set JWT_SECRET env var in production.")
ALGORITHM = "HS256"


# ---------------------------------------------------------------------------
# Pydantic Request Models
# ---------------------------------------------------------------------------
class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str
    trade_license: Optional[str] = None
    department: Optional[str] = None

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str):
        allowed_roles = {"seller", "buyer", "admin"}
        if v.lower() not in allowed_roles:
            raise ValueError(f"Role must be one of {allowed_roles}")
        return v.lower()

    @model_validator(mode="after")
    def validate_role_fields(self):
        if self.role == "seller" and not self.trade_license:
            raise ValueError("trade_license is required for seller role")
        if self.role == "admin" and not self.department:
            raise ValueError("department is required for admin role")
        return self


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(hours=24)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id_str: str = payload.get("sub")
        role: str = payload.get("role")
        if user_id_str is None or role is None:
            raise credentials_exception
        return {"sub": user_id_str, "role": role}
    except JWTError:
        raise credentials_exception


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(request: RegisterRequest, storage: JsonStorage = Depends(get_storage)):
    users = storage.load_users()
    
    # Check email uniqueness
    if any(u.email == request.email for u in users):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered"
        )
        
    hashed_pwd = hash_password(request.password)
    
    # Instantiate the correct subclass
    if request.role == "seller":
        new_user = Seller(
            name=request.name,
            email=request.email,
            password_hash=hashed_pwd,
            trade_license=request.trade_license
        )
        new_user.activate()
    elif request.role == "buyer":
        new_user = Buyer(
            name=request.name,
            email=request.email,
            password_hash=hashed_pwd,
        )
    elif request.role == "admin":
        new_user = Admin(
            name=request.name,
            email=request.email,
            password_hash=hashed_pwd,
            department=request.department
        )
    else:
        raise HTTPException(status_code=400, detail="Invalid role")
        
    users.append(new_user)
    storage.save("users", users)
    
    return {
        "user_id": new_user.id,
        "name": new_user.name,
        "email": new_user.email,
        "role": new_user.role,
        "created_at": new_user.created_at.isoformat()
    }


@router.post("/login")
def login(request: LoginRequest, storage: JsonStorage = Depends(get_storage)):
    users = storage.load_users()
    
    user = next((u for u in users if u.email == request.email), None)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid email or password"
        )
        
    if not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
        
    token_data = {
        "sub": str(user.id),
        "role": user.role
    }
    token = create_access_token(token_data)
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "user_id": user.id,
        "role": user.role
    }


@router.get("/me")
def get_me(
    current_user: dict = Depends(get_current_user),
    storage: JsonStorage = Depends(get_storage)
):
    users = storage.load_users()
    user_id = int(current_user["sub"])
    
    user = next((u for u in users if u.id == user_id), None)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
        
    # Return full profile
    profile = {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "status": user.status,
        "created_at": user.created_at.isoformat()
    }
    
    if user.role == "seller":
        profile.update({
            "trade_license": getattr(user, "trade_license", None),
            "rating": getattr(user, "rating", None),
            "listing_count": getattr(user, "listing_count", None),
            "strikes": getattr(user, "strikes", None)
        })
    elif user.role == "buyer":
        profile.update({
            "watchlist": getattr(user, "watchlist", None)
        })
    elif user.role == "admin":
        profile.update({
            "department": getattr(user, "department", None)
        })
        
    return profile
