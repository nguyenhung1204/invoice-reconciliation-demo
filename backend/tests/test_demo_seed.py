import hashlib
import json
from pathlib import Path

from sqlalchemy import create_engine, func
from sqlalchemy.orm import Session

from app.core.database import Base
from app.models import GoodsReceipt, Invoice, InvoiceItem, PurchaseOrder, Supplier
from app.services.demo_seed import seed_public_demo
from app.services.invoice_lines import invoice_items_for_api
from app.services.reconciliation import reconcile


def _engine_and_session(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'demo-seed.sqlite'}")
    Base.metadata.create_all(engine)
    return engine, Session(engine, expire_on_commit=False)


def _fixture_and_manifest(tmp_path):
    fixture_path = tmp_path / "HD_001.pdf"
    fixture_path.write_bytes(b"%PDF-1.4 verified source invoice fixture")
    item_one = {
        "name": "Chuột không dây",
        "unit": "Cái",
        "quantity": 1,
        "unit_price": 300000,
        "amount": 330000,
    }
    item_two = {
        "name": "Tai nghe không dây",
        "unit": "Cái",
        "quantity": 1,
        "unit_price": 409091,
        "amount": 450000,
    }
    manifest = {
        "supplier": {"tax_code": "0108075931", "name": "Công ty nhà cung cấp"},
        "invoice": {
            "seller_tax_code": "0108075931",
            "buyer_tax_code": "5000863573",
            "invoice_number": "1C22THT / 506572",
            "invoice_date": "2022-10-09",
            "total_amount": 780000,
            "po_number": "PO-DEMO-HD001",
            "review_note": "PDF nguồn; PO và GR là chứng từ minh họa.",
            "items": [item_one, item_two],
        },
        "purchase_order": {
            "po_number": "PO-DEMO-HD001",
            "supplier_tax_code": "0108075931",
            "total_amount": 780000,
            "status": "open",
            "lines": [item_one, item_two],
        },
        "goods_receipt": {
            "receipt_number": "GR-DEMO-HD001",
            "po_number": "PO-DEMO-HD001",
            "lines": [
                {"name": item_one["name"], "unit": "Cái", "quantity": 1},
                {"name": item_two["name"], "unit": "Cái", "quantity": 1},
            ],
        },
    }
    fixture_path.with_suffix(".json").write_text(
        json.dumps(manifest, ensure_ascii=False), encoding="utf-8"
    )
    return fixture_path, manifest


def _seed(db, tmp_path, fixture_path):
    return seed_public_demo(
        db,
        upload_dir=str(tmp_path / "uploads"),
        fixture_path=str(fixture_path),
    )


def test_seed_public_demo_uses_manifest_for_one_matched_invoice_flow(tmp_path):
    fixture_path, manifest = _fixture_and_manifest(tmp_path)
    engine, db = _engine_and_session(tmp_path)
    try:
        counts = _seed(db, tmp_path, fixture_path)

        supplier = db.query(Supplier).filter_by(tax_code="0108075931").one()
        purchase_order = db.query(PurchaseOrder).filter_by(po_number="PO-DEMO-HD001").one()
        receipt = db.query(GoodsReceipt).filter_by(receipt_number="GR-DEMO-HD001").one()
        invoice = db.query(Invoice).filter_by(
            sha256=hashlib.sha256(fixture_path.read_bytes()).hexdigest()
        ).one()

        assert counts["invoices_created"] == 1
        assert supplier.name == manifest["supplier"]["name"]
        assert purchase_order.supplier_tax_code == supplier.tax_code
        assert purchase_order.total_amount == 780000
        assert purchase_order.lines == manifest["purchase_order"]["lines"]
        assert receipt.po_number == purchase_order.po_number
        assert receipt.lines == manifest["goods_receipt"]["lines"]
        assert invoice.seller_tax_code == supplier.tax_code
        assert invoice.buyer_tax_code == "5000863573"
        assert invoice.invoice_number == "1C22THT / 506572"
        assert invoice.invoice_date == "2022-10-09"
        assert invoice.po_number == purchase_order.po_number
        assert invoice.total_amount == 780000
        assert invoice.status == "needs_review"
        assert [row.item_description for row in invoice.item_rows] == [
            row["name"] for row in manifest["invoice"]["items"]
        ]
        api_items = invoice_items_for_api(invoice)
        assert len(api_items) == len(manifest["invoice"]["items"])
        for api_item, expected_item in zip(api_items, manifest["invoice"]["items"]):
            assert {key: api_item[key] for key in expected_item} == expected_item
        assert reconcile(invoice, purchase_order, receipt) == []
        assert Path(invoice.stored_path).name == "HD_001.pdf"
        assert Path(invoice.stored_path).read_bytes() == fixture_path.read_bytes()
    finally:
        db.close()
        Base.metadata.drop_all(engine)
        engine.dispose()


