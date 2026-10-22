"""Normalize procurement and invoice lines while retaining every legacy ID."""

from __future__ import annotations

import json
from decimal import Decimal, InvalidOperation
from pathlib import PurePath

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session


def _parse_lines(raw, *, document: str, document_id: int, required_fields: tuple[str, ...]):
    if raw is None or raw == "":
        return []
    try:
        lines = json.loads(raw) if isinstance(raw, str) else raw
    except (json.JSONDecodeError, TypeError) as exc:
        raise ValueError(f"Invalid {document} line JSON for id {document_id}") from exc
    if not isinstance(lines, list):
        raise ValueError(f"Invalid {document} line list for id {document_id}")
    parsed = []
    for index, line in enumerate(lines, start=1):
        if not isinstance(line, dict):
            raise ValueError(f"Invalid {document} line {index} for id {document_id}")
        description = str(line.get("name") or line.get("description") or "").strip()
        if not description:
            raise ValueError(f"Missing {document} line description at line {index}, id {document_id}")
        normalized = dict(line)
        normalized["_description"] = description
        for field in required_fields:
            value = line.get(field)
            if value is None or value == "":
                raise ValueError(f"Missing {document} {field} at line {index}, id {document_id}")
            try:
                parsed_value = Decimal(str(value))
                if not parsed_value.is_finite():
                    raise InvalidOperation
                normalized[f"_{field}"] = parsed_value
            except (InvalidOperation, ValueError, TypeError) as exc:
                raise ValueError(f"Invalid {document} {field} at line {index}, id {document_id}") from exc
        parsed.append(normalized)
    return parsed


def _table_rows(connection, table: str, columns: str):
    inspector = inspect(connection)
    if table not in set(inspector.get_table_names()):
        return []
    requested = [column.strip() for column in columns.split(",")]
    existing = {column["name"] for column in inspector.get_columns(table)}
    selected = [column for column in requested if column in existing]
    if not selected:
        return []
    quote = connection.dialect.identifier_preparer.quote
    selected_sql = ", ".join(quote(column) for column in selected)
    table_sql = quote(table)
    rows = []
    for row in connection.execute(text(f"SELECT {selected_sql} FROM {table_sql}")):
        result = dict(row._mapping)
        rows.append({column: result.get(column) for column in requested})
    return rows


def _preflight(connection):
    tables = set(inspect(connection).get_table_names())
    suppliers = _table_rows(connection, "suppliers", "id, tax_code")
    supplier_ids = {str(row["tax_code"]): row["id"] for row in suppliers}
    purchase_orders = _table_rows(connection, "purchase_orders", "id, po_number, supplier_tax_code, lines")
    known_pos = {str(row["po_number"]): row["id"] for row in purchase_orders}

    for order in purchase_orders:
        supplier_id = order.get("supplier_id") if "supplier_id" in order else None
        if supplier_id is None and str(order["supplier_tax_code"]) not in supplier_ids:
            raise ValueError(
                f"PO {order['po_number']} references missing supplier {order['supplier_tax_code']}"
            )

    receipts = _table_rows(connection, "goods_receipts", "id, receipt_number, po_number, po_id, lines")
    for receipt in receipts:
        if str(receipt["po_number"]) not in known_pos and not receipt.get("po_id"):
            raise ValueError(
                f"GR {receipt['receipt_number']} references missing PO {receipt['po_number']}"
            )

    po_items_existing = "purchase_order_items" in tables
    gr_items_existing = "goods_receipt_items" in tables
    normalized_invoice_items = "invoice_items" in tables
    order_lines = {}
    for order in purchase_orders:
        has_lines = False
        if po_items_existing:
            has_lines = connection.execute(
                text("SELECT 1 FROM purchase_order_items WHERE po_id=:id LIMIT 1"), {"id": order["id"]}
            ).first() is not None
        if not has_lines:
            order_lines[order["id"]] = _parse_lines(
                order.get("lines"), document="PO", document_id=order["id"],
                required_fields=("quantity", "unit_price"),
            )

    receipt_lines = {}
    for receipt in receipts:
        has_lines = False
        if gr_items_existing:
            has_lines = connection.execute(
                text("SELECT 1 FROM goods_receipt_items WHERE gr_id=:id LIMIT 1"), {"id": receipt["id"]}
            ).first() is not None
        if not has_lines:
            receipt_lines[receipt["id"]] = _parse_lines(
                receipt.get("lines"), document="GR", document_id=receipt["id"],
                required_fields=("quantity",),
            )

    invoices = _table_rows(
        connection, "invoices",
        "id, original_name, stored_path, mime_type, sha256, seller_tax_code, po_number, items",
    )
    invoice_items_existing = "invoice_items" in tables
    invoice_lines = {}
    for invoice in invoices:
        has_lines = False
        if invoice_items_existing:
            has_lines = connection.execute(
                text("SELECT 1 FROM invoice_items WHERE invoice_id=:id LIMIT 1"), {"id": invoice["id"]}
            ).first() is not None
        if not has_lines:
            invoice_lines[invoice["id"]] = _parse_lines(
                invoice.get("items"), document="invoice", document_id=invoice["id"],
                required_fields=(),
            )

    return {
        "supplier_ids": supplier_ids,
        "po_ids": known_pos,
        "purchase_orders": purchase_orders,
        "goods_receipts": receipts,
        "invoices": invoices,
        "order_lines": order_lines,
        "receipt_lines": receipt_lines,
        "invoice_lines": invoice_lines,
    }


