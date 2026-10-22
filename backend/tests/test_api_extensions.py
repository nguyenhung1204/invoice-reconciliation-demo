from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import auth, invoices, ledger
from app.core.database import Base, get_db
from app.core.dependencies import current_user
from app.core.security import hash_password, verify_password
from app.models import AuditEvent, GoodsReceipt, Invoice, PurchaseOrder, Supplier, User


@pytest.fixture
def api():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    app = FastAPI()
    app.include_router(auth.router, prefix="/api")
    app.include_router(ledger.router, prefix="/api")
    app.include_router(invoices.router, prefix="/api")
    app.state.identity = SimpleNamespace(id=1, email="accountant@example.test", role="accountant")

    def db_override():
        with factory() as db:
            yield db

    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[current_user] = lambda: app.state.identity
    client = TestClient(app)
    yield client, factory, app
    client.close()
    engine.dispose()


def add_user(factory, email, role="accountant", password="old-password"):
    with factory() as db:
        user = User(email=email, role=role, password_hash=hash_password(password))
        db.add(user); db.commit(); db.refresh(user)
        return user.id


def test_change_password_validates_and_audits(api):
    client, factory, app = api
    user_id = add_user(factory, "accountant@example.test")
    app.state.identity.id = user_id
    app.state.identity.password_hash = hash_password("old-password")
    app.dependency_overrides[current_user] = lambda db=Depends(get_db): db.get(User, user_id)
    assert client.post("/api/auth/change-password", json={"old_password": "wrong-password", "new_password": "new-password"}).status_code == 400
    assert client.post("/api/auth/change-password", json={"old_password": "old-password", "new_password": "short"}).status_code == 422
    response = client.post("/api/auth/change-password", json={"old_password": "old-password", "new_password": "new-password"})
    assert response.status_code == 200
    with factory() as db:
        user = db.get(User, user_id)
        assert verify_password("new-password", user.password_hash)
        assert db.query(AuditEvent).filter_by(action="auth.change_password").count() == 1


def test_logout_records_audit(api):
    client, factory, app = api
    app.state.identity.id = add_user(factory, "logout@example.test")
    assert client.post("/api/auth/logout").status_code == 200
    with factory() as db:
        assert db.query(AuditEvent).filter_by(action="auth.logout").count() == 1


def test_admin_user_management_permissions_and_invalid_data(api):
    client, factory, app = api
    target_id = add_user(factory, "target@example.test")
    app.state.identity.id = add_user(factory, "admin@example.test", role="admin")
    app.state.identity.email = "admin@example.test"
    assert client.patch(f"/api/auth/users/{target_id}", json={"role": "admin"}).status_code == 403
    app.state.identity.role = "admin"
    assert client.patch(f"/api/auth/users/{target_id}", json={"role": "not-a-role"}).status_code == 422
    assert client.patch(f"/api/auth/users/{target_id}", json={"new_password": "tiny"}).status_code == 422
    assert client.patch(f"/api/auth/users/{target_id}", json={"role": "chief_accountant", "active": False, "new_password": "reset-password"}).status_code == 200
    assert client.delete(f"/api/auth/users/{app.state.identity.id}").status_code == 400
    assert client.delete(f"/api/auth/users/{target_id}").status_code == 200
    assert client.delete(f"/api/auth/users/{target_id}").status_code == 404


def test_invoice_delete_permissions_file_and_missing_file(api):
    client, factory, app = api
    with TemporaryDirectory() as folder:
        filepath = Path(folder) / "invoice.pdf"
        filepath.write_bytes(b"invoice")
        with factory() as db:
            approved = Invoice(original_name="approved.pdf", stored_path=str(filepath), status="approved")
            db.add(approved); db.commit(); db.refresh(approved); invoice_id = approved.id
        app.state.identity.role = "chief_accountant"
        assert client.delete(f"/api/invoices/{invoice_id}").status_code == 403
        app.state.identity.role = "accountant"
        assert client.delete(f"/api/invoices/{invoice_id}").status_code == 403
        app.state.identity.role = "admin"
        assert client.delete(f"/api/invoices/{invoice_id}").status_code == 200
        assert not filepath.exists()
        with factory() as db:
            orphan = Invoice(original_name="missing.pdf", stored_path=str(filepath), status="reviewed")
            db.add(orphan); db.commit(); db.refresh(orphan); missing_id = orphan.id
        assert client.delete(f"/api/invoices/{missing_id}").status_code == 404


