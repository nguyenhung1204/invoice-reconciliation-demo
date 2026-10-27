"""Small, forward-only runtime schema migration runner."""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

REVISION = "0001_normalize_operational_data"
ALLOCATION_FK_REVISION = "0002_preserve_reconciliation_snapshots"
MASTER_DATA_REVISION = "0003_persist_master_data"
INVOICE_HEADER_REVISION = "0004_persist_invoice_header_fields"
SETTINGS_OPTIONS_REVISION = "0005_persist_settings_options"
PROCUREMENT_METADATA_REVISION = "0006_persist_procurement_metadata"


def _upgrade_reconciliation_allocation_fk(engine: Engine) -> None:
    """Allow old run snapshots to outlive replacement invoice line rows."""
    from app import models  # noqa: F401 - ensure all mapped tables are registered
    from app.core.database import Base

    table_name = "reconciliation_line_allocations"
    table = Base.metadata.tables[table_name]
    inspector = inspect(engine)
    columns = {column["name"]: column for column in inspector.get_columns(table_name)}
    foreign_keys = inspector.get_foreign_keys(table_name)
    allocation_fk = next(
        (fk for fk in foreign_keys if fk.get("constrained_columns") == ["invoice_item_id"]),
        None,
    )
    is_nullable = columns["invoice_item_id"]["nullable"]
    has_set_null = bool(allocation_fk and
                        (allocation_fk.get("options", {}).get("ondelete") or "").upper() == "SET NULL")
    if is_nullable and has_set_null:
        return

    if engine.dialect.name == "mysql":
        with engine.begin() as connection:
            if allocation_fk and allocation_fk.get("name"):
                connection.exec_driver_sql(
                    f"ALTER TABLE `{table_name}` DROP FOREIGN KEY `{allocation_fk['name']}`"
                )
            if not is_nullable:
                connection.exec_driver_sql(
                    f"ALTER TABLE `{table_name}` MODIFY COLUMN invoice_item_id INTEGER NULL"
                )
            connection.exec_driver_sql(
                f"ALTER TABLE `{table_name}` ADD CONSTRAINT fk_{table_name}_invoice_item "
                "FOREIGN KEY (invoice_item_id) REFERENCES invoice_items (id) ON DELETE SET NULL"
            )
        return

    if engine.dialect.name == "sqlite":
        # SQLite cannot alter an FK in place. Rebuild just this table while
        # preserving allocation IDs and every reconciliation snapshot.
        from sqlalchemy import MetaData
        from sqlalchemy.schema import CreateIndex, CreateTable

        rebuilt = table.to_metadata(MetaData(), name=f"{table_name}_new")
        raw = engine.raw_connection()
        try:
            cursor = raw.cursor()
            cursor.execute("PRAGMA foreign_keys=OFF")
            cursor.execute("BEGIN IMMEDIATE")
            cursor.execute(str(CreateTable(rebuilt).compile(dialect=engine.dialect)))
            names = [column.name for column in table.columns]
            quoted = ", ".join(f'"{name}"' for name in names)
            cursor.execute(
                f'INSERT INTO "{table_name}_new" ({quoted}) SELECT {quoted} FROM "{table_name}"'
            )
            cursor.execute(f'DROP TABLE "{table_name}"')
            cursor.execute(f'ALTER TABLE "{table_name}_new" RENAME TO "{table_name}"')
            for index in table.indexes:
                cursor.execute(str(CreateIndex(index).compile(dialect=engine.dialect)))
            raw.commit()
        except Exception:
            raw.rollback()
            raise
        finally:
            try:
                raw.cursor().execute("PRAGMA foreign_keys=ON")
            finally:
                raw.close()
        return

    raise RuntimeError(f"Unsupported database dialect for migration: {engine.dialect.name}")


def _ensure_revision_table(engine: Engine) -> None:
    with engine.begin() as connection:
        if connection.dialect.name == "mysql":
            connection.exec_driver_sql(
                "CREATE TABLE IF NOT EXISTS schema_migrations ("
                "revision VARCHAR(100) NOT NULL PRIMARY KEY, "
                "applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) "
                "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
            )
        else:
            connection.exec_driver_sql(
                "CREATE TABLE IF NOT EXISTS schema_migrations ("
                "revision VARCHAR(100) NOT NULL PRIMARY KEY, "
                "applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)"
            )