def _add_legacy_columns(connection, dialect: str) -> None:
    integer = "INTEGER"
    decimal = "DECIMAL(18,2)" if dialect == "mysql" else "NUMERIC(18,2)"
    column_specs = {
        "purchase_orders": {"supplier_id": f"{integer} NULL"},
        "goods_receipts": {"po_id": f"{integer} NULL"},
        "invoices": {
            "seller_supplier_id": f"{integer} NULL",
            "po_id": f"{integer} NULL",
            "po_reference_text": "VARCHAR(80) NOT NULL DEFAULT ''",
            "currency_code": "CHAR(3) NOT NULL DEFAULT 'VND'",
            "subtotal_amount": f"{decimal} NULL",
            "tax_amount": f"{decimal} NULL",
        },
        "invoice_items": {
            "product_id": f"{integer} NULL",
            "tax_rate": "DECIMAL(7,4) NULL" if dialect == "mysql" else "NUMERIC(7,4) NULL",
        },
        "audit_events": {"actor_user_id": f"{integer} NULL"},
    }
    inspector = inspect(connection)
    for table, columns in column_specs.items():
        if table not in inspector.get_table_names():
            continue
        existing = {column["name"] for column in inspector.get_columns(table)}
        for name, specification in columns.items():
            if name not in existing:
                connection.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {name} {specification}")


def _relative_path(path: str | None) -> str:
    if not path:
        return ""
    value = PurePath(path)
    parts = list(value.parts)
    for anchor in ("uploads", "upload"):
        if anchor in parts:
            return str(PurePath(*parts[parts.index(anchor) + 1:]))
    return str(PurePath(*[part for part in parts if part not in ("/", "\\")]))