def test_invoice_delete_chief_can_delete_unapproved(api):
    client, factory, app = api
    with TemporaryDirectory() as folder:
        filepath = Path(folder) / "invoice.pdf"; filepath.write_bytes(b"invoice")
        with factory() as db:
            row = Invoice(original_name="reviewed.pdf", stored_path=str(filepath), status="reviewed")
            db.add(row); db.commit(); db.refresh(row); invoice_id = row.id
        app.state.identity.role = "chief_accountant"
        assert client.delete(f"/api/invoices/{invoice_id}").status_code == 200


def test_invoice_queue_hides_archived_records_unless_requested(api):
    client, factory, _ = api
    with factory() as db:
        db.add_all([
            Invoice(original_name="invoice-test-1.pdf", stored_path="invoice-test-1.pdf", status="needs_review"),
            Invoice(original_name="HD_002.pdf", stored_path="hd002.pdf", status="archived"),
        ])
        db.commit()

    active = client.get("/api/invoices").json()
    archived = client.get("/api/invoices", params={"status_filter": "archived"}).json()

    assert [row["original_name"] for row in active] == ["invoice-test-1.pdf"]
    assert [row["original_name"] for row in archived] == ["HD_002.pdf"]


def test_po_patch_delete_validation_and_audit(api):
    client, factory, app = api
    with factory() as db:
        supplier = Supplier(tax_code="123", name="Supplier")
        db.add(supplier); db.flush()
        po = PurchaseOrder(po_number="PO-1", supplier_id=supplier.id, supplier_tax_code="123", total_amount=10)
        db.add(po); db.commit(); db.refresh(po); po_id = po.id
    assert client.patch(f"/api/ledger/purchase-orders/{po_id}", json={}).status_code == 422
    assert client.patch(f"/api/ledger/purchase-orders/{po_id}", json={"total_amount": -1}).status_code == 422
    assert client.patch(f"/api/ledger/purchase-orders/{po_id}", json={"status": "closed"}).status_code == 200
    assert client.delete(f"/api/ledger/purchase-orders/{po_id}").status_code == 200
    assert client.delete(f"/api/ledger/purchase-orders/{po_id}").status_code == 404
    with factory() as db:
        assert db.query(AuditEvent).filter(AuditEvent.action.like("purchase_order.%")).count() == 2


def test_po_delete_rejects_referenced_po(api):
    client, factory, _ = api
    with factory() as db:
        supplier = Supplier(tax_code="123", name="Supplier")
        db.add(supplier); db.flush()
        po = PurchaseOrder(po_number="PO-2", supplier_id=supplier.id, supplier_tax_code="123", total_amount=10)
        db.add(po); db.flush()
        db.add(GoodsReceipt(receipt_number="GR-1", po_id=po.id, po_number="PO-2", purchase_order=po)); db.commit(); db.refresh(po); po_id = po.id
    assert client.delete(f"/api/ledger/purchase-orders/{po_id}").status_code == 409


def test_gr_patch_delete_validation_and_permissions(api):
    client, factory, app = api
    with factory() as db:
        supplier = Supplier(tax_code="123", name="Supplier")
        db.add(supplier); db.flush()
        po = PurchaseOrder(po_number="PO-3", supplier_id=supplier.id, supplier_tax_code="123", total_amount=10)
        db.add(po); db.flush()
        gr = GoodsReceipt(receipt_number="GR-3", po_id=po.id, po_number="PO-3", purchase_order=po)
        db.add_all([po, gr]); db.commit(); db.refresh(gr); gr_id = gr.id
    assert client.patch(f"/api/ledger/goods-receipts/{gr_id}", json={}).status_code == 422
    assert client.patch(f"/api/ledger/goods-receipts/{gr_id}", json={"po_number": "missing"}).status_code == 404
    assert client.patch(f"/api/ledger/goods-receipts/{gr_id}", json={"receipt_number": "GR-4"}).status_code == 200
    assert client.delete(f"/api/ledger/goods-receipts/{gr_id}").status_code == 200
    assert client.delete(f"/api/ledger/goods-receipts/{gr_id}").status_code == 404