def _upgrade_master_data(engine: Engine) -> None:
    """Add master-data tables and product attributes without replacing rows."""
    from app import models  # noqa: F401 - register mapped tables
    from app.core.database import Base

    # create_all only creates missing tables; it does not alter existing tables.
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    existing = {column["name"] for column in inspector.get_columns("products")}
    column_sql = {
        "category_id": "INTEGER NULL",
        "cost_price": "NUMERIC(18, 2) NOT NULL DEFAULT 0",
        "selling_price": "NUMERIC(18, 2) NOT NULL DEFAULT 0",
        "stock_qty": "NUMERIC(18, 4) NOT NULL DEFAULT 0",
    }
    supplier_column_sql = {
        "supplier_code": "VARCHAR(80) NULL",
        "address": "VARCHAR(500) NOT NULL DEFAULT ''",
        "phone": "VARCHAR(40) NOT NULL DEFAULT ''",
    }
    with engine.begin() as connection:
        for name, definition in column_sql.items():
            if name not in existing:
                connection.exec_driver_sql(f"ALTER TABLE products ADD COLUMN {name} {definition}")

        if engine.dialect.name == "mysql":
            foreign_keys = inspect(connection).get_foreign_keys("products")
            has_category_fk = any(fk.get("constrained_columns") == ["category_id"] for fk in foreign_keys)
            if not has_category_fk:
                connection.exec_driver_sql(
                    "ALTER TABLE products ADD CONSTRAINT fk_products_category "
                    "FOREIGN KEY (category_id) REFERENCES product_categories (id)"
                )

        supplier_columns = {column["name"] for column in inspect(connection).get_columns("suppliers")}
        for name, definition in supplier_column_sql.items():
            if name not in supplier_columns:
                connection.exec_driver_sql(f"ALTER TABLE suppliers ADD COLUMN {name} {definition}")

    indexes = {index["name"] for index in inspect(engine).get_indexes("products")}
    if "ix_products_category_id" not in indexes:
        with engine.begin() as connection:
            connection.exec_driver_sql("CREATE INDEX ix_products_category_id ON products (category_id)")

    supplier_inspector = inspect(engine)
    supplier_indexes = {index["name"] for index in supplier_inspector.get_indexes("suppliers")}
    has_supplier_code_unique = any(
        constraint.get("column_names") == ["supplier_code"]
        for constraint in supplier_inspector.get_unique_constraints("suppliers")
    )
    if "uq_suppliers_supplier_code" not in supplier_indexes and not has_supplier_code_unique:
        with engine.begin() as connection:
            connection.exec_driver_sql("CREATE UNIQUE INDEX uq_suppliers_supplier_code ON suppliers (supplier_code)")


def _upgrade_invoice_header_fields(engine: Engine) -> None:
    """Persist invoice header values that the review form lets users edit."""
    existing = {column["name"] for column in inspect(engine).get_columns("invoices")}
    with engine.begin() as connection:
        if "seller_name" not in existing:
            connection.exec_driver_sql("ALTER TABLE invoices ADD COLUMN seller_name VARCHAR(500) NOT NULL DEFAULT ''")
        if "invoice_series" not in existing:
            connection.exec_driver_sql("ALTER TABLE invoices ADD COLUMN invoice_series VARCHAR(80) NOT NULL DEFAULT ''")


def _upgrade_settings_options(engine: Engine) -> None:
    """Add the settings already offered by the configuration screen."""
    if "reconciliation_settings" not in inspect(engine).get_table_names():
        return
    existing = {column["name"] for column in inspect(engine).get_columns("reconciliation_settings")}
    with engine.begin() as connection:
        if "rpa_scan_interval_minutes" not in existing:
            connection.exec_driver_sql("ALTER TABLE reconciliation_settings ADD COLUMN rpa_scan_interval_minutes INTEGER NOT NULL DEFAULT 5")
        if "auto_alert_email" not in existing:
            connection.exec_driver_sql("ALTER TABLE reconciliation_settings ADD COLUMN auto_alert_email BOOLEAN NOT NULL DEFAULT 1")
        if "auto_alert_telegram" not in existing:
            connection.exec_driver_sql("ALTER TABLE reconciliation_settings ADD COLUMN auto_alert_telegram BOOLEAN NOT NULL DEFAULT 1")


