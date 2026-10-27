"""Normalize PO and goods-receipt lines while keeping the existing API shape."""

from decimal import Decimal, InvalidOperation

from app.models import GoodsReceipt, GoodsReceiptItem, PurchaseOrder, PurchaseOrderItem
from sqlalchemy.orm import object_session


def _decimal(value, *, field: str) -> Decimal:
    if value is None or value == "":
        raise ValueError(f"Thiếu {field}")
    try:
        parsed = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise ValueError(f"{field} không hợp lệ") from exc
    if not parsed.is_finite():
        raise ValueError(f"{field} không hợp lệ")
    return parsed


def _description(line: dict) -> str:
    return str(line.get("name") or line.get("description") or "").strip()


def sync_purchase_order_lines(purchase_order: PurchaseOrder, lines: list[dict]) -> None:
    purchase_order.line_rows.clear()
    session = object_session(purchase_order)
    if session is not None:
        session.flush()
    for index, line in enumerate(lines, start=1):
        if not isinstance(line, dict) or not _description(line):
            raise ValueError(f"Dòng PO {index} cần có tên mặt hàng")
        quantity = _decimal(line.get("quantity"), field=f"số lượng ở dòng PO {index}")
        unit_price = _decimal(line.get("unit_price"), field=f"đơn giá ở dòng PO {index}")
        raw_total = line.get("amount", line.get("line_total"))
        line_total = _decimal(raw_total, field=f"thành tiền ở dòng PO {index}") if raw_total not in (None, "") else quantity * unit_price
        purchase_order.line_rows.append(PurchaseOrderItem(
            line_number=index,
            item_description=_description(line),
            unit=str(line.get("unit") or "").strip() or None,
            quantity=quantity,
            unit_price=unit_price,
            line_total=line_total,
        ))


def sync_goods_receipt_lines(goods_receipt: GoodsReceipt, lines: list[dict]) -> None:
    goods_receipt.line_rows.clear()
    session = object_session(goods_receipt)
    if session is not None:
        session.flush()
    po_lines = list(goods_receipt.purchase_order.line_rows) if goods_receipt.purchase_order else []
    for index, line in enumerate(lines, start=1):
        if not isinstance(line, dict) or not _description(line):
            raise ValueError(f"Dòng GR {index} cần có tên mặt hàng")
        quantity = _decimal(line.get("quantity"), field=f"số lượng nhận ở dòng GR {index}")
        description = _description(line)
        matched_po_line = next(
            (po_line for po_line in po_lines if po_line.item_description.casefold() == description.casefold()),
            None,
        )
        goods_receipt.line_rows.append(GoodsReceiptItem(
            line_number=index,
            po_item_id=matched_po_line.id if matched_po_line is not None else None,
            item_description=description,
            unit=str(line.get("unit") or "").strip() or None,
            quantity_received=quantity,
            notes=str(line.get("notes") or "").strip(),
        ))
