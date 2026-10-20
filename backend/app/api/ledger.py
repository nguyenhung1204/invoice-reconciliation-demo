import csv
import io
import json
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import current_user, require_roles
from app.models import AuditEvent, GoodsReceipt, Invoice, PurchaseOrder, Supplier, User

router = APIRouter(prefix="/ledger", tags=["Module 2 · PO & Ledger"])


class SupplierIn(BaseModel):
    tax_code: str
    name: str
    email: str = ""


class POIn(BaseModel):
    po_number: str
    supplier_tax_code: str
    total_amount: float
    lines: list[dict] = []


class GRIn(BaseModel):
    receipt_number: str
    po_number: str
    lines: list[dict] = []


class POUpdate(BaseModel):
    po_number: str | None = None
    supplier_tax_code: str | None = None
    total_amount: float | None = Field(default=None, ge=0)
    status: str | None = None
    lines: list[dict] | None = None


class GRUpdate(BaseModel):
    receipt_number: str | None = None
    po_number: str | None = None
    lines: list[dict] | None = None


def record_audit(db, user, action, entity_type, entity_id, detail=""):
    db.add(AuditEvent(actor_email=user.email, action=action, entity_type=entity_type,
                      entity_id=str(entity_id), detail=detail))


@router.get("/suppliers")
def suppliers(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return [{"id": x.id, "tax_code": x.tax_code, "name": x.name, "email": x.email} for x in db.query(Supplier).order_by(Supplier.name)]


@router.post("/suppliers", status_code=201)
def add_supplier(body: SupplierIn, db: Session = Depends(get_db), _: User = Depends(current_user)):
    if db.query(Supplier).filter(Supplier.tax_code == body.tax_code).first():
        raise HTTPException(409, "Mã số thuế nhà cung cấp đã tồn tại")
    row = Supplier(**body.model_dump()); db.add(row); db.flush()
    record_audit(db, _, "supplier.create", "supplier", row.id, row.name)
    db.commit(); db.refresh(row)
    return {"id": row.id, **body.model_dump()}


@router.get("/purchase-orders")
def purchase_orders(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return [{"id": x.id, "po_number": x.po_number, "supplier_tax_code": x.supplier_tax_code,
             "total_amount": x.total_amount, "status": x.status, "lines": x.lines or []}
            for x in db.query(PurchaseOrder).order_by(PurchaseOrder.created_at.desc())]


@router.post("/purchase-orders", status_code=201)
def add_purchase_order(body: POIn, db: Session = Depends(get_db), _: User = Depends(current_user)):
    if db.query(PurchaseOrder).filter(PurchaseOrder.po_number == body.po_number).first():
        raise HTTPException(409, "Số PO đã tồn tại")
    row = PurchaseOrder(**body.model_dump()); db.add(row); db.flush()
    record_audit(db, _, "purchase_order.create", "purchase_order", row.id, row.po_number)
    db.commit(); db.refresh(row)
    return {"id": row.id, **body.model_dump(), "status": row.status}


@router.patch("/purchase-orders/{po_id}")
def update_purchase_order(po_id: int, body: POUpdate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    row = db.get(PurchaseOrder, po_id)
    if not row:
        raise HTTPException(404, "Không tìm thấy PO")
    values = body.model_dump(exclude_unset=True)
    if not values or any(value is None for value in values.values()):
        raise HTTPException(422, "Cần cung cấp các giá trị cập nhật hợp lệ")
    if "po_number" in values and db.query(PurchaseOrder).filter(PurchaseOrder.po_number == values["po_number"], PurchaseOrder.id != po_id).first():
        raise HTTPException(409, "Số PO đã tồn tại")
    for key, value in values.items():
        setattr(row, key, value)
    record_audit(db, user, "purchase_order.update", "purchase_order", row.id, ",".join(sorted(values)))
    db.commit(); db.refresh(row)
    return {"id": row.id, "po_number": row.po_number, "supplier_tax_code": row.supplier_tax_code,
            "total_amount": row.total_amount, "status": row.status, "lines": row.lines or []}


@router.delete("/purchase-orders/{po_id}")
def delete_purchase_order(po_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    row = db.get(PurchaseOrder, po_id)
    if not row:
        raise HTTPException(404, "Không tìm thấy PO")
    if db.query(GoodsReceipt).filter_by(po_number=row.po_number).first() or db.query(Invoice).filter_by(po_number=row.po_number).first():
        raise HTTPException(409, "Không thể xóa PO đang được phiếu nhập hoặc hóa đơn tham chiếu")
    record_audit(db, user, "purchase_order.delete", "purchase_order", row.id, row.po_number)
    db.delete(row); db.commit()
    return {"message": "Đã xóa PO"}


@router.get("/goods-receipts")
def goods_receipts(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return [{"id": x.id, "receipt_number": x.receipt_number, "po_number": x.po_number,
             "lines": x.lines or [], "received_at": x.received_at.isoformat()} for x in db.query(GoodsReceipt).order_by(GoodsReceipt.received_at.desc())]


@router.post("/goods-receipts", status_code=201)
def add_goods_receipt(body: GRIn, db: Session = Depends(get_db), _: User = Depends(current_user)):
    if not db.query(PurchaseOrder).filter(PurchaseOrder.po_number == body.po_number).first():
        raise HTTPException(404, "Không tìm thấy PO")
    if db.query(GoodsReceipt).filter(GoodsReceipt.receipt_number == body.receipt_number).first():
        raise HTTPException(409, "Số phiếu nhập đã tồn tại")
    row = GoodsReceipt(**body.model_dump()); db.add(row); db.flush()
    record_audit(db, _, "goods_receipt.create", "goods_receipt", row.id, row.receipt_number)
    db.commit(); db.refresh(row)
    return {"id": row.id, **body.model_dump()}


@router.patch("/goods-receipts/{receipt_id}")
def update_goods_receipt(receipt_id: int, body: GRUpdate, db: Session = Depends(get_db), user: User = Depends(current_user)):
    row = db.get(GoodsReceipt, receipt_id)
    if not row:
        raise HTTPException(404, "Không tìm thấy phiếu nhập")
    values = body.model_dump(exclude_unset=True)
    if not values or any(value is None for value in values.values()):
        raise HTTPException(422, "Cần cung cấp các giá trị cập nhật hợp lệ")
    if "po_number" in values and not db.query(PurchaseOrder).filter_by(po_number=values["po_number"]).first():
        raise HTTPException(404, "Không tìm thấy PO")
    if "receipt_number" in values and db.query(GoodsReceipt).filter(GoodsReceipt.receipt_number == values["receipt_number"], GoodsReceipt.id != receipt_id).first():
        raise HTTPException(409, "Số phiếu nhập đã tồn tại")
    for key, value in values.items():
        setattr(row, key, value)
    record_audit(db, user, "goods_receipt.update", "goods_receipt", row.id, ",".join(sorted(values)))
    db.commit(); db.refresh(row)
    return {"id": row.id, "receipt_number": row.receipt_number, "po_number": row.po_number,
            "lines": row.lines or [], "received_at": row.received_at.isoformat()}


@router.delete("/goods-receipts/{receipt_id}")
def delete_goods_receipt(receipt_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    row = db.get(GoodsReceipt, receipt_id)
    if not row:
        raise HTTPException(404, "Không tìm thấy phiếu nhập")
    record_audit(db, user, "goods_receipt.delete", "goods_receipt", row.id, row.receipt_number)
    db.delete(row); db.commit()
    return {"message": "Đã xóa phiếu nhập"}


@router.post("/import/{kind}")
async def import_ledger(kind: str, file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(current_user)):
    if kind not in {"suppliers", "purchase-orders", "goods-receipts"}:
        raise HTTPException(404, "Loại dữ liệu không hỗ trợ")
    raw = await file.read()
    if file.filename.lower().endswith(".csv"):
        rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
    elif file.filename.lower().endswith(".xlsx"):
        from openpyxl import load_workbook
        wb = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
        sheet = wb.active
        headers = [str(c or "").strip() for c in next(sheet.iter_rows(values_only=True))]
        rows = [dict(zip(headers, r)) for r in sheet.iter_rows(min_row=2, values_only=True)]
    else:
        raise HTTPException(415, "Chỉ nhận CSV hoặc XLSX")
    created, skipped = 0, 0
    for row in rows:
        try:
            if kind == "suppliers":
                key = str(row.get("tax_code", "")).strip()
                if not key or db.query(Supplier).filter_by(tax_code=key).first(): skipped += 1; continue
                db.add(Supplier(tax_code=key, name=str(row.get("name", "")).strip(), email=str(row.get("email", "") or "")))
            elif kind == "purchase-orders":
                key = str(row.get("po_number", "")).strip()
                if not key or db.query(PurchaseOrder).filter_by(po_number=key).first(): skipped += 1; continue
                raw_lines = row.get("lines_json", row.get("lines", ""))
                lines = json.loads(raw_lines) if isinstance(raw_lines, str) and raw_lines.strip() else []
                if not isinstance(lines, list): skipped += 1; continue
                db.add(PurchaseOrder(po_number=key, supplier_tax_code=str(row.get("supplier_tax_code", "")),
                                    total_amount=float(row.get("total_amount", 0) or 0), lines=lines))
            else:
                key = str(row.get("receipt_number", "")).strip()
                if not key or db.query(GoodsReceipt).filter_by(receipt_number=key).first(): skipped += 1; continue
                po_number = str(row.get("po_number", "")).strip()
                if not db.query(PurchaseOrder).filter_by(po_number=po_number).first(): skipped += 1; continue
                raw_lines = row.get("lines_json", row.get("lines", ""))
                lines = json.loads(raw_lines) if isinstance(raw_lines, str) and raw_lines.strip() else []
                if not isinstance(lines, list): skipped += 1; continue
                db.add(GoodsReceipt(receipt_number=key, po_number=po_number, lines=lines))
            created += 1
        except (TypeError, ValueError, json.JSONDecodeError):
            skipped += 1
    record_audit(db, user, "ledger.import", kind, "bulk", f"created={created};skipped={skipped}")
    db.commit()
    return {"created": created, "skipped": skipped, "total_rows": len(rows)}


@router.post("/clear-all")
def clear_all(db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    from app.models import Invoice
    db.query(Invoice).delete()
    db.query(GoodsReceipt).delete()
    db.query(PurchaseOrder).delete()
    db.query(Supplier).delete()
    db.commit()
    return {"message": "Đã xóa toàn bộ dữ liệu đơn hàng và hóa đơn."}


@router.post("/seed-sample")
def seed_sample(db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    from app.seed import seed
    seed()
    return {"message": "Đã nạp lại bộ dữ liệu mẫu thành công."}