def _upgrade_procurement_metadata(engine: Engine) -> None:
    """Persist fields entered by the PO and goods-receipt forms."""
    po_columns = {column["name"] for column in inspect(engine).get_columns("purchase_orders")}
    gr_columns = {column["name"] for column in inspect(engine).get_columns("goods_receipts")}
    gr_line_info = {column["name"]: column for column in inspect(engine).get_columns("goods_receipt_items")}
    gr_line_columns = set(gr_line_info)
    with engine.begin() as connection:
        for name, definition in {
            "order_date": "VARCHAR(10) NOT NULL DEFAULT ''",
            "expected_delivery_date": "VARCHAR(10) NOT NULL DEFAULT ''",
            "created_by_user_id": "INTEGER NULL",
            "employee_code": "VARCHAR(80) NOT NULL DEFAULT ''",
        }.items():
            if name not in po_columns:
                connection.exec_driver_sql(f"ALTER TABLE purchase_orders ADD COLUMN {name} {definition}")
        for name, definition in {
            "received_by": "VARCHAR(255) NOT NULL DEFAULT ''",
            "warehouse_location": "VARCHAR(255) NOT NULL DEFAULT ''",
        }.items():
            if name not in gr_columns:
                connection.exec_driver_sql(f"ALTER TABLE goods_receipts ADD COLUMN {name} {definition}")
        if "notes" not in gr_line_columns:
            if engine.dialect.name == "mysql":
                # MySQL does not allow a literal default on TEXT columns. Add
                # it nullable, backfill existing rows, then enforce the model's
                # NOT NULL contract without changing any existing receipt data.
                connection.exec_driver_sql("ALTER TABLE goods_receipt_items ADD COLUMN notes TEXT NULL")
                connection.exec_driver_sql("UPDATE goods_receipt_items SET notes = '' WHERE notes IS NULL")
                connection.exec_driver_sql("ALTER TABLE goods_receipt_items MODIFY COLUMN notes TEXT NOT NULL")
            else:
                connection.exec_driver_sql("ALTER TABLE goods_receipt_items ADD COLUMN notes TEXT NOT NULL DEFAULT ''")
        elif engine.dialect.name == "mysql" and gr_line_info["notes"]["nullable"]:
            # Recover safely if an earlier attempt stopped after adding the
            # nullable column but before backfilling/locking its nullability.
            connection.exec_driver_sql("UPDATE goods_receipt_items SET notes = '' WHERE notes IS NULL")
            connection.exec_driver_sql("ALTER TABLE goods_receipt_items MODIFY COLUMN notes TEXT NOT NULL")

    if engine.dialect.name == "mysql":
        foreign_keys = inspect(engine).get_foreign_keys("purchase_orders")
        if not any(fk.get("constrained_columns") == ["created_by_user_id"] for fk in foreign_keys):
            with engine.begin() as connection:
                connection.exec_driver_sql(
                    "ALTER TABLE purchase_orders ADD CONSTRAINT fk_purchase_orders_created_by_user "
                    "FOREIGN KEY (created_by_user_id) REFERENCES users (id) ON DELETE SET NULL"
                )


def upgrade_schema(engine: Engine) -> None:
    """Create a new runtime schema or migrate the original 11-table schema."""
    from app.core.database import Base
    from app import models  # noqa: F401 - registers every mapped table

    _ensure_revision_table(engine)
    with engine.connect() as connection:
        applied = connection.execute(
            text("SELECT revision FROM schema_migrations WHERE revision=:revision"),
            {"revision": REVISION},
        ).first()
    if not applied:
        tables = set(inspect(engine).get_table_names())
        if {"suppliers", "purchase_orders", "goods_receipts", "invoices"}.issubset(tables):
            from app.migrations.versions import normalize_operational_data

            normalize_operational_data.upgrade(engine)
        else:
            Base.metadata.create_all(bind=engine)

        with engine.begin() as connection:
            connection.execute(
                text("INSERT INTO schema_migrations (revision) VALUES (:revision)"),
                {"revision": REVISION},
            )

    with engine.connect() as connection:
        allocation_migration = connection.execute(
            text("SELECT revision FROM schema_migrations WHERE revision=:revision"),
            {"revision": ALLOCATION_FK_REVISION},
        ).first()
    if not allocation_migration:
        _upgrade_reconciliation_allocation_fk(engine)
        with engine.begin() as connection:
            connection.execute(
                text("INSERT INTO schema_migrations (revision) VALUES (:revision)"),
                {"revision": ALLOCATION_FK_REVISION},
            )

    with engine.connect() as connection:
        master_data_migration = connection.execute(
            text("SELECT revision FROM schema_migrations WHERE revision=:revision"),
            {"revision": MASTER_DATA_REVISION},
        ).first()
    if not master_data_migration:
        _upgrade_master_data(engine)
        with engine.begin() as connection:
            connection.execute(
                text("INSERT INTO schema_migrations (revision) VALUES (:revision)"),
                {"revision": MASTER_DATA_REVISION},
            )

    with engine.connect() as connection:
        invoice_header_migration = connection.execute(
            text("SELECT revision FROM schema_migrations WHERE revision=:revision"),
            {"revision": INVOICE_HEADER_REVISION},
        ).first()
    if not invoice_header_migration:
        _upgrade_invoice_header_fields(engine)
        with engine.begin() as connection:
            connection.execute(
                text("INSERT INTO schema_migrations (revision) VALUES (:revision)"),
                {"revision": INVOICE_HEADER_REVISION},
            )

    with engine.connect() as connection:
        settings_options_migration = connection.execute(
            text("SELECT revision FROM schema_migrations WHERE revision=:revision"),
            {"revision": SETTINGS_OPTIONS_REVISION},
        ).first()
    if not settings_options_migration:
        _upgrade_settings_options(engine)
        with engine.begin() as connection:
            connection.execute(
                text("INSERT INTO schema_migrations (revision) VALUES (:revision)"),
                {"revision": SETTINGS_OPTIONS_REVISION},
            )

    with engine.connect() as connection:
        procurement_metadata_migration = connection.execute(
            text("SELECT revision FROM schema_migrations WHERE revision=:revision"),
            {"revision": PROCUREMENT_METADATA_REVISION},
        ).first()
    if not procurement_metadata_migration:
        _upgrade_procurement_metadata(engine)
        with engine.begin() as connection:
            connection.execute(
                text("INSERT INTO schema_migrations (revision) VALUES (:revision)"),
                {"revision": PROCUREMENT_METADATA_REVISION},
            )
