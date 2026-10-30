from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
from decimal import Decimal
from time import perf_counter
from types import SimpleNamespace
import json
from uuid import uuid4
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session, selectinload
from rapidfuzz.fuzz import ratio
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import current_user, require_roles
from app.models import (
    AuditEvent, GoodsReceipt, Invoice, InvoiceApproval, InvoiceDatasetMembership,
    InvoiceFile, InvoiceOCRField, InvoiceOCRRun, InvoicePayment, InvoiceReview,
    PurchaseOrder, ReconciliationFinding, ReconciliationLineAllocation,
    ReconciliationRun, ReconciliationRunGoodsReceipt, Supplier, User,
)
from app.services.normalization import extract_fields, normalize_text
from app.services.invoice_lines import invoice_items_for_api, sync_invoice_items
from app.services.invoice_lifecycle import delete_invoice_dependents
from app.services.ocr import OCRUnavailable, recognize_file
from app.services.reconciliation import reconcile
from app.services.reconciliation_settings import get_reconciliation_settings

router = APIRouter(prefix="/invoices", tags=["Modules 3–5 · Intake, OCR & HITL"])
ALLOWED = {"application/pdf", "image/jpeg", "image/png"}


class ReviewIn(BaseModel):
    seller_tax_code: str = ""
    seller_name: str = ""
    invoice_series: str = ""
    buyer_tax_code: str = ""
    invoice_number: str = ""
    invoice_date: str = ""
    subtotal_amount: float | None = None
    tax_amount: float | None = None
    total_amount: float | None = None
    items: list[dict] = []
    po_number: str = ""
    review_note: str = ""


class RejectIn(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)


def serialize(row: Invoice):
    return {"id": row.id, "original_name": row.original_name, "status": row.status,
            "seller_tax_code": row.seller_tax_code, "seller_name": row.seller_name,
            "buyer_tax_code": row.buyer_tax_code,
            "invoice_number": row.invoice_number, "invoice_series": row.invoice_series,
            "invoice_date": row.invoice_date,
            "subtotal_amount": row.subtotal_amount, "tax_amount": row.tax_amount,
            "total_amount": row.total_amount, "items": invoice_items_for_api(row), "ocr_text": row.ocr_text,
            "ocr_blocks": row.ocr_blocks or [], "ocr_confidence": row.ocr_confidence, "warnings": row.warnings or [], "po_number": row.po_number,
            "review_note": row.review_note, "datasets": [m.dataset.dataset_code for m in row.dataset_memberships],
            "created_at": row.created_at.isoformat()}


def audit(db, user, action, entity_type, entity_id, detail=""):
    db.add(AuditEvent(actor_user_id=getattr(user, "id", None), actor_email=user.email, action=action,
                      entity_type=entity_type, entity_id=str(entity_id), detail=detail))


def record_ocr_attempt(db, invoice: Invoice, *, fields: dict, confidence: float | None,
                       started_at: datetime, duration: float, status: str, warning: str = ""):
    run = InvoiceOCRRun(
        invoice_id=invoice.id,
        engine="PaddleOCR",
        status=status,
        started_at=started_at,
        finished_at=datetime.now(timezone.utc),
        duration_seconds=duration,
        config_json={"minimum_confidence": get_reconciliation_settings(db)["ocr_confidence_min"]},
    )
    db.add(run)
    db.flush()
    for key, value in fields.items():
        raw = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, default=str)
        db.add(InvoiceOCRField(
            ocr_run_id=run.ocr_run_id,
            field_key=key,
            value_text=raw,
            normalized_value=raw,
            confidence=confidence,
            warning=warning or None,
        ))


def review_snapshot(invoice: Invoice) -> dict:
    return {
        "seller_tax_code": invoice.seller_tax_code,
        "seller_name": invoice.seller_name,
        "invoice_series": invoice.invoice_series,
        "buyer_tax_code": invoice.buyer_tax_code,
        "invoice_number": invoice.invoice_number,
        "invoice_date": invoice.invoice_date,
        "subtotal_amount": float(invoice.subtotal_amount) if invoice.subtotal_amount is not None else None,
        "tax_amount": float(invoice.tax_amount) if invoice.tax_amount is not None else None,
        "total_amount": float(invoice.total_amount) if invoice.total_amount is not None else None,
        "currency_code": invoice.currency_code,
        "po_id": invoice.po_id,
        "po_reference_text": invoice.po_reference_text,
        "review_note": invoice.review_note,
        "items": invoice_items_for_api(invoice),
    }


