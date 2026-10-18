from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import current_user, require_roles
from app.core.security import create_access_token, hash_password, verify_password
from app.models import User

router = APIRouter(prefix="/auth", tags=["Module 1 · Auth & RBAC"])


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    role: str


@router.post("/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form.username).first()
    if not user or not user.active or not verify_password(form.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email hoặc mật khẩu không đúng")
    return {"access_token": create_access_token(user.email), "token_type": "bearer",
            "user": {"email": user.email, "role": user.role}}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return {"email": user.email, "role": user.role}


@router.get("/users")
def users(db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    return [{"id": u.id, "email": u.email, "role": u.role, "active": u.active} for u in db.query(User).order_by(User.id)]


@router.post("/users", status_code=201)
def create_user(body: UserCreate, db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    if body.role not in {"admin", "accountant", "chief_accountant"}:
        raise HTTPException(422, "Vai trò không hợp lệ")
    if len(body.password) < 10:
        raise HTTPException(422, "Mật khẩu tối thiểu 10 ký tự")
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(409, "Email đã tồn tại")
    user = User(email=body.email, role=body.role, password_hash=hash_password(body.password))
    db.add(user); db.commit(); db.refresh(user)
    return {"id": user.id, "email": user.email, "role": user.role, "active": user.active}
