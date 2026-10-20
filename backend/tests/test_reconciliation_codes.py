from types import SimpleNamespace

from app.services.reconciliation import reconcile


def item(name="Widget", quantity=2, unit_price=5, amount=10):
    return {"name": name, "quantity": quantity, "unit_price": unit_price, "amount": amount}


def invoice(items=None, total=10):
    return SimpleNamespace(seller_tax_code="123", total_amount=total, items=items or [item()])


def po(lines=None):
    return SimpleNamespace(supplier_tax_code="123", total_amount=10, lines=lines or [item()])


def codes(row, order=None, receipt=None):
    return {warning["code"] for warning in reconcile(row, order, receipt)}


def test_delivery_short_and_legacy_quantity_warning():
    result = codes(invoice([item(quantity=1, amount=5)], total=5), po())
    assert "DELIVERY_SHORT" in result
    assert "QUANTITY_MISMATCH" in result
    assert "DELIVERY_WRONG" not in result


def test_delivery_wrong_for_excess_quantity_and_item_name():
    excess = codes(invoice([item(quantity=3, amount=15)], total=15), po())
    mismatch = codes(invoice([item(name="Completely different")]), po())
    assert "DELIVERY_WRONG" in excess
    assert "QUANTITY_MISMATCH" in excess
    assert "DELIVERY_WRONG" in mismatch
    assert "ITEM_MISMATCH" in mismatch


def test_delivery_short_and_wrong_from_receipt_quantities_and_names():
    short_gr = SimpleNamespace(lines=[item(quantity=1, amount=5)])
    excess_gr = SimpleNamespace(lines=[item(quantity=3, amount=15)])
    wrong_gr = SimpleNamespace(lines=[item(name="Other item")])
    assert "DELIVERY_SHORT" in codes(invoice(), po(), short_gr)
    assert "DELIVERY_WRONG" in codes(invoice(), po(), excess_gr)
    assert "DELIVERY_WRONG" in codes(invoice(), po(), wrong_gr)
    assert "GR_QUANTITY_MISMATCH" in codes(invoice(), po(), short_gr)
    assert "GR_ITEM_MISSING" in codes(invoice(), po(), wrong_gr)


def test_math_error_for_mismatch_but_not_matching_footer():
    assert "MATH_ERROR" not in codes(invoice([item()], total=10), po())
    assert "MATH_ERROR" in codes(invoice([item()], total=13), po())


def test_legacy_codes_still_returned():
    result = codes(invoice([item(quantity=1, amount=5)], total=12), po())
    assert {"AMOUNT_MISMATCH", "QUANTITY_MISMATCH", "LINE_AMOUNT_MISMATCH"} <= result
