from datetime import date
from types import SimpleNamespace

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import reports
from app.core.database import Base, get_db
from app.core.dependencies import current_user
from app.models import Invoice
from app.services import reconciliation_settings, scheduler


@pytest.fixture
def api(monkeypatch, tmp_path):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    monkeypatch.setattr(reconciliation_settings, "SETTINGS_PATH", tmp_path / "settings.json")
    monkeypatch.setattr(scheduler, "REPORT_DIR", tmp_path / "reports")
    monkeypatch.setattr(scheduler, "SessionLocal", factory)
    app = FastAPI()
    app.include_router(reports.router, prefix="/api")
    app.state.identity = SimpleNamespace(email="acct@example.test", role="accountant")
    def db_override():
        with factory() as db:
            yield db
    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[current_user] = lambda: app.state.identity
    with TestClient(app) as client:
        yield client, factory, app
    engine.dispose()


def test_settings_defaults_role_validation_and_persistence(api):
    client, _, app = api
    assert client.get("/api/reports/settings").json() == {
        "currency_tolerance": 1.0, "item_similarity_threshold": 90, "ocr_confidence_min": 0.8}
    payload = {"currency_tolerance": 2.5, "item_similarity_threshold": 88, "ocr_confidence_min": 0.75}
    assert client.put("/api/reports/settings", json=payload).status_code == 403
    app.state.identity.role = "chief_accountant"
    assert client.put("/api/reports/settings", json={**payload, "item_similarity_threshold": 101}).status_code == 422
    assert client.put("/api/reports/settings", json=payload).json() == payload
    assert client.get("/api/reports/settings").json() == payload


def test_reconciliation_uses_saved_settings(api, monkeypatch):
    client, _, app = api
    app.state.identity.role = "admin"
    client.put("/api/reports/settings", json={"currency_tolerance": 3, "item_similarity_threshold": 90,
                                               "ocr_confidence_min": 0.8})
    from app.services.reconciliation import reconcile
    invoice = SimpleNamespace(seller_tax_code="1", total_amount=22, items=[])
    order = SimpleNamespace(supplier_tax_code="1", total_amount=20, lines=[])
    assert "AMOUNT_MISMATCH" not in {item["code"] for item in reconcile(invoice, order)}


def test_daily_report_job_and_download_route(api):
    client, factory, _ = api
    with factory() as db:
        db.add(Invoice(original_name="a.pdf", stored_path="a.pdf", invoice_number="INV-1",
                       invoice_date="01/01/2026", seller_tax_code="111", total_amount=100,
                       po_number="PO-1", status="mismatch", warnings=[{"code": "MATH_ERROR", "message": "line total"}]))
        db.commit()
    path = scheduler.generate_daily_reconciliation_report(date(2026, 1, 2))
    assert path.is_file()
    assert "MATH_ERROR" in path.read_text(encoding="utf-8-sig")
    response = client.get("/api/reports/reconciliation.csv")
    assert response.status_code == 200
    assert "invoice_id" in response.text and "MATH_ERROR" in response.text


def test_dashboard_excludes_archived_invoices(api):
    client, factory, _ = api
    with factory() as db:
        db.add_all([
            Invoice(original_name="invoice-1.pdf", stored_path="invoice-1.pdf", status="needs_review",
                    seller_tax_code="SUPPLIER-001"),
            Invoice(original_name="invoice-2.pdf", stored_path="invoice-2.pdf", status="archived",
                    seller_tax_code="SUPPLIER-001"),
        ])
        db.commit()

    dashboard = client.get("/api/reports/dashboard").json()

    assert dashboard["total"] == 1
    assert dashboard["by_status"] == {"needs_review": 1}
    assert [row["name"] for row in dashboard["recent"]] == ["invoice-1.pdf"]
    assert dashboard["top_suppliers"][0]["invoices"] == 1
