from pathlib import Path
from hashlib import sha256
from uuid import uuid4
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import current_user, require_roles
from app.models import AuditEvent, GoodsReceipt, Invoice, PurchaseOrder, User
from app.services.normalization import extract_fields
from app.services.ocr import OCRUnavailable, recognize_file
from app.services.reconciliation import reconcile

router = APIRouter(prefix="/invoices", tags=["Modules 3–5 · Intake, OCR & HITL"])
ALLOWED = {"application/pdf", "image/jpeg", "image/png"}


class ReviewIn(BaseModel):
    seller_tax_code: str = ""
    buyer_tax_code: str = ""
    invoice_number: str = ""
    invoice_date: str = ""
    total_amount: float | None = None
    items: list[dict] = []
    po_number: str = ""
    review_note: str = ""


def serialize(row: Invoice):
    return {"id": row.id, "original_name": row.original_name, "status": row.status,
            "seller_tax_code": row.seller_tax_code, "buyer_tax_code": row.buyer_tax_code,
            "invoice_number": row.invoice_number, "invoice_date": row.invoice_date,
            "total_amount": row.total_amount, "items": row.items or [], "ocr_text": row.ocr_text,
            "ocr_blocks": row.ocr_blocks or [], "ocr_confidence": row.ocr_confidence, "warnings": row.warnings or [], "po_number": row.po_number,
            "review_note": row.review_note, "created_at": row.created_at.isoformat()}


def audit(db, user, action, entity_type, entity_id, detail=""):
    db.add(AuditEvent(actor_email=user.email, action=action, entity_type=entity_type, entity_id=str(entity_id), detail=detail))


@router.get("")
def list_invoices(status_filter: str = "", db: Session = Depends(get_db), _: User = Depends(current_user)):
    query = db.query(Invoice)
    if status_filter: query = query.filter(Invoice.status == status_filter)
    return [serialize(row) for row in query.order_by(Invoice.created_at.desc()).limit(300)]


@router.post("/upload", status_code=201)
async def upload_invoice(file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(current_user)):
    if file.content_type not in ALLOWED:
        raise HTTPException(415, "Chỉ nhận PDF, PNG, JPEG")
    content = await file.read()
    if not content or len(content) > 25 * 1024 * 1024:
        raise HTTPException(413, "File rỗng hoặc vượt quá 25 MB")
    digest = sha256(content).hexdigest()
    duplicate = db.query(Invoice).filter(Invoice.sha256 == digest).first()
    if duplicate:
        raise HTTPException(409, f"File đã có trong hệ thống (hóa đơn #{duplicate.id})")
    # End the read transaction before slow OCR; never hold a SQLite transaction
    # open while the model initializes or processes a large invoice image.
    db.rollback()
    folder = Path(settings.upload_dir); folder.mkdir(parents=True, exist_ok=True)
    suffix = Path(file.filename or "invoice").suffix.lower()
    stored_path = folder / f"{uuid4().hex}{suffix}"
    stored_path.write_bytes(content)
    row = Invoice(original_name=(file.filename or "invoice")[:255], stored_path=str(stored_path),
                  mime_type=file.content_type, sha256=digest)
    text = ""; confidence = None; blocks = []; status = "needs_review"; warnings = []
    try:
        ocr_result = await run_in_threadpool(recognize_file, str(stored_path))
        text, confidence, blocks = ocr_result["text"], ocr_result["confidence"], ocr_result.get("blocks", [])
        fields = extract_fields(text)
        for key in ("seller_tax_code", "buyer_tax_code", "invoice_date", "total_amount", "items"):
            setattr(row, key, fields[key])
        status = "needs_review" if confidence is None or confidence < settings.ocr_min_confidence else "ocr_done"
        if not text.strip():
            warnings.append({"code": "OCR_EMPTY", "message": "OCR không đọc được chữ; kiểm tra file hoặc chạy nhận dạng lại."})
    except OCRUnavailable as exc:
        warnings.append({"code": "OCR_UNAVAILABLE", "message": str(exc)[:300]})
    db.add(row)
    db.flush()
    row.ocr_text, row.ocr_blocks, row.ocr_confidence, row.status, row.warnings = text, blocks, confidence, status, warnings
    audit(db, user, "invoice.upload", "invoice", row.id, row.original_name)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        stored_path.unlink(missing_ok=True)
        raise HTTPException(409, "File hóa đơn này vừa được tải lên ở một yêu cầu khác.") from exc
    except OperationalError as exc:
        db.rollback()
        stored_path.unlink(missing_ok=True)
        if "locked" in str(exc).lower():
            raise HTTPException(503, "Cơ sở dữ liệu đang bận. Đợi vài giây rồi thử lại.") from exc
        raise
    db.refresh(row)
    return serialize(row)


