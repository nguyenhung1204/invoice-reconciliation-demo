from sqlalchemy import create_engine, func
from sqlalchemy.orm import Session
from fastapi import HTTPException
import pytest

from app.api.invoices import ReviewIn, approve_invoice, reconcile_invoice, review_invoice
from app.core.database import Base
from app.models import (
    GoodsReceipt, Invoice, InvoiceApproval, InvoiceItem, InvoiceReview,
    PurchaseOrder, ReconciliationLineAllocation, ReconciliationRun,
    ReconciliationRunGoodsReceipt, Supplier, User,
)
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