def _backfill(engine: Engine, snapshot: dict) -> None:
    from app.models import (
        GoodsReceiptItem,
        Invoice,
        InvoiceFile,
        InvoiceItem,
        PurchaseOrderItem,
        Supplier,
    )

    with engine.begin() as connection:
        connection.execute(text(
            "UPDATE purchase_orders SET supplier_id=(SELECT suppliers.id FROM suppliers "
            "WHERE suppliers.tax_code=purchase_orders.supplier_tax_code) WHERE supplier_id IS NULL"
        ))
        connection.execute(text(
            "UPDATE goods_receipts SET po_id=(SELECT purchase_orders.id FROM purchase_orders "
            "WHERE purchase_orders.po_number=goods_receipts.po_number) WHERE po_id IS NULL"
        ))
        connection.execute(text(
            "UPDATE invoices SET seller_supplier_id=(SELECT suppliers.id FROM suppliers "
            "WHERE suppliers.tax_code=invoices.seller_tax_code) WHERE seller_supplier_id IS NULL"
        ))
        connection.execute(text(
            "UPDATE invoices SET po_id=(SELECT purchase_orders.id FROM purchase_orders "
            "WHERE purchase_orders.po_number=invoices.po_number) WHERE po_id IS NULL"
        ))
        connection.execute(text(
            "UPDATE invoices SET po_reference_text=po_number WHERE po_reference_text=''"
        ))

    with Session(engine, expire_on_commit=False) as session:
        # Map old JSON arrays by original line order. Existing invoice_items are authoritative.
        for order in snapshot["purchase_orders"]:
            if session.query(PurchaseOrderItem).filter_by(po_id=order["id"]).first():
                continue
            for index, line in enumerate(snapshot["order_lines"].get(order["id"], []), start=1):
                quantity = line["_quantity"]
                unit_price = line["_unit_price"]
                line_total = line.get("amount", line.get("line_total"))
                if line_total in (None, ""):
                    line_total = quantity * unit_price
                session.add(PurchaseOrderItem(
                    po_id=order["id"], line_number=index, item_description=line["_description"],
                    unit=str(line.get("unit") or "").strip() or None, quantity=quantity,
                    unit_price=unit_price, line_total=Decimal(str(line_total)),
                ))

        session.flush()
        po_item_by_po_and_line = {
            (item.po_id, item.line_number): item.id
            for item in session.query(PurchaseOrderItem).all()
        }
        for receipt in snapshot["goods_receipts"]:
            if session.query(GoodsReceiptItem).filter_by(gr_id=receipt["id"]).first():
                continue
            po_id = snapshot["po_ids"].get(str(receipt["po_number"]))
            po_lines = snapshot["order_lines"].get(po_id, [])
            for index, line in enumerate(snapshot["receipt_lines"].get(receipt["id"], []), start=1):
                matching_po_line = None
                description = line["_description"].casefold()
                for po_index, po_line in enumerate(po_lines, start=1):
                    if po_line["_description"].casefold() == description:
                        matching_po_line = po_item_by_po_and_line.get((po_id, po_index))
                        break
                session.add(GoodsReceiptItem(
                    gr_id=receipt["id"], po_item_id=matching_po_line, line_number=index,
                    item_description=line["_description"],
                    unit=str(line.get("unit") or "").strip() or None,
                    quantity_received=line["_quantity"],
                ))

        session.flush()
        for invoice in snapshot["invoices"]:
            if session.query(InvoiceItem).filter_by(invoice_id=invoice["id"]).first():
                continue
            for index, line in enumerate(snapshot["invoice_lines"].get(invoice["id"], []), start=1):
                unit_price = line.get("unit_price", line.get("unit_price_before_vat"))
                line_total = line.get("amount", line.get("line_total", line.get("amount_including_vat")))
                session.add(InvoiceItem(
                    invoice_id=invoice["id"], line_number=int(line.get("line_number") or index),
                    item_description=line["_description"],
                    unit=str(line.get("unit") or "").strip() or None,
                    quantity=Decimal(str(line["quantity"])) if line.get("quantity") not in (None, "") else None,
                    unit_price=Decimal(str(unit_price)) if unit_price not in (None, "") else None,
                    line_total=Decimal(str(line_total)) if line_total not in (None, "") else None,
                    data_source="legacy_migration",
                ))

        session.flush()
        for invoice in snapshot["invoices"]:
            checksum = invoice.get("sha256")
            if checksum and session.query(InvoiceFile).filter_by(sha256=checksum).first():
                continue
            if not session.query(InvoiceFile).filter_by(invoice_id=invoice["id"]).first():
                stored_path = invoice.get("stored_path") or ""
                try:
                    from pathlib import Path
                    size_bytes = Path(stored_path).stat().st_size
                except OSError:
                    size_bytes = 0
                session.add(InvoiceFile(
                    invoice_id=invoice["id"], original_name=invoice.get("original_name") or "invoice",
                    relative_path=_relative_path(stored_path),
                    mime_type=invoice.get("mime_type") or "application/octet-stream",
                    size_bytes=size_bytes, sha256=checksum, is_primary=True,
                ))
        session.commit()