@router.post("/{invoice_id}/ocr")
async def retry_ocr(invoice_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    row = db.get(Invoice, invoice_id)
    if not row or not Path(row.stored_path).is_file():
        raise HTTPException(404, "Không tìm thấy file hóa đơn")
    if row.status == "approved" and user.role != "admin":
        raise HTTPException(409, "Hóa đơn đã phê duyệt; chỉ Admin mới được chạy lại OCR")
    warnings = []
    try:
        result = await run_in_threadpool(recognize_file, row.stored_path)
        row.ocr_text = result["text"]
        row.ocr_blocks = result.get("blocks", [])
        row.ocr_confidence = result["confidence"]
        fields = extract_fields(row.ocr_text)
        for key in ("seller_tax_code", "buyer_tax_code", "invoice_date", "total_amount", "items"):
            setattr(row, key, fields[key])
        row.status = "needs_review" if row.ocr_confidence is None or row.ocr_confidence < settings.ocr_min_confidence else "ocr_done"
        if not row.ocr_text.strip():
            warnings.append({"code": "OCR_EMPTY", "message": "OCR không đọc được chữ; kiểm tra chất lượng file."})
    except OCRUnavailable as exc:
        row.ocr_text, row.ocr_blocks, row.ocr_confidence = "", [], None
        row.status = "needs_review"
        warnings.append({"code": "OCR_UNAVAILABLE", "message": str(exc)[:300]})
    row.warnings = warnings
    audit(db, user, "invoice.ocr_retry", "invoice", row.id, f"warnings={len(warnings)}")
    db.commit(); db.refresh(row)
    return serialize(row)


@router.get("/{invoice_id}")
def get_invoice(invoice_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    row = db.get(Invoice, invoice_id)
    if not row: raise HTTPException(404, "Không tìm thấy hóa đơn")
    return serialize(row)


@router.patch("/{invoice_id}/review")
def review_invoice(invoice_id: int, body: ReviewIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    row = db.get(Invoice, invoice_id)
    if not row: raise HTTPException(404, "Không tìm thấy hóa đơn")
    if row.status == "approved" and user.role != "admin":
        raise HTTPException(409, "Hóa đơn đã phê duyệt; chỉ Admin mới được mở khóa chỉnh sửa")
    for key, value in body.model_dump().items(): setattr(row, key, value)
    row.status = "reviewed"
    audit(db, user, "invoice.review", "invoice", row.id, body.review_note[:500])
    try:
        db.commit()
    except OperationalError as exc:
        db.rollback()
        if "locked" in str(exc).lower():
            raise HTTPException(503, "Cơ sở dữ liệu đang bận, dữ liệu rà soát chưa được lưu. Đợi vài giây rồi thử lại.") from exc
        raise
    db.refresh(row)
    return serialize(row)


@router.post("/{invoice_id}/reconcile")
def reconcile_invoice(invoice_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    row = db.get(Invoice, invoice_id)
    if not row: raise HTTPException(404, "Không tìm thấy hóa đơn")
    po = db.query(PurchaseOrder).filter_by(po_number=row.po_number).first() if row.po_number else None
    gr = db.query(GoodsReceipt).filter_by(po_number=row.po_number).first() if row.po_number else None
    row.warnings = reconcile(row, po, gr)
    row.status = "matched" if not row.warnings else "mismatch"
    audit(db, user, "invoice.reconcile", "invoice", row.id, f"warnings={len(row.warnings)}")
    db.commit(); db.refresh(row)
    return serialize(row)


@router.post("/{invoice_id}/approve")
def approve_invoice(invoice_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles("chief_accountant", "admin"))):
    row = db.get(Invoice, invoice_id)
    if not row: raise HTTPException(404, "Không tìm thấy hóa đơn")
    if row.status not in {"matched", "reviewed"}:
        raise HTTPException(409, "Chỉ duyệt hóa đơn đã rà soát hoặc đã đối soát")
    row.status = "approved"
    audit(db, user, "invoice.approve", "invoice", row.id)
    db.commit(); db.refresh(row)
    return serialize(row)


@router.get("/{invoice_id}/file")
def invoice_file(invoice_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    from fastapi.responses import FileResponse
    row = db.get(Invoice, invoice_id)
    if not row or not Path(row.stored_path).is_file(): raise HTTPException(404, "Không tìm thấy file hóa đơn")
    return FileResponse(row.stored_path, media_type=row.mime_type, filename=row.original_name)
