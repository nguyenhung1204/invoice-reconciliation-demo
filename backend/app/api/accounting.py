from datetime import date
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import current_user, require_roles
from app.models import AccountingVoucher, AuditEvent, Invoice, User

router = APIRouter(prefix="/accounting/vouchers", tags=["Accounting"])
EDIT_ROLES = ("admin", "chief_accountant")


class VoucherIn(BaseModel):
    voucher_type: Literal["THU", "CHI"]
    voucher_date: date
    related_party_name: str = Field(min_length=1, max_length=255)
    related_invoice_id: int | None = Field(default=None, gt=0)
    content: str = Field(min_length=1)
    amount: float = Field(gt=0)


class VoucherPatch(BaseModel):
    voucher_date: date | None = None
    related_party_name: str | None = Field(default=None, min_length=1, max_length=255)
    related_invoice_id: int | None = Field(default=None, gt=0)
    content: str | None = Field(default=None, min_length=1)
    amount: float | None = Field(default=None, gt=0)


def _serialize(row: AccountingVoucher) -> dict:
    return {"id": row.id, "voucher_number": row.voucher_number, "voucher_type": row.voucher_type,
            "voucher_date": row.voucher_date, "related_party_name": row.related_party_name,
            "related_invoice_id": row.related_invoice_id, "content": row.content,
            "amount": float(row.amount), "is_auto_generated": row.is_auto_generated}


def _audit(db: Session, user: User, action: str, row: AccountingVoucher) -> None:
    db.add(AuditEvent(actor_user_id=user.id, actor_email=user.email, action=action,
                      entity_type="accounting_voucher", entity_id=row.voucher_number, detail=row.content))


def _invoice_exists(db: Session, invoice_id: int | None) -> None:
    if invoice_id is not None and db.get(Invoice, invoice_id) is None:
        raise HTTPException(404, "Không tìm thấy hóa đơn liên kết")


@router.get("")
def list_vouchers(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return [_serialize(row) for row in db.query(AccountingVoucher).order_by(AccountingVoucher.created_at.desc())]


@router.post("", status_code=201)
def create_voucher(body: VoucherIn, db: Session = Depends(get_db), user: User = Depends(require_roles(*EDIT_ROLES))):
    _invoice_exists(db, body.related_invoice_id)
    row = AccountingVoucher(
        voucher_number=f"TEMP-{uuid4().hex}", voucher_type=body.voucher_type,
        voucher_date=body.voucher_date.isoformat(), related_party_name=body.related_party_name.strip(),
        related_invoice_id=body.related_invoice_id, content=body.content.strip(), amount=body.amount,
        is_auto_generated=False, created_by_user_id=user.id,
    )
    db.add(row)
    db.flush()
    prefix = "PT" if row.voucher_type == "THU" else "PC"
    row.voucher_number = f"{prefix}-{row.id:06d}"
    _audit(db, user, "accounting_voucher.create", row)
    db.commit()
    db.refresh(row)
    return _serialize(row)


@router.patch("/{voucher_id}")
def update_voucher(voucher_id: int, body: VoucherPatch, db: Session = Depends(get_db), user: User = Depends(require_roles(*EDIT_ROLES))):
    row = db.get(AccountingVoucher, voucher_id)
    if row is None:
        raise HTTPException(404, "Không tìm thấy phiếu thu chi")
    if row.is_auto_generated:
        raise HTTPException(409, "Phiếu tự động sinh không thể chỉnh sửa")
    values = body.model_dump(exclude_unset=True)
    if not values or any(value is None for value in values.values()):
        raise HTTPException(422, "Cần cung cấp giá trị cập nhật hợp lệ")
    if "related_invoice_id" in values:
        _invoice_exists(db, values["related_invoice_id"])
    for key, value in values.items():
        setattr(row, key, value.isoformat() if key == "voucher_date" else value)
    _audit(db, user, "accounting_voucher.update", row)
    db.commit()
    db.refresh(row)
    return _serialize(row)


@router.delete("/{voucher_id}")
def delete_voucher(voucher_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles(*EDIT_ROLES))):
    row = db.get(AccountingVoucher, voucher_id)
    if row is None:
        raise HTTPException(404, "Không tìm thấy phiếu thu chi")
    if row.is_auto_generated:
        raise HTTPException(409, "Phiếu tự động sinh không thể xóa")
    _audit(db, user, "accounting_voucher.delete", row)
    db.delete(row)
    db.commit()
    return {"message": "Đã xóa phiếu thu chi"}
