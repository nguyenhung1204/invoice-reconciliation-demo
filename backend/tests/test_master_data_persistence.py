from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy import inspect
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.dependencies import current_user
from app.main import app
from app.models import AccountingVoucher, Customer, Employee, Product, ProductCategory, PurchaseOrder, ReconciliationSetting, Supplier
from app.migrations.runner import _upgrade_master_data


@pytest.fixture
def api():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    identity = SimpleNamespace(id=1, email="admin@example.test", role="admin")

    def db_override():
        with factory() as db:
            yield db

    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[current_user] = lambda: identity
    client = TestClient(app)
    yield client, factory, identity
    client.close()
    app.dependency_overrides.clear()
    engine.dispose()


def test_master_data_categories_and_products_are_persisted_with_foreign_keys(api):
    client, factory, _ = api

    category = client.post("/api/master-data/product-categories", json={
        "code": "LSP-TEST", "name": "Thiết bị thử nghiệm", "description": "Dữ liệu DEMO",
    })
    assert category.status_code == 201
    category_id = category.json()["id"]

    product = client.post("/api/master-data/products", json={
        "code": "SP-TEST", "name": "Sản phẩm thử nghiệm", "category_code": "LSP-TEST",
        "unit": "Chiếc", "cost_price": 100, "selling_price": 120, "stock_qty": 4,
    })
    assert product.status_code == 201
    assert product.json()["category_code"] == "LSP-TEST"
    assert client.delete("/api/master-data/product-categories/LSP-TEST").status_code == 409

    with factory() as db:
        category_row = db.get(ProductCategory, category_id)
        product_row = db.query(Product).filter_by(sku="SP-TEST").one()
        assert category_row.code == "LSP-TEST"
        assert product_row.product_name == "Sản phẩm thử nghiệm"
        assert float(product_row.cost_price) == 100

    assert client.delete("/api/master-data/products/SP-TEST").status_code == 200
    assert client.delete("/api/master-data/product-categories/LSP-TEST").status_code == 200


def test_customer_and_employee_crud_are_persistent_and_reject_duplicate_codes(api):
    client, factory, _ = api
    customer_payload = {
        "code": "KH-TEST", "name": "Khách hàng DEMO", "phone": "0900000000",
        "address": "Địa chỉ thử nghiệm", "email": "customer@example.test",
    }
    employee_payload = {
        "code": "NV-TEST", "full_name": "Nhân viên DEMO", "role": "Kế toán viên",
        "phone": "0911111111", "email": "employee@example.test",
    }

    customer = client.post("/api/master-data/customers", json=customer_payload)
    employee = client.post("/api/master-data/employees", json=employee_payload)
    assert customer.status_code == 201
    assert employee.status_code == 201
    assert client.post("/api/master-data/customers", json=customer_payload).status_code == 409

    updated = client.patch("/api/master-data/customers/KH-TEST", json={"phone": "0900000001"})
    assert updated.status_code == 200
    assert updated.json()["phone"] == "0900000001"
    assert client.get("/api/master-data/employees").json()[0]["code"] == "NV-TEST"

    with factory() as db:
        assert db.query(Customer).filter_by(code="KH-TEST").one().phone == "0900000001"
        assert db.query(Employee).filter_by(code="NV-TEST").count() == 1

    assert client.delete("/api/master-data/customers/KH-TEST").status_code == 200
    assert client.delete("/api/master-data/employees/NV-TEST").status_code == 200


def test_master_data_migration_adds_columns_without_removing_existing_products(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'existing-schema.sqlite'}")
    try:
        with engine.begin() as connection:
            connection.exec_driver_sql(
                "CREATE TABLE products (id INTEGER PRIMARY KEY, sku VARCHAR(80), "
                "product_name VARCHAR(500) NOT NULL, unit VARCHAR(80), active BOOLEAN NOT NULL DEFAULT 1, "
                "created_at DATETIME NOT NULL)"
            )
            connection.exec_driver_sql(
                "INSERT INTO products (id, sku, product_name, unit, active, created_at) "
                "VALUES (1, 'OLD-01', 'Sản phẩm đang có', 'Chiếc', 1, CURRENT_TIMESTAMP)"
            )
            connection.exec_driver_sql(
                "CREATE TABLE suppliers (id INTEGER PRIMARY KEY, tax_code VARCHAR(32) NOT NULL, "
                "name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL DEFAULT '', created_at DATETIME NOT NULL)"
            )
            connection.exec_driver_sql(
                "INSERT INTO suppliers (id, tax_code, name, email, created_at) "
                "VALUES (1, '0100000000', 'Nhà cung cấp cũ', '', CURRENT_TIMESTAMP)"
            )

        _upgrade_master_data(engine)

        columns = {column["name"] for column in inspect(engine).get_columns("products")}
        assert {"category_id", "cost_price", "selling_price", "stock_qty"}.issubset(columns)
        supplier_columns = {column["name"] for column in inspect(engine).get_columns("suppliers")}
        assert {"supplier_code", "address", "phone"}.issubset(supplier_columns)
        with engine.connect() as connection:
            row = connection.exec_driver_sql(
                "SELECT sku, product_name, cost_price, stock_qty FROM products WHERE id=1"
            ).one()
            supplier = connection.exec_driver_sql("SELECT tax_code, name, supplier_code, address, phone FROM suppliers WHERE id=1").one()
        assert row == ("OLD-01", "Sản phẩm đang có", 0, 0)
        assert supplier == ("0100000000", "Nhà cung cấp cũ", None, "", "")
        assert {"customers", "employees", "product_categories"}.issubset(inspect(engine).get_table_names())
    finally:
        engine.dispose()


