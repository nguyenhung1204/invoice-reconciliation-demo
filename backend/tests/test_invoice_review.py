import asyncio
from io import BytesIO

from sqlalchemy import create_engine, func
from sqlalchemy.orm import Session
from fastapi import HTTPException
import pytest
from starlette.datastructures import Headers, UploadFile

from app.api import invoices as invoice_api
from app.api.invoices import ReviewIn, approve_invoice, reconcile_invoice, review_invoice
from app.core.database import Base
from app.models import (
    GoodsReceipt, Invoice, InvoiceApproval, InvoiceItem, InvoiceOCRRun, InvoiceReview,
    PurchaseOrder, ReconciliationLineAllocation, ReconciliationRun,
    ReconciliationRunGoodsReceipt, ReconciliationSetting, Supplier, User,
)
from app.api.invoices import _allocate_reconciliation_lines
from app.services import reconciliation_settings
from app.services.invoice_lines import sync_invoice_items
from app.services.invoice_lifecycle import delete_invoice_dependents
from app.services.procurement_lines import sync_goods_receipt_lines, sync_purchase_order_lines


def test_accountant_review_saves_normalized_invoice_lines(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'review-test.db'}")
    Base.metadata.create_all(engine)
    try:
        with Session(engine, expire_on_commit=False) as db:
            invoice = Invoice(
                original_name="review-sample.pdf",
                stored_path=str(tmp_path / "review-sample.pdf"),
                mime_type="application/pdf",
                status="needs_review",
            )
            db.add(invoice)
            reviewer = User(email="accountant@example.test", password_hash="x", role="accountant")
            db.add(reviewer)
            db.commit()

            result = review_invoice(
                invoice.id,
                ReviewIn(
                    seller_tax_code="0100000000",
                    seller_name="Nhà cung cấp thử nghiệm",
                    invoice_series="1C26TAA",
                    buyer_tax_code="0200000000",
                    invoice_number="12345",
                    invoice_date="2026-01-20",
                    total_amount=1250,
                    items=[
                        {"name": "Hàng mẫu", "unit": "Chiếc", "quantity": 2, "unit_price": 500, "amount": 1000},
                        {"description": "Phí vận chuyển", "quantity": 1, "unit_price": 250, "amount": 250},
                    ],
                    po_number="PO-TEST",
                    review_note="Đã kiểm tra PDF gốc",
                ),
                db,
                reviewer,
            )

            assert result["status"] == "reviewed"
            assert result["seller_name"] == "Nhà cung cấp thử nghiệm"
            assert result["invoice_series"] == "1C26TAA"
            assert len(result["items"]) == 2
            assert result["items"][0]["name"] == "Hàng mẫu"
            assert db.query(func.count(InvoiceItem.id)).scalar() == 2
            assert {row.data_source for row in db.query(InvoiceItem).all()} == {"manual_review"}
            review = db.query(InvoiceReview).one()
            assert review.revision_number == 1
            assert review.snapshot_json["invoice_number"] == "12345"
            assert review.snapshot_json["po_reference_text"] == "PO-TEST"
            assert len(review.snapshot_json["items"]) == 2
            assert len(review.content_hash) == 64
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()


def test_reconciliation_and_approval_are_saved_against_review_snapshot(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'workflow-history.db'}")
    Base.metadata.create_all(engine)
    try:
        with Session(engine, expire_on_commit=False) as db:
            supplier = Supplier(tax_code="0108075931", name="Demo Supplier")
            reviewer = User(email="reviewer@example.test", password_hash="x", role="accountant")
            approver = User(email="approver@example.test", password_hash="x", role="chief_accountant")
            db.add_all([supplier, reviewer, approver])
            db.flush()
            po = PurchaseOrder(po_number="PO-1", supplier_id=supplier.id, supplier_tax_code=supplier.tax_code, total_amount=100)
            db.add(po)
            db.flush()
            sync_purchase_order_lines(po, [{"name": "Widget", "unit": "Cái", "quantity": 2, "unit_price": 50, "amount": 100}])
            gr_one = GoodsReceipt(receipt_number="GR-1", po_id=po.id, po_number=po.po_number, purchase_order=po)
            gr_two = GoodsReceipt(receipt_number="GR-2", po_id=po.id, po_number=po.po_number, purchase_order=po)
            db.add_all([gr_one, gr_two])
            db.flush()
            sync_goods_receipt_lines(gr_one, [{"name": "Widget", "unit": "Cái", "quantity": 1}])
            sync_goods_receipt_lines(gr_two, [{"name": "Widget", "unit": "Cái", "quantity": 1}])
            invoice = Invoice(
                original_name="invoice.pdf", stored_path=str(tmp_path / "invoice.pdf"),
                status="needs_review", seller_tax_code=supplier.tax_code, seller_supplier_id=supplier.id,
                buyer_tax_code="5000863573", invoice_number="INV-1", invoice_date="2026-10-22",
                total_amount=100, po_id=po.id, po_number=po.po_number, po_reference_text=po.po_number,
            )
            db.add(invoice)
            db.flush()
            sync_invoice_items(invoice, [{"name": "Widget", "unit": "Cái", "quantity": 2, "unit_price": 50, "amount": 100}], source="manual_review")
            db.commit()

            review_invoice(invoice.id, ReviewIn(
                seller_tax_code=supplier.tax_code, buyer_tax_code="5000863573", invoice_number="INV-1",
                invoice_date="2026-10-22", total_amount=100,
                items=[{"name": "Widget", "unit": "Cái", "quantity": 2, "unit_price": 50, "amount": 100}],
                po_number="PO-1", review_note="Đã kiểm tra",
            ), db, reviewer)
            invoice.total_amount = 101
            db.commit()
            with pytest.raises(HTTPException) as error:
                reconcile_invoice(invoice.id, db, reviewer)
            assert error.value.status_code == 409
            invoice.total_amount = 100
            db.commit()
            reconciled = reconcile_invoice(invoice.id, db, reviewer)

            assert reconciled["status"] == "matched", reconciled["warnings"]
            run = db.query(ReconciliationRun).one()
            assert run.review_id == db.query(InvoiceReview).one().review_id
            assert run.po_id == po.id
            assert db.query(ReconciliationRunGoodsReceipt).count() == 2
            allocations = db.query(ReconciliationLineAllocation).all()
            assert len(allocations) == 2
            assert sum(allocation.allocated_quantity for allocation in allocations) == 2
            assert sum(allocation.allocated_amount for allocation in allocations) == 100

            po.total_amount = 101
            db.commit()
            with pytest.raises(HTTPException) as error:
                approve_invoice(invoice.id, db, approver)
            assert error.value.status_code == 409
            po.total_amount = 100
            db.commit()

            approved = approve_invoice(invoice.id, db, approver)
            assert approved["status"] == "approved"
            approval = db.query(InvoiceApproval).one()
            assert approval.review_id == run.review_id
            assert approval.reconciliation_run_id == run.reconciliation_run_id
            assert approval.approved_amount == 100
            assert approval.snapshot_json["invoice_number"] == "INV-1"
            assert len(approval.content_hash) == 64
            with pytest.raises(HTTPException) as error:
                approve_invoice(invoice.id, db, approver)
            assert error.value.status_code == 409

            delete_invoice_dependents(db, invoice.id)
            db.query(Invoice).filter_by(id=invoice.id).delete(synchronize_session=False)
            db.commit()
            assert db.query(InvoiceReview).count() == 0
            assert db.query(ReconciliationRun).count() == 0
            assert db.query(ReconciliationLineAllocation).count() == 0
            assert db.query(InvoiceApproval).count() == 0
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()


