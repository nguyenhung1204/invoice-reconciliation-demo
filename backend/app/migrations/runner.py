"""Small, forward-only runtime schema migration runner."""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

REVISION = "0001_normalize_operational_data"


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
    if applied:
        return

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
