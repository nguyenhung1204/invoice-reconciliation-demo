import json

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.dialects.mysql import dialect as mysql_dialect

from app.core.database import Base
from app.migrations.runner import upgrade_schema


def _legacy_database(path, *, supplier_tax_code="0108075931", po_lines=None):
    engine = create_engine(f"sqlite:///{path}")
    legacy_ddl = [
        "CREATE TABLE users (id INTEGER PRIMARY KEY, email VARCHAR(255), password_hash VARCHAR(255), role VARCHAR(40), active BOOLEAN, created_at DATETIME)",
        "CREATE TABLE suppliers (id INTEGER PRIMARY KEY, tax_code VARCHAR(32), name VARCHAR(255), email VARCHAR(255), created_at DATETIME)",
        "CREATE TABLE purchase_orders (id INTEGER PRIMARY KEY, po_number VARCHAR(80), supplier_tax_code VARCHAR(32), total_amount FLOAT, status VARCHAR(32), lines JSON, created_at DATETIME)",
        "CREATE TABLE goods_receipts (id INTEGER PRIMARY KEY, receipt_number VARCHAR(80), po_number VARCHAR(80), received_at DATETIME, lines JSON)",
        "CREATE TABLE invoices (id INTEGER PRIMARY KEY, original_name VARCHAR(255), stored_path VARCHAR(500), mime_type VARCHAR(100), sha256 VARCHAR(64), status VARCHAR(32), seller_tax_code VARCHAR(32), buyer_tax_code VARCHAR(32), invoice_number VARCHAR(80), invoice_date VARCHAR(32), total_amount FLOAT, items JSON, ocr_text TEXT, ocr_blocks JSON, ocr_confidence FLOAT, warnings JSON, po_number VARCHAR(80), review_note TEXT, created_at DATETIME, updated_at DATETIME)",
        "CREATE TABLE invoice_items (id INTEGER PRIMARY KEY, invoice_id INTEGER, line_number INTEGER, item_description TEXT, unit VARCHAR(80), quantity NUMERIC(18,4), unit_price NUMERIC(18,2), line_total NUMERIC(18,2), data_source VARCHAR(32), created_at DATETIME)",
        "CREATE TABLE audit_events (id INTEGER PRIMARY KEY, actor_email VARCHAR(255), action VARCHAR(80), entity_type VARCHAR(80), entity_id VARCHAR(80), detail TEXT, created_at DATETIME)",
    ]
    with engine.begin() as connection:
        for statement in legacy_ddl:
            connection.exec_driver_sql(statement)
        connection.execute(text("INSERT INTO suppliers VALUES (3, '0108075931', 'Demo supplier', '', CURRENT_TIMESTAMP)"))
        connection.execute(
            text("INSERT INTO purchase_orders VALUES (7, 'PO-DEMO-HD001', :tax, 780000, 'open', :lines, CURRENT_TIMESTAMP)"),
            {"tax": supplier_tax_code, "lines": json.dumps([
                {"name": "Chuột không dây", "unit": "Cái", "quantity": 1, "unit_price": 300000, "amount": 330000},
                {"name": "Tai nghe", "unit": "Cái", "quantity": 1, "unit_price": 409091, "amount": 450000},
            ] if po_lines is None else po_lines)},
        )
        connection.execute(
            text("INSERT INTO goods_receipts VALUES (11, 'GR-DEMO-HD001', 'PO-DEMO-HD001', CURRENT_TIMESTAMP, :lines)"),
            {"lines": json.dumps([
                {"name": "Chuột không dây", "unit": "Cái", "quantity": 1},
                {"name": "Tai nghe", "unit": "Cái", "quantity": 1},
            ])},
        )
        connection.execute(text("INSERT INTO invoices VALUES (13, 'HD_001.pdf', '/uploads/HD_001.pdf', 'application/pdf', 'abc123', 'needs_review', '0108075931', '5000863573', '1C22THT / 506572', '2022-10-09', 780000, :items, '', '[]', NULL, '[]', 'PO-DEMO-HD001', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"), {
            "items": json.dumps([
                {"name": "Chuột không dây", "unit": "Cái", "quantity": 1, "unit_price": 300000, "amount": 330000},
                {"name": "Tai nghe", "unit": "Cái", "quantity": 1, "unit_price": 409091, "amount": 450000},
            ]),
        })
        # Existing normalized invoice rows are authoritative; legacy JSON must not duplicate them.
        connection.execute(text("INSERT INTO invoice_items VALUES (101, 13, 1, 'Chuột không dây', 'Cái', 1, 300000, 330000, 'manual_review', CURRENT_TIMESTAMP)"))
        connection.execute(text("INSERT INTO invoice_items VALUES (102, 13, 2, 'Tai nghe', 'Cái', 1, 409091, 450000, 'manual_review', CURRENT_TIMESTAMP)"))
    return engine


