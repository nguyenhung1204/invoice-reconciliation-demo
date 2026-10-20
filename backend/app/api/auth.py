from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import current_user, require_roles
from app.core.security import create_access_token, hash_password, verify_password
from app.models import AuditEvent, User

router = APIRouter(prefix="/auth", tags=["Module 1 · Auth & RBAC"])


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    role: str


class ChangePasswordIn(BaseModel):
    old_password: str
    new_password: str


class UserUpdate(BaseModel):
    role: str | None = None
    active: bool | None = None
    new_password: str | None = None


def add_audit(db, user, action, entity_type, entity_id, detail=""):
    db.add(AuditEvent(actor_email=user.email, action=action, entity_type=entity_type,
                      entity_id=str(entity_id), detail=detail))


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


@router.post("/change-password")
def change_password(body: ChangePasswordIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if not verify_password(body.old_password, user.password_hash):
        raise HTTPException(400, "Mật khẩu hiện tại không đúng")
    if len(body.new_password) < 8:
        raise HTTPException(422, "Mật khẩu mới tối thiểu 8 ký tự")
    if verify_password(body.new_password, user.password_hash):
        raise HTTPException(422, "Mật khẩu mới phải khác mật khẩu hiện tại")
    user.password_hash = hash_password(body.new_password)
    add_audit(db, user, "auth.change_password", "user", user.id)
    db.commit()
    return {"message": "Đổi mật khẩu thành công"}


@router.post("/logout")
def logout(db: Session = Depends(get_db), user: User = Depends(current_user)):
    add_audit(db, user, "auth.logout", "user", user.id)
    db.commit()
    return {"message": "Đã ghi nhận đăng xuất"}


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


@router.patch("/users/{user_id}")
def update_user(user_id: int, body: UserUpdate, db: Session = Depends(get_db), admin: User = Depends(require_roles("admin"))):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Không tìm thấy tài khoản")
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(422, "Cần cung cấp ít nhất một trường cần cập nhật")
    role = updates.get("role")
    if role is not None and role not in {"admin", "accountant", "chief_accountant"}:
        raise HTTPException(422, "Vai trò không hợp lệ")
    password = updates.get("new_password")
    if password is not None and len(password) < 8:
        raise HTTPException(422, "Mật khẩu tối thiểu 8 ký tự")
    user.role = role if role is not None else user.role
    user.active = updates.get("active", user.active)
    if password is not None:
        user.password_hash = hash_password(password)
    add_audit(db, admin, "user.update", "user", user.id, ",".join(sorted(updates)))
    db.commit()
    return {"id": user.id, "email": user.email, "role": user.role, "active": user.active}


@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), admin: User = Depends(require_roles("admin"))):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Không tìm thấy tài khoản")
    if user.id == admin.id:
        raise HTTPException(400, "Admin không thể tự xóa tài khoản của mình")
    add_audit(db, admin, "user.delete", "user", user.id, user.email)
    db.delete(user)
    db.commit()
    return {"message": "Đã xóa tài khoản"}