def _ensure_mysql_foreign_keys(connection):
    constraints = {
        "purchase_orders": ("fk_purchase_orders_supplier", "FOREIGN KEY (supplier_id) REFERENCES suppliers (id)"),
        "goods_receipts": ("fk_goods_receipts_po", "FOREIGN KEY (po_id) REFERENCES purchase_orders (id)"),
        "invoices": ("fk_invoices_seller_supplier", "FOREIGN KEY (seller_supplier_id) REFERENCES suppliers (id)"),
        "invoices:po": ("fk_invoices_po", "FOREIGN KEY (po_id) REFERENCES purchase_orders (id)"),
        "invoice_items": ("fk_invoice_items_product", "FOREIGN KEY (product_id) REFERENCES products (id)"),
        "audit_events": ("fk_audit_events_actor", "FOREIGN KEY (actor_user_id) REFERENCES users (id)"),
    }
    inspector = inspect(connection)
    for key, (name, clause) in constraints.items():
        table = key.split(":", 1)[0]
        existing = {fk.get("name") for fk in inspector.get_foreign_keys(table)}
        if name not in existing:
            connection.exec_driver_sql(f"ALTER TABLE {table} ADD CONSTRAINT {name} {clause}")
    connection.exec_driver_sql("ALTER TABLE purchase_orders MODIFY supplier_id INT NOT NULL")
    connection.exec_driver_sql("ALTER TABLE goods_receipts MODIFY po_id INT NOT NULL")
    connection.exec_driver_sql(
        "ALTER TABLE purchase_orders MODIFY total_amount DECIMAL(18,2) NOT NULL DEFAULT 0"
    )
    connection.exec_driver_sql("ALTER TABLE invoices MODIFY total_amount DECIMAL(18,2) NULL")


def _drop_legacy_json_columns(engine: Engine) -> None:
    inspector = inspect(engine)
    for table, column in (
        ("purchase_orders", "lines"),
        ("goods_receipts", "lines"),
        ("invoices", "items"),
    ):
        columns = {entry["name"] for entry in inspector.get_columns(table)}
        if column in columns:
            quote = engine.dialect.identifier_preparer.quote
            with engine.begin() as connection:
                connection.exec_driver_sql(f"ALTER TABLE {quote(table)} DROP COLUMN {quote(column)}")


def upgrade(engine: Engine) -> None:
    """Preflight, add relational schema, backfill, validate and remove old JSON lines."""
    from app import models  # noqa: F401 - ensure all tables are registered before create_all
    from app.core.database import Base

    with engine.connect() as connection:
        snapshot = _preflight(connection)

    with engine.begin() as connection:
        _add_legacy_columns(connection, connection.dialect.name)

    Base.metadata.create_all(bind=engine)
    _backfill(engine, snapshot)

    with engine.begin() as connection:
        if connection.dialect.name == "mysql":
            _ensure_mysql_foreign_keys(connection)
        missing = connection.execute(text(
            "SELECT po_number FROM purchase_orders WHERE supplier_id IS NULL LIMIT 1"
        )).first()
        if missing:
            raise ValueError(f"PO {missing[0]} has no supplier after migration")
        missing = connection.execute(text(
            "SELECT receipt_number FROM goods_receipts WHERE po_id IS NULL LIMIT 1"
        )).first()
        if missing:
            raise ValueError(f"GR {missing[0]} has no PO after migration")

    _drop_legacy_json_columns(engine)
