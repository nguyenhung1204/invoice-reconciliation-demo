"""Helpers for keeping invoice line items normalized and API-compatible."""

from decimal import Decimal, InvalidOperation

from app.models import Invoice, InvoiceItem


def _decimal(value) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def sync_invoice_items(invoice: Invoice, items: list[dict], *, source: str) -> None:
    """Persist editable/OCR line data in the normalized table and legacy JSON."""
    clean_items = [item for item in items if isinstance(item, dict)]
    invoice.items = clean_items
    invoice.item_rows.clear()
    for line_number, item in enumerate(clean_items, start=1):
        description = str(item.get("name") or item.get("description") or "").strip()
        if not description:
            continue
        invoice.item_rows.append(
            InvoiceItem(
                line_number=line_number,
                item_description=description,
                unit=str(item.get("unit") or "").strip() or None,
                quantity=_decimal(item.get("quantity")),
                unit_price=_decimal(item.get("unit_price")),
                line_total=_decimal(item.get("amount", item.get("line_total"))),
                data_source=source,
            )
        )


def invoice_items_for_api(invoice: Invoice) -> list[dict]:
    """Return normalized rows when present, falling back to pre-migration JSON."""
    rows = getattr(invoice, "item_rows", None)
    if not rows:
        return invoice.items or []
    return [
        {
            "name": row.item_description,
            "description": row.item_description,
            "unit": row.unit,
            "quantity": float(row.quantity) if row.quantity is not None else None,
            "unit_price": float(row.unit_price) if row.unit_price is not None else None,
            "amount": float(row.line_total) if row.line_total is not None else None,
        }
        for row in rows
    ]
