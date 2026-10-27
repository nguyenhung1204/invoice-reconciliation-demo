from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.ledger import router
from app.core.database import Base, get_db
from app.core.dependencies import current_user
from app.models import GoodsReceiptItem, PurchaseOrderItem, Supplier


def make_client(role):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    app = FastAPI()
    app.include_router(router, prefix="/api")

    def db_override():
        with factory() as db:
            yield db

    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[current_user] = lambda: SimpleNamespace(email=f"{role}@example.test", role=role)
    return TestClient(app), engine, factory


def test_legacy_fake_sample_seed_route_is_removed():
    client, engine, _ = make_client("admin")
    try:
        response = client.post("/api/ledger/seed-sample")
        assert response.status_code == 404
    finally:
        engine.dispose()


def test_ledger_writes_po_and_gr_lines_to_normalized_tables():
    client, engine, factory = make_client("accountant")
    try:
        with factory() as db:
            db.add(Supplier(tax_code="0108075931", name="Demo supplier"))
            db.commit()

        po_response = client.post("/api/ledger/purchase-orders", json={
            "po_number": "PO-NORMALIZED-1",
            "supplier_tax_code": "0108075931",
            "total_amount": 100,
            "lines": [{"name": "Demo item", "unit": "Cái", "quantity": 2, "unit_price": 50, "amount": 100}],
        })
        assert po_response.status_code == 201
        assert po_response.json()["lines"][0]["name"] == "Demo item"

        gr_response = client.post("/api/ledger/goods-receipts", json={
            "receipt_number": "GR-NORMALIZED-1",
            "po_number": "PO-NORMALIZED-1",
            "lines": [{"name": "Demo item", "unit": "Cái", "quantity": 2}],
        })
        assert gr_response.status_code == 201
        assert gr_response.json()["lines"][0]["name"] == "Demo item"

        with factory() as db:
            po_lines = db.query(PurchaseOrderItem).all()
            gr_lines = db.query(GoodsReceiptItem).all()
            assert len(po_lines) == len(gr_lines) == 1
            assert gr_lines[0].po_item_id == po_lines[0].id
            assert gr_lines[0].goods_receipt.po_id == po_lines[0].po_id
    finally:
        engine.dispose()


def test_ledger_rejects_po_with_unknown_supplier():
    client, engine, factory = make_client("accountant")
    try:
        response = client.post("/api/ledger/purchase-orders", json={
            "po_number": "PO-ORPHAN",
            "supplier_tax_code": "UNKNOWN",
            "total_amount": 100,
            "lines": [],
        })
        assert response.status_code == 404
        with factory() as db:
            from app.models import PurchaseOrder
            assert db.query(PurchaseOrder).count() == 0
    finally:
        engine.dispose()