def test_initialize_seeds_public_demo_when_enabled(tmp_path, monkeypatch):
    from app import main

    fixture_path, _ = _fixture_and_manifest(tmp_path)
    engine = create_engine(f"sqlite:///{tmp_path / 'initialize-demo.sqlite'}")
    monkeypatch.setattr(main, "engine", engine)
    monkeypatch.setattr(main, "SessionLocal", lambda: Session(engine, expire_on_commit=False))
    monkeypatch.setattr(main.settings, "database_url", f"sqlite:///{tmp_path / 'initialize-demo.sqlite'}")
    monkeypatch.setattr(main.settings, "upload_dir", str(tmp_path / "uploads"))
    monkeypatch.setattr(main.settings, "load_demo_seed", True, raising=False)
    monkeypatch.setattr(main.settings, "demo_invoice_fixture_path", str(fixture_path), raising=False)

    try:
        main.initialize()

        with Session(engine) as db:
            assert db.query(func.count(Invoice.id)).scalar() == 1
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()


def test_initialize_skips_public_demo_when_disabled(tmp_path, monkeypatch):
    from app import main

    engine = create_engine(f"sqlite:///{tmp_path / 'initialize-without-demo.sqlite'}")
    monkeypatch.setattr(main, "engine", engine)
    monkeypatch.setattr(main, "SessionLocal", lambda: Session(engine, expire_on_commit=False))
    monkeypatch.setattr(main.settings, "database_url", f"sqlite:///{tmp_path / 'initialize-without-demo.sqlite'}")
    monkeypatch.setattr(main.settings, "upload_dir", str(tmp_path / "uploads"))
    monkeypatch.setattr(main.settings, "load_demo_seed", False, raising=False)

    try:
        main.initialize()

        with Session(engine) as db:
            assert db.query(func.count(Invoice.id)).scalar() == 0
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()


def test_seed_public_demo_is_idempotent_and_preserves_edits(tmp_path):
    fixture_path, _ = _fixture_and_manifest(tmp_path)
    engine, db = _engine_and_session(tmp_path)
    try:
        _seed(db, tmp_path, fixture_path)
        invoice = db.query(Invoice).one()
        invoice.invoice_number = "ACCOUNTANT-EDIT-001"
        db.commit()

        _seed(db, tmp_path, fixture_path)

        assert db.query(func.count(Supplier.id)).scalar() == 1
        assert db.query(func.count(PurchaseOrder.id)).scalar() == 1
        assert db.query(func.count(GoodsReceipt.id)).scalar() == 1
        assert db.query(func.count(Invoice.id)).scalar() == 1
        assert db.query(func.count(InvoiceItem.id)).scalar() == 2
        assert db.query(Invoice).one().invoice_number == "ACCOUNTANT-EDIT-001"
    finally:
        db.close()
        Base.metadata.drop_all(engine)
        engine.dispose()


def test_public_hd001_fixture_is_packaged_and_loadable_from_clean_checkout(tmp_path):
    fixture_path = (
        Path(__file__).resolve().parents[2]
        / "data"
        / "demo"
        / "public"
        / "HD_001.pdf"
    )
    manifest_path = fixture_path.with_suffix(".json")
    assert fixture_path.is_file(), "HD_001.pdf must be tracked in a clean clone"
    assert manifest_path.is_file(), "the matching demo metadata must be tracked"
    assert fixture_path.read_bytes().startswith(b"%PDF-")
    assert hashlib.sha256(fixture_path.read_bytes()).hexdigest() == (
        "8c5c584a68a63ca5cbd6890bf29a4b1780ff545a3f6bbc7feb806b9def1cf9ab"
    )
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert "tax_authority_code" not in manifest
    assert "address" not in manifest["supplier"]
    assert "phone" not in manifest["supplier"]

    engine, db = _engine_and_session(tmp_path)
    try:
        _seed(db, tmp_path, fixture_path)
        invoice = db.query(Invoice).one()
        assert Path(invoice.stored_path).is_file()
        assert Path(invoice.stored_path).read_bytes() == fixture_path.read_bytes()
        assert invoice.invoice_number == "1C22THT / 506572"
        assert db.query(func.count(Invoice.id)).scalar() == 1
    finally:
        db.close()
        Base.metadata.drop_all(engine)
        engine.dispose()
