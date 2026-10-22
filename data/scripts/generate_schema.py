#!/usr/bin/env python3
"""Generate per-table MySQL DDL and a data dictionary from runtime models."""

from __future__ import annotations

import sys
from pathlib import Path

from sqlalchemy.dialects import mysql
from sqlalchemy.schema import CreateTable


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app import models  # noqa: E402,F401 - register all mapped tables
from app.core.database import Base  # noqa: E402


DATA = ROOT / "data"
SCHEMA = DATA / "schema" / "tables"
DICTIONARY = DATA / "docs" / "DATA_DICTIONARY.md"
DATABASE = "invoice_reconciliation"


def _default(column) -> str:
    if column.server_default is not None:
        return str(column.server_default.arg)
    if column.default is not None:
        return "application default"
    return "—"


def render() -> tuple[list[tuple[str, str]], str]:
    tables = Base.metadata.sorted_tables
    ddl_files = []
    for index, table in enumerate(tables, start=1):
        ddl = str(CreateTable(table, if_not_exists=True).compile(dialect=mysql.dialect()))
        ddl = "\n".join(line.rstrip() for line in ddl.strip().splitlines())
        ddl_files.append((f"{index:02d}_{table.name}.sql", ddl + ";\n"))

    lines = [
        "# Từ điển cơ sở dữ liệu runtime",
        "",
        f"Schema này được sinh từ SQLAlchemy models và dùng trực tiếp trong database `{DATABASE}` của demo.",
        "Mỗi bảng có một file DDL trong `data/schema/tables/`; model runtime là nguồn cấu trúc duy nhất.",
        "",
    ]
    for table in tables:
        lines.extend([f"## `{table.name}`", "", "| Cột | Kiểu | Null | Khóa | Mặc định |", "|---|---|---:|---|---|"])
        for column in table.columns:
            keys = []
            if column.primary_key:
                keys.append("PK")
            keys.extend(f"FK → `{fk.target_fullname}`" for fk in column.foreign_keys)
            if column.unique:
                keys.append("UNIQUE")
            lines.append(
                f"| `{column.name}` | `{column.type}` | "
                f"{'không' if not column.nullable else 'có'} | "
                f"{', '.join(keys) if keys else '—'} | {_default(column)} |"
            )
        constraints = [
            f"`{constraint.name or 'UNIQUE'}`: " + ", ".join(f"`{column.name}`" for column in constraint.columns)
            for constraint in table.constraints
            if constraint.__class__.__name__ == "UniqueConstraint"
        ]
        if constraints:
            lines.extend(["", "Ràng buộc: " + "; ".join(constraints) + "."])
        lines.append("")
    return ddl_files, "\n".join(lines).rstrip() + "\n"


def main() -> None:
    SCHEMA.mkdir(parents=True, exist_ok=True)
    DICTIONARY.parent.mkdir(parents=True, exist_ok=True)
    expected, dictionary = render()
    expected_names = {name for name, _ in expected}
    for old_file in SCHEMA.glob("*.sql"):
        if old_file.name not in expected_names and old_file.name != "00_create_database.sql":
            old_file.unlink()
    database_sql = (
        f"CREATE DATABASE IF NOT EXISTS `{DATABASE}` CHARACTER SET utf8mb4;\n"
        f"USE `{DATABASE}`;\n"
    )
    (SCHEMA / "00_create_database.sql").write_text(database_sql, encoding="utf-8")
    for filename, ddl in expected:
        (SCHEMA / filename).write_text(
            f"USE `{DATABASE}`;\n\n{ddl}", encoding="utf-8"
        )
    DICTIONARY.write_text(dictionary, encoding="utf-8")
    print(f"Generated DDL for {len(expected)} runtime tables in {SCHEMA}")
    print(f"Generated data dictionary at {DICTIONARY}")


if __name__ == "__main__":
    main()
