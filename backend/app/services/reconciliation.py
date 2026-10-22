from rapidfuzz.fuzz import ratio

from app.services.normalization import normalize_text
from app.services.invoice_lines import invoice_items_for_api
from app.services.reconciliation_settings import get_reconciliation_settings


def _number(value):
    try:
        return float(value) if value is not None and value != "" else None
    except (TypeError, ValueError):
        return None


def reconcile(invoice, purchase_order=None, goods_receipt=None, amount_tolerance=None, item_threshold=None):
    reconciliation_settings = get_reconciliation_settings()
    amount_tolerance = reconciliation_settings["currency_tolerance"] if amount_tolerance is None else amount_tolerance
    item_threshold = reconciliation_settings["item_similarity_threshold"] if item_threshold is None else item_threshold
    warnings = []
    if not invoice.seller_tax_code:
        warnings.append({"code": "MISSING_SELLER_TAX", "message": "Thiếu mã số thuế bên bán"})
    if invoice.total_amount is None:
        warnings.append({"code": "MISSING_TOTAL", "message": "Chưa nhận diện tổng tiền"})
    if not purchase_order:
        warnings.append({"code": "NO_PO", "message": "Chưa liên kết đơn đặt hàng"})
    else:
        if invoice.seller_tax_code and invoice.seller_tax_code != purchase_order.supplier_tax_code:
            warnings.append({"code": "SUPPLIER_MISMATCH", "message": "Mã số thuế nhà cung cấp khác PO"})
        if invoice.total_amount is not None and abs(invoice.total_amount - purchase_order.total_amount) > amount_tolerance:
            warnings.append({"code": "AMOUNT_MISMATCH", "message": "Tổng tiền hóa đơn lệch PO"})
        expected = purchase_order.lines or []
        actual = invoice_items_for_api(invoice)
        if expected and not actual:
            warnings.append({"code": "INVOICE_ITEMS_MISSING", "message": "Hóa đơn chưa có dòng mặt hàng để đối chiếu PO"})
        for item in actual:
            candidates = [(ratio(normalize_text(item.get("name", "")).lower(), normalize_text(x.get("name", "")).lower()), x)
                          for x in expected]
            best_score, po_item = max(candidates, key=lambda pair: pair[0]) if candidates else (0, None)
            if expected and best_score < item_threshold:
                warnings.append({"code": "ITEM_MISMATCH", "message": f"Tên mặt hàng chưa khớp PO: {item.get('name', '')}"})
                warnings.append({"code": "DELIVERY_WRONG", "message": f"Tên mặt hàng không khớp PO: {item.get('name', '')}"})
                continue
            if not po_item:
                continue
            for quantity_field in ("quantity",):
                actual_qty, po_qty = _number(item.get(quantity_field)), _number(po_item.get(quantity_field))
                if actual_qty is not None and po_qty is not None and abs(actual_qty - po_qty) > 1e-9:
                    warnings.append({"code": "QUANTITY_MISMATCH", "message": f"Lệch số lượng PO: {item.get('name', '')}"})
                    if actual_qty < po_qty:
                        warnings.append({"code": "DELIVERY_SHORT", "message": f"Số lượng hóa đơn thấp hơn PO: {item.get('name', '')}"})
                    else:
                        warnings.append({"code": "DELIVERY_WRONG", "message": f"Số lượng hóa đơn vượt PO: {item.get('name', '')}"})
            actual_price, po_price = _number(item.get("unit_price")), _number(po_item.get("unit_price"))
            if actual_price is not None and po_price is not None and abs(actual_price - po_price) > amount_tolerance:
                warnings.append({"code": "PRICE_MISMATCH", "message": f"Lệch đơn giá PO: {item.get('name', '')}"})
            actual_amount = _number(item.get("amount"))
            if actual_amount is None and actual_price is not None and _number(item.get("quantity")) is not None:
                actual_amount = actual_price * _number(item.get("quantity"))
            expected_amount = _number(po_item.get("amount"))
            if expected_amount is None and po_price is not None and _number(po_item.get("quantity")) is not None:
                expected_amount = po_price * _number(po_item.get("quantity"))
            if actual_amount is not None and expected_amount is not None and abs(actual_amount - expected_amount) > amount_tolerance:
                warnings.append({"code": "LINE_AMOUNT_MISMATCH", "message": f"Lệch thành tiền PO: {item.get('name', '')}"})
            if goods_receipt and goods_receipt.lines:
                gr_matches = [(ratio(normalize_text(item.get("name", "")).lower(), normalize_text(x.get("name", "")).lower()), x)
                              for x in goods_receipt.lines]
                gr_score, gr_item = max(gr_matches, key=lambda pair: pair[0]) if gr_matches else (0, None)
                if not gr_item or gr_score < item_threshold:
                    warnings.append({"code": "GR_ITEM_MISSING", "message": f"Không thấy mặt hàng trong phiếu nhập: {item.get('name', '')}"})
                    warnings.append({"code": "DELIVERY_WRONG", "message": f"Mặt hàng hóa đơn không khớp phiếu nhập: {item.get('name', '')}"})
                else:
                    inv_qty, gr_qty = _number(item.get("quantity")), _number(gr_item.get("quantity"))
                    if inv_qty is not None and gr_qty is not None and abs(inv_qty - gr_qty) > 1e-9:
                        warnings.append({"code": "GR_QUANTITY_MISMATCH", "message": f"Hóa đơn lệch số lượng phiếu nhập: {item.get('name', '')}"})
                    po_qty, received_qty = _number(po_item.get("quantity")), _number(gr_item.get("quantity"))
                    if po_item and po_qty is not None and received_qty is not None and abs(received_qty - po_qty) > 1e-9:
                        if received_qty < po_qty:
                            warnings.append({"code": "DELIVERY_SHORT", "message": f"Số lượng nhận thấp hơn PO: {item.get('name', '')}"})
                        else:
                            warnings.append({"code": "DELIVERY_WRONG", "message": f"Số lượng nhận vượt PO: {item.get('name', '')}"})
    if goods_receipt and not goods_receipt.lines:
        warnings.append({"code": "EMPTY_GR", "message": "Phiếu nhập kho chưa có dòng hàng"})
    invoice_items = invoice_items_for_api(invoice)
    if invoice.total_amount is not None and invoice_items:
        line_amounts = []
        for item in invoice_items:
            line_amount = _number(item.get("amount"))
            if line_amount is None:
                unit_price, quantity = _number(item.get("unit_price")), _number(item.get("quantity"))
                if unit_price is None or quantity is None:
                    line_amounts = []
                    break
                line_amount = unit_price * quantity
            line_amounts.append(line_amount)
        if line_amounts and abs(invoice.total_amount - sum(line_amounts)) > amount_tolerance:
            warnings.append({"code": "MATH_ERROR", "message": "Tổng tiền hóa đơn không khớp tổng thành tiền các dòng hàng"})
    return warnings