def test_master_data_csv_import_creates_rows_and_reports_duplicates(api):
    client, factory, _ = api
    payload = (
        b"code,name,description\n"
        b"LSP-CSV,Loai CSV,Imported sample\n"
        b"LSP-CSV,Duplicate,Must be skipped\n"
    )
    response = client.post(
        "/api/master-data/import/product-categories",
        files={"file": ("categories.csv", payload, "text/csv")},
    )
    assert response.status_code == 200
    assert response.json() == {"created": 1, "skipped": 1, "total_rows": 2}
    with factory() as db:
        assert db.query(ProductCategory).filter_by(code="LSP-CSV").one().name == "Loai CSV"


def test_supplier_crud_is_persisted_and_cannot_delete_referenced_supplier(api):
    client, factory, _ = api
    created = client.post("/api/ledger/suppliers", json={
        "supplier_code": "NCC-TEST", "tax_code": "0100000001", "name": "Nhà cung cấp thử",
        "address": "Địa chỉ thử", "phone": "0900000001", "email": "supplier@example.test",
    })
    assert created.status_code == 201
    supplier_id = created.json()["id"]
    assert client.patch(f"/api/ledger/suppliers/{supplier_id}", json={"phone": "0900000002"}).json()["phone"] == "0900000002"
    with factory() as db:
        supplier = db.get(Supplier, supplier_id)
        assert supplier.supplier_code == "NCC-TEST"
        assert supplier.phone == "0900000002"

    assert client.delete(f"/api/ledger/suppliers/{supplier_id}").status_code == 200
    with factory() as db:
        supplier = Supplier(supplier_code="NCC-REF", tax_code="0100000002", name="Đang được tham chiếu")
        db.add(supplier)
        db.commit()
        supplier_id = supplier.id
        db.add(PurchaseOrder(po_number="PO-REF-01", supplier_id=supplier_id,
                             supplier_tax_code=supplier.tax_code, total_amount=100))
        db.commit()
    assert client.delete(f"/api/ledger/suppliers/{supplier_id}").status_code == 409


def test_reconciliation_settings_are_saved_and_read_from_database(api):
    client, factory, _ = api
    updated = {"currency_tolerance": 25, "item_similarity_threshold": 88, "ocr_confidence_min": 0.91}
    response = client.put("/api/reports/settings", json=updated)
    assert response.status_code == 200
    expected = {**client.get("/api/reports/settings").json(), **updated}
    assert response.json() == expected
    with factory() as db:
        row = db.get(ReconciliationSetting, 1)
        assert float(row.currency_tolerance) == 25
        assert row.item_similarity_threshold == 88
    assert client.get("/api/reports/settings").json() == expected


def test_accounting_vouchers_persist_and_reject_invalid_amounts(api):
    client, factory, _ = api
    payload = {
        "voucher_type": "CHI", "voucher_date": "2026-10-27", "related_party_name": "Nhà cung cấp DEMO",
        "content": "Thanh toán thử nghiệm", "amount": 1250000,
    }
    created = client.post("/api/accounting/vouchers", json=payload)
    assert created.status_code == 201
    row = created.json()
    assert row["voucher_number"].startswith("PC-")
    assert client.post("/api/accounting/vouchers", json={**payload, "amount": 0}).status_code == 422
    assert client.patch(f"/api/accounting/vouchers/{row['id']}", json={"amount": 1500000}).json()["amount"] == 1500000
    assert client.get("/api/accounting/vouchers").json()[0]["amount"] == 1500000
    with factory() as db:
        assert float(db.get(AccountingVoucher, row["id"]).amount) == 1500000
    assert client.delete(f"/api/accounting/vouchers/{row['id']}").status_code == 200
    assert client.get("/api/accounting/vouchers").json() == []
