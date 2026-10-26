"""Small, forward-only runtime schema migration runner."""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

REVISION = "0001_normalize_operational_data"
ALLOCATION_FK_REVISION = "0002_preserve_reconciliation_snapshots"


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