def test_upgrade_backfills_fk_links_and_normalized_lines_without_duplicate_invoice_items(tmp_path):
    engine = _legacy_database(tmp_path / "legacy.sqlite")
    try:
        upgrade_schema(engine)

        with engine.connect() as connection:
            po = connection.execute(text("SELECT id, supplier_id FROM purchase_orders WHERE id=7")).one()
            gr = connection.execute(text("SELECT id, po_id FROM goods_receipts WHERE id=11")).one()
            invoice = connection.execute(text("SELECT id, po_id, seller_supplier_id FROM invoices WHERE id=13")).one()
            assert tuple(po) == (7, 3)
            assert tuple(gr) == (11, 7)
            assert tuple(invoice) == (13, 7, 3)
            assert connection.execute(text("SELECT COUNT(*) FROM purchase_order_items WHERE po_id=7")).scalar_one() == 2
            assert connection.execute(text("SELECT COUNT(*) FROM goods_receipt_items WHERE gr_id=11")).scalar_one() == 2
            assert connection.execute(text("SELECT COUNT(*) FROM invoice_items WHERE invoice_id=13")).scalar_one() == 2
            assert connection.execute(text("SELECT COUNT(*) FROM invoice_files WHERE invoice_id=13 AND sha256='abc123'")).scalar_one() == 1
            assert connection.execute(text("SELECT COUNT(*) FROM schema_migrations WHERE revision='0001_normalize_operational_data'")).scalar_one() == 1
    finally:
        engine.dispose()


def test_upgrade_is_idempotent(tmp_path):
    engine = _legacy_database(tmp_path / "repeat.sqlite")
    try:
        upgrade_schema(engine)
        upgrade_schema(engine)
        with engine.connect() as connection:
            assert connection.execute(text("SELECT COUNT(*) FROM purchase_order_items")).scalar_one() == 2
            assert connection.execute(text("SELECT COUNT(*) FROM goods_receipt_items")).scalar_one() == 2
            assert connection.execute(text("SELECT COUNT(*) FROM invoice_files")).scalar_one() == 1
            revisions = set(connection.execute(text("SELECT revision FROM schema_migrations")).scalars())
            assert revisions == {"0001_normalize_operational_data", "0002_preserve_reconciliation_snapshots"}
    finally:
        engine.dispose()


@pytest.mark.parametrize(
    ("supplier_tax_code", "po_lines", "message"),
    [
        ("MISSING-SUPPLIER", None, "supplier"),
        ("0108075931", [{"broken": object.__name__}], "line"),
    ],
)
def test_upgrade_rejects_unmigratable_legacy_data_without_recording_revision(tmp_path, supplier_tax_code, po_lines, message):
    engine = _legacy_database(
        tmp_path / f"invalid-{message}.sqlite",
        supplier_tax_code=supplier_tax_code,
        po_lines=po_lines,
    )
    if message == "line":
        with engine.begin() as connection:
            connection.execute(text("UPDATE purchase_orders SET lines='not-json' WHERE id=7"))
    try:
        with pytest.raises(ValueError, match=message):
            upgrade_schema(engine)
        if inspect(engine).has_table("schema_migrations"):
            with engine.connect() as connection:
                assert connection.execute(text("SELECT COUNT(*) FROM schema_migrations")).scalar_one() == 0
    finally:
        engine.dispose()


def test_upgrade_creates_current_schema_from_empty_database(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'empty.sqlite'}")
    try:
        upgrade_schema(engine)
        tables = set(inspect(engine).get_table_names())
        assert {
            "suppliers",
            "purchase_orders",
            "purchase_order_items",
            "goods_receipts",
            "goods_receipt_items",
            "invoices",
            "invoice_items",
            "invoice_files",
            "invoice_reviews",
            "reconciliation_runs",
            "reconciliation_line_allocations",
            "invoice_approvals",
            "invoice_payments",
        }.issubset(tables)
        independent_roots = {"schema_migrations", "users", "suppliers", "products", "datasets"}
        for table in tables - independent_roots:
            assert inspect(engine).get_foreign_keys(table), f"{table} must connect to the invoice workflow"
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()


def test_mysql_reserved_legacy_line_column_is_quoted():
    assert mysql_dialect().identifier_preparer.quote("lines") == "`lines`"