def _snapshot_hash(snapshot: dict) -> str:
    encoded = json.dumps(snapshot, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return sha256(encoded.encode("utf-8")).hexdigest()


def _as_decimal(value) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (TypeError, ValueError):
        return None


def reconciliation_source_snapshot(po: PurchaseOrder | None, receipts: list[GoodsReceipt]) -> dict:
    def po_line_snapshot(line):
        return {"description": line.item_description, "unit": line.unit,
                "quantity": float(line.quantity), "unit_price": float(line.unit_price),
                "amount": float(line.line_total) if line.line_total is not None else None}

    def gr_line_snapshot(line):
        return {"description": line.item_description, "unit": line.unit,
                "quantity_received": float(line.quantity_received), "po_item_id": line.po_item_id}

    return {
        "po": ({"id": po.id, "number": po.po_number, "supplier_tax_code": po.supplier_tax_code,
                "total_amount": float(po.total_amount),
                "lines": [po_line_snapshot(line) for line in po.line_rows]} if po else None),
        "goods_receipts": [
            {"id": receipt.id, "number": receipt.receipt_number,
             "lines": [gr_line_snapshot(line) for line in receipt.line_rows]}
            for receipt in receipts
        ],
    }


def _allocate_reconciliation_lines(db: Session, run: ReconciliationRun, invoice: Invoice,
                                   po: PurchaseOrder | None, receipts: list[GoodsReceipt],
                                   warnings: list[dict]) -> None:
    """Save line-level matches and quantity/amount splits for this immutable run."""
    if not po:
        for warning in warnings:
            db.add(ReconciliationFinding(
                reconciliation_run_id=run.reconciliation_run_id,
                finding_type=warning["code"], severity="warning", details=warning["message"],
            ))
        return

    po_lines = list(po.line_rows)
    threshold = get_reconciliation_settings(db)["item_similarity_threshold"]
    remaining_by_gr_line = {
        line.id: _as_decimal(line.quantity_received) or Decimal("0")
        for receipt in receipts for line in receipt.line_rows
    }
    gr_lines = [(receipt, line) for receipt in receipts for line in receipt.line_rows]

    for invoice_line in invoice.item_rows:
        item_name = normalize_text(invoice_line.item_description).lower()
        candidates = [
            (ratio(item_name, normalize_text(po_line.item_description).lower()), po_line)
            for po_line in po_lines
        ]
        score, po_line = max(candidates, key=lambda item: item[0]) if candidates else (0, None)
        if not po_line or score < threshold:
            db.add(ReconciliationLineAllocation(
                reconciliation_run_id=run.reconciliation_run_id,
                invoice_item_id=invoice_line.id,
                allocated_quantity=invoice_line.quantity,
                allocated_amount=invoice_line.line_total,
                invoice_snapshot_json={"description": invoice_line.item_description,
                                       "quantity": float(invoice_line.quantity) if invoice_line.quantity is not None else None,
                                       "unit_price": float(invoice_line.unit_price) if invoice_line.unit_price is not None else None,
                                       "amount": float(invoice_line.line_total) if invoice_line.line_total is not None else None},
                po_snapshot_json={}, gr_snapshot_json={},
            ))
            continue

        invoice_qty = _as_decimal(invoice_line.quantity)
        invoice_amount = _as_decimal(invoice_line.line_total)
        if invoice_amount is None and invoice_qty is not None and invoice_line.unit_price is not None:
            invoice_amount = invoice_qty * _as_decimal(invoice_line.unit_price)
        remaining_invoice_qty = invoice_qty
        matched_receipt_lines = [
            (receipt, gr_line) for receipt, gr_line in gr_lines
            if (
                gr_line.po_item_id == po_line.id
                if gr_line.po_item_id is not None
                else ratio(
                    normalize_text(invoice_line.item_description).lower(),
                    normalize_text(gr_line.item_description).lower(),
                ) >= threshold
            )
        ]

        def save_allocation(receipt, gr_line, allocated_qty):
            ratio_of_line = (allocated_qty / invoice_qty) if allocated_qty is not None and invoice_qty else Decimal("1")
            allocated_amount = invoice_amount * ratio_of_line if invoice_amount is not None else None
            db.add(ReconciliationLineAllocation(
                reconciliation_run_id=run.reconciliation_run_id,
                invoice_item_id=invoice_line.id,
                po_item_id=po_line.id,
                gr_item_id=gr_line.id if gr_line else None,
                allocated_quantity=allocated_qty,
                allocated_amount=allocated_amount,
                invoice_snapshot_json={"description": invoice_line.item_description,
                                       "quantity": float(invoice_qty) if invoice_qty is not None else None,
                                       "unit_price": float(invoice_line.unit_price) if invoice_line.unit_price is not None else None,
                                       "amount": float(invoice_amount) if invoice_amount is not None else None},
                po_snapshot_json={"description": po_line.item_description,
                                  "quantity": float(po_line.quantity),
                                  "unit_price": float(po_line.unit_price),
                                  "amount": float(po_line.line_total) if po_line.line_total is not None else None},
                gr_snapshot_json=(
                    {"receipt_number": receipt.receipt_number,
                     "description": gr_line.item_description,
                     "quantity_received": float(gr_line.quantity_received)} if gr_line else {}
                ),
            ))

        allocated_any = False
        if remaining_invoice_qty is not None:
            for receipt, gr_line in matched_receipt_lines:
                if remaining_invoice_qty <= 0:
                    break
                available = remaining_by_gr_line.get(gr_line.id, Decimal("0"))
                allocated_qty = min(remaining_invoice_qty, available)
                if allocated_qty <= 0:
                    continue
                save_allocation(receipt, gr_line, allocated_qty)
                remaining_by_gr_line[gr_line.id] = available - allocated_qty
                remaining_invoice_qty -= allocated_qty
                allocated_any = True
            if remaining_invoice_qty > 0 or not allocated_any:
                save_allocation(None, None, remaining_invoice_qty if allocated_any else invoice_qty)
        else:
            receipt, gr_line = matched_receipt_lines[0] if matched_receipt_lines else (None, None)
            save_allocation(receipt, gr_line, None)

    for warning in warnings:
        db.add(ReconciliationFinding(
            reconciliation_run_id=run.reconciliation_run_id,
            finding_type=warning["code"], severity="warning", details=warning["message"],
        ))


@router.get("")
def list_invoices(status_filter: str = "", db: Session = Depends(get_db), _: User = Depends(current_user)):
    query = db.query(Invoice).options(
        selectinload(Invoice.dataset_memberships).selectinload(InvoiceDatasetMembership.dataset)
    )
    if status_filter:
        query = query.filter(Invoice.status == status_filter)
    else:
        # Archived invoices remain available for audit and evaluation datasets, but
        # should not clutter the day-to-day intake queue.
        query = query.filter(Invoice.status != "archived")
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
    ocr_started_at = datetime.now(timezone.utc)
    ocr_started = perf_counter()
    ocr_fields = {}
    ocr_run_status = "unavailable"
    ocr_warning = ""
    try:
        ocr_result = await run_in_threadpool(recognize_file, str(stored_path))
        text, confidence, blocks = ocr_result["text"], ocr_result["confidence"], ocr_result.get("blocks", [])
        fields = extract_fields(text)
        ocr_fields = fields
        for key in ("seller_tax_code", "seller_name", "invoice_series", "buyer_tax_code", "invoice_number", "invoice_date", "subtotal_amount", "tax_amount", "total_amount"):
            setattr(row, key, fields[key])
        sync_invoice_items(row, fields["items"], source="ocr")
        ocr_run_status = "succeeded"
        status = "needs_review" if confidence is None or confidence < get_reconciliation_settings(db)["ocr_confidence_min"] else "ocr_done"
        if not text.strip():
            warnings.append({"code": "OCR_EMPTY", "message": "OCR không đọc được chữ; kiểm tra file hoặc chạy nhận dạng lại."})
    except OCRUnavailable as exc:
        ocr_warning = str(exc)[:300]
        warnings.append({"code": "OCR_UNAVAILABLE", "message": ocr_warning})
    db.add(row)
    db.flush()
    record_ocr_attempt(
        db, row, fields=ocr_fields, confidence=confidence, started_at=ocr_started_at,
        duration=perf_counter() - ocr_started, status=ocr_run_status, warning=ocr_warning,
    )
    row.seller_supplier_id = db.query(Supplier.id).filter_by(tax_code=row.seller_tax_code).scalar()
    if row.sha256:
        db.add(InvoiceFile(
            invoice_id=row.id,
            original_name=row.original_name,
            relative_path=str(stored_path.relative_to(folder)),
            mime_type=row.mime_type,
            size_bytes=len(content),
            sha256=digest,
            is_primary=True,
        ))
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
    ocr_started_at = datetime.now(timezone.utc)
    ocr_started = perf_counter()
    ocr_fields = {}
    ocr_run_status = "unavailable"
    ocr_warning = ""
    try:
        result = await run_in_threadpool(recognize_file, row.stored_path)
        row.ocr_text = result["text"]
        row.ocr_blocks = result.get("blocks", [])
        row.ocr_confidence = result["confidence"]
        fields = extract_fields(row.ocr_text)
        ocr_fields = fields
        for key in ("seller_tax_code", "seller_name", "invoice_series", "buyer_tax_code", "invoice_number", "invoice_date", "subtotal_amount", "tax_amount", "total_amount"):
            setattr(row, key, fields[key])
        sync_invoice_items(row, fields["items"], source="ocr")
        row.seller_supplier_id = db.query(Supplier.id).filter_by(tax_code=row.seller_tax_code).scalar()
        ocr_run_status = "succeeded"
        row.status = "needs_review" if row.ocr_confidence is None or row.ocr_confidence < get_reconciliation_settings(db)["ocr_confidence_min"] else "ocr_done"
        if not row.ocr_text.strip():
            warnings.append({"code": "OCR_EMPTY", "message": "OCR không đọc được chữ; kiểm tra chất lượng file."})
    except OCRUnavailable as exc:
        row.ocr_text, row.ocr_blocks, row.ocr_confidence = "", [], None
        row.status = "needs_review"
        ocr_warning = str(exc)[:300]
        warnings.append({"code": "OCR_UNAVAILABLE", "message": ocr_warning})
    row.warnings = warnings
    record_ocr_attempt(
        db, row, fields=ocr_fields, confidence=row.ocr_confidence, started_at=ocr_started_at,
        duration=perf_counter() - ocr_started, status=ocr_run_status, warning=ocr_warning,
    )
    audit(db, user, "invoice.ocr_retry", "invoice", row.id, f"warnings={len(warnings)}")
    db.commit(); db.refresh(row)
    return serialize(row)


@router.get("/{invoice_id}")
def get_invoice(invoice_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    row = db.get(Invoice, invoice_id)
    if not row: raise HTTPException(404, "Không tìm thấy hóa đơn")
    return serialize(row)


@router.delete("/{invoice_id}")
def delete_invoice(invoice_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles("chief_accountant", "admin"))):
    row = db.get(Invoice, invoice_id)
    if not row:
        raise HTTPException(404, "Không tìm thấy hóa đơn")
    if row.status == "approved" and user.role != "admin":
        raise HTTPException(403, "Chỉ Admin được xóa hóa đơn đã phê duyệt")
    stored_path = Path(row.stored_path)
    if not stored_path.is_file():
        raise HTTPException(404, "Không tìm thấy file hóa đơn trên máy chủ")
    audit(db, user, "invoice.delete", "invoice", row.id, row.original_name)
    delete_invoice_dependents(db, row.id)
    db.query(Invoice).filter_by(id=row.id).delete(synchronize_session=False)
    db.commit()
    try:
        stored_path.unlink()
    except OSError as exc:
        raise HTTPException(500, "Đã xóa bản ghi nhưng không thể xóa file hóa đơn") from exc
    return {"message": "Đã xóa hóa đơn và file"}


@router.patch("/{invoice_id}/review")
def review_invoice(invoice_id: int, body: ReviewIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    row = db.get(Invoice, invoice_id)
    if not row: raise HTTPException(404, "Không tìm thấy hóa đơn")
    if row.status == "approved" and user.role != "admin":
        raise HTTPException(409, "Hóa đơn đã phê duyệt; chỉ Admin mới được mở khóa chỉnh sửa")
    has_payment = db.query(InvoicePayment.payment_id).join(
        InvoiceApproval, InvoicePayment.approval_id == InvoiceApproval.approval_id
    ).filter(InvoiceApproval.invoice_id == row.id).first()
    if has_payment:
        raise HTTPException(409, "Hóa đơn đã có thanh toán; không thể sửa dữ liệu đã ghi nhận")
    values = body.model_dump()
    # Older review clients do not send the newly editable tax totals. Preserve
    # those stored values when the fields are omitted from their request.
    for optional_total in ("subtotal_amount", "tax_amount"):
        if optional_total not in body.model_fields_set:
            values.pop(optional_total, None)
    po_number = values.pop("po_number", "").strip()
    for key, value in values.items():
        if key != "items":
            setattr(row, key, value)
    purchase_order = db.query(PurchaseOrder).filter_by(po_number=po_number).first() if po_number else None
    row.po_number = po_number
    row.po_reference_text = po_number
    row.po_id = purchase_order.id if purchase_order else None
    row.seller_supplier_id = db.query(Supplier.id).filter_by(tax_code=row.seller_tax_code).scalar()
    sync_invoice_items(row, body.items, source="manual_review")
    row.status = "reviewed"
    db.flush()
    previous_runs = db.query(ReconciliationRun).filter_by(invoice_id=row.id).all()
    for old_run in previous_runs:
        old_run.status = "superseded"
    previous_approvals = db.query(InvoiceApproval).filter_by(invoice_id=row.id).all()
    for old_approval in previous_approvals:
        old_approval.status = "invalidated"
    snapshot = review_snapshot(row)
    revision_number = (db.query(InvoiceReview.revision_number)
                       .filter_by(invoice_id=row.id)
                       .order_by(InvoiceReview.revision_number.desc())
                       .limit(1).scalar() or 0) + 1
    for previous_review in db.query(InvoiceReview).filter_by(invoice_id=row.id).all():
        previous_review.status = "invalidated"
        previous_review.invalidated_at = datetime.now(timezone.utc)
    db.add(InvoiceReview(
        invoice_id=row.id,
        reviewer_user_id=getattr(user, "id", None),
        revision_number=revision_number,
        status="reviewed",
        reviewed_at=datetime.now(timezone.utc),
        review_note=body.review_note,
        snapshot_json=snapshot,
        content_hash=_snapshot_hash(snapshot),
    ))
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
    if row.status == "approved" and user.role != "admin":
        raise HTTPException(409, "Hóa đơn đã được duyệt; chỉ Admin mới được chạy lại đối soát")
    review = (db.query(InvoiceReview).filter_by(invoice_id=row.id, status="reviewed")
              .order_by(InvoiceReview.revision_number.desc()).first())
    if not review:
        raise HTTPException(409, "Kế toán cần rà soát và lưu hóa đơn trước khi đối soát")
    if _snapshot_hash(review_snapshot(row)) != review.content_hash:
        raise HTTPException(409, "Dữ liệu hóa đơn đã thay đổi sau khi rà soát; hãy lưu bản rà soát mới")
    po = db.get(PurchaseOrder, row.po_id) if row.po_id else None
    receipts = (db.query(GoodsReceipt).filter_by(po_id=po.id)
                .order_by(GoodsReceipt.received_at.asc(), GoodsReceipt.id.asc()).all()) if po else []
    aggregate_gr_lines = {}
    for receipt in receipts:
        for line in receipt.line_rows:
            # Description-based grouping also covers legacy GR lines whose
            # optional po_item_id could not be inferred during migration.
            key = normalize_text(line.item_description).casefold()
            entry = aggregate_gr_lines.setdefault(key, {"name": line.item_description, "unit": line.unit,
                                                         "quantity": Decimal("0")})
            entry["quantity"] += _as_decimal(line.quantity_received) or Decimal("0")
    aggregated_receipt = SimpleNamespace(lines=[
        {**line, "quantity": float(line["quantity"])} for line in aggregate_gr_lines.values()
    ]) if receipts else None
    started_at = datetime.now(timezone.utc)
    settings_snapshot = get_reconciliation_settings(db)
    row.warnings = reconcile(row, po, aggregated_receipt, db=db)
    row.status = "matched" if not row.warnings else "mismatch"
    for old_run in db.query(ReconciliationRun).filter_by(invoice_id=row.id).all():
        old_run.status = "superseded"
    run = ReconciliationRun(
        invoice_id=row.id,
        review_id=review.review_id,
        po_id=po.id if po else None,
        gr_id=receipts[0].id if receipts else None,
        status=row.status,
        result_json={
            "warnings": row.warnings,
            "source_snapshot": reconciliation_source_snapshot(po, receipts),
        },
        amount_tolerance=Decimal(str(settings_snapshot["currency_tolerance"])),
        started_at=started_at,
        finished_at=datetime.now(timezone.utc),
        run_by_user_id=getattr(user, "id", None),
    )
    db.add(run)
    db.flush()
    for receipt in receipts:
        db.add(ReconciliationRunGoodsReceipt(reconciliation_run_id=run.reconciliation_run_id, gr_id=receipt.id))
    _allocate_reconciliation_lines(db, run, row, po, receipts, row.warnings)
    audit(db, user, "invoice.reconcile", "invoice", row.id, f"warnings={len(row.warnings)}")
    db.commit(); db.refresh(row)
    return serialize(row)


@router.post("/{invoice_id}/approve")
def approve_invoice(invoice_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles("chief_accountant", "admin"))):
    row = db.get(Invoice, invoice_id)
    if not row: raise HTTPException(404, "Không tìm thấy hóa đơn")
    if row.status == "approved":
        raise HTTPException(409, "Hóa đơn này đã được duyệt; hãy mở khóa và rà soát lại nếu cần thay đổi")
    review = (db.query(InvoiceReview).filter_by(invoice_id=row.id, status="reviewed")
              .order_by(InvoiceReview.revision_number.desc()).first())
    run = (db.query(ReconciliationRun).filter_by(invoice_id=row.id, status="matched")
           .order_by(ReconciliationRun.finished_at.desc(), ReconciliationRun.reconciliation_run_id.desc()).first())
    if row.status != "matched" or not review or not run or run.review_id != review.review_id:
        raise HTTPException(409, "Chỉ duyệt khi phiên bản rà soát hiện tại đã đối soát khớp")
    snapshot = review_snapshot(row)
    content_hash = _snapshot_hash(snapshot)
    if content_hash != review.content_hash:
        raise HTTPException(409, "Dữ liệu đã thay đổi sau khi rà soát; cần rà soát và đối soát lại")
    po = db.get(PurchaseOrder, row.po_id) if row.po_id else None
    receipts = (db.query(GoodsReceipt).filter_by(po_id=po.id)
                .order_by(GoodsReceipt.received_at.asc(), GoodsReceipt.id.asc()).all()) if po else []
    if run.result_json.get("source_snapshot") != reconciliation_source_snapshot(po, receipts):
        raise HTTPException(409, "PO hoặc phiếu nhập đã thay đổi sau đối soát; cần đối soát lại")
    row.status = "approved"
    db.add(InvoiceApproval(
        invoice_id=row.id,
        review_id=review.review_id,
        reconciliation_run_id=run.reconciliation_run_id,
        approver_user_id=getattr(user, "id", None),
        status="approved",
        approved_amount=row.total_amount or Decimal("0"),
        currency_code=row.currency_code,
        snapshot_json=snapshot,
        content_hash=content_hash,
        decided_at=datetime.now(timezone.utc),
    ))
    audit(db, user, "invoice.approve", "invoice", row.id)
    db.commit(); db.refresh(row)
    return serialize(row)


@router.post("/{invoice_id}/reject")
def reject_invoice(invoice_id: int, body: RejectIn, db: Session = Depends(get_db),
                   user: User = Depends(require_roles("chief_accountant", "admin"))):
    row = db.get(Invoice, invoice_id)
    if not row:
        raise HTTPException(404, "Không tìm thấy hóa đơn")
    if row.status == "approved":
        raise HTTPException(409, "Hóa đơn đã phê duyệt; không thể từ chối")
    reason = body.reason.strip()
    if not reason:
        raise HTTPException(422, "Vui lòng nhập lý do từ chối")

    has_payment = db.query(InvoicePayment.payment_id).join(
        InvoiceApproval, InvoicePayment.approval_id == InvoiceApproval.approval_id
    ).filter(InvoiceApproval.invoice_id == row.id).first()
    if has_payment:
        raise HTTPException(409, "Hóa đơn đã có thanh toán; không thể thay đổi trạng thái")

    row.status = "rejected"
    row.review_note = reason
    for review in db.query(InvoiceReview).filter_by(invoice_id=row.id, status="reviewed").all():
        review.status = "invalidated"
        review.invalidated_at = datetime.now(timezone.utc)
    for run in db.query(ReconciliationRun).filter_by(invoice_id=row.id).all():
        run.status = "superseded"
    audit(db, user, "invoice.reject", "invoice", row.id, reason[:500])
    db.commit()
    db.refresh(row)
    return {"message": "Đã từ chối hóa đơn", "invoice": serialize(row)}


@router.get("/{invoice_id}/file")
def invoice_file(invoice_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    from fastapi.responses import FileResponse
    row = db.get(Invoice, invoice_id)
    if not row or not Path(row.stored_path).is_file(): raise HTTPException(404, "Không tìm thấy file hóa đơn")
    return FileResponse(row.stored_path, media_type=row.mime_type, filename=row.original_name)