def test_line_allocation_uses_database_similarity_threshold(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'line-threshold.db'}")
    Base.metadata.create_all(engine)
    settings_file = tmp_path / "legacy-settings.json"
    settings_file.write_text(
        '{"currency_tolerance":1,"item_similarity_threshold":90,"ocr_confidence_min":0.8}',
        encoding="utf-8",
    )
    monkeypatch.setattr(reconciliation_settings, "SETTINGS_PATH", settings_file)
    try:
        with Session(engine, expire_on_commit=False) as db:
            supplier = Supplier(tax_code="SUP-THRESHOLD", name="Threshold supplier")
            db.add(supplier)
            db.flush()
            po = PurchaseOrder(
                po_number="PO-THRESHOLD", supplier_id=supplier.id,
                supplier_tax_code=supplier.tax_code, total_amount=100,
            )
            invoice = Invoice(
                original_name="threshold.pdf", stored_path="threshold.pdf",
                status="needs_review", total_amount=100, po_id=None,
            )
            db.add_all([po, invoice])
            db.flush()
            sync_purchase_order_lines(po, [{
                "name": "Widget", "unit": "Cái", "quantity": 1,
                "unit_price": 100, "amount": 100,
            }])
            sync_invoice_items(invoice, [{
                "name": "Widgets", "unit": "Cái", "quantity": 1,
                "unit_price": 100, "amount": 100,
            }], source="manual_review")
            run = ReconciliationRun(invoice_id=invoice.id, status="completed")
            db.add_all([
                run,
                ReconciliationSetting(
                    id=1, currency_tolerance=1,
                    item_similarity_threshold=100, ocr_confidence_min=0.8,
                ),
            ])
            db.flush()

            _allocate_reconciliation_lines(db, run, invoice, po, [], [])
            db.flush()

            allocation = db.query(ReconciliationLineAllocation).one()
            assert allocation.po_item_id is None
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()


def test_upload_and_retry_ocr_use_database_confidence_threshold(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'ocr-threshold.db'}")
    Base.metadata.create_all(engine)
    settings_file = tmp_path / "legacy-ocr-settings.json"
    settings_file.write_text(
        '{"currency_tolerance":1,"item_similarity_threshold":90,"ocr_confidence_min":0.8}',
        encoding="utf-8",
    )
    monkeypatch.setattr(reconciliation_settings, "SETTINGS_PATH", settings_file)
    monkeypatch.setattr(invoice_api.settings, "upload_dir", str(tmp_path / "uploads"))
    monkeypatch.setattr(invoice_api, "recognize_file", lambda _path: {
        "text": "invoice text", "confidence": 0.85, "blocks": [],
    })
    try:
        with Session(engine, expire_on_commit=False) as db:
            user = User(email="ocr@example.test", password_hash="x", role="admin")
            db.add_all([
                user,
                ReconciliationSetting(
                    id=1, currency_tolerance=1,
                    item_similarity_threshold=90, ocr_confidence_min=0.9,
                ),
            ])
            db.commit()

            upload = UploadFile(
                filename="threshold.pdf", file=BytesIO(b"%PDF-test"),
                headers=Headers({"content-type": "application/pdf"}),
            )
            created = asyncio.run(invoice_api.upload_invoice(upload, db, user))
            assert created["status"] == "needs_review"
            assert db.query(InvoiceOCRRun).one().config_json["minimum_confidence"] == 0.9

            retried = asyncio.run(invoice_api.retry_ocr(created["id"], db, user))
            assert retried["status"] == "needs_review"
            assert [run.config_json["minimum_confidence"] for run in db.query(InvoiceOCRRun).all()] == [0.9, 0.9]
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()
