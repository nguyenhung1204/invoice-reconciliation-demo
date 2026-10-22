from sqlalchemy import create_engine, func
from sqlalchemy.orm import Session

from app.api.invoices import ReviewIn, review_invoice
from app.core.database import Base
from app.models import Invoice, InvoiceItem


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
                type("ReviewUser", (), {"email": "accountant@example.test", "role": "accountant"})(),
            )

            assert result["status"] == "reviewed"
            assert len(result["items"]) == 2
            assert result["items"][0]["name"] == "Hàng mẫu"
            assert db.query(func.count(InvoiceItem.id)).scalar() == 2
            assert {row.data_source for row in db.query(InvoiceItem).all()} == {"manual_review"}
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()
