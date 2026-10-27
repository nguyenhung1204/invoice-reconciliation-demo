"""Seed a single, internally matched public invoice demo scenario."""

from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

from sqlalchemy.orm import Session

from app.models import AccountingVoucher, Customer, Employee, GoodsReceipt, Invoice, InvoiceFile, Product, ProductCategory, PurchaseOrder, Supplier
from app.services.invoice_lines import sync_invoice_items
from app.services.procurement_lines import sync_goods_receipt_lines, sync_purchase_order_lines


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _load_manifest(fixture: Path) -> dict:
    manifest_path = fixture.with_suffix(".json")
    if not manifest_path.is_file():
        raise FileNotFoundError(f"Public demo invoice metadata not found: {manifest_path}")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Invalid public demo invoice metadata: {manifest_path}") from exc

    required = ("supplier", "invoice", "purchase_order", "goods_receipt")
    if not isinstance(manifest, dict) or any(not isinstance(manifest.get(key), dict) for key in required):
        raise ValueError(f"Demo metadata must include object sections: {', '.join(required)}")

    supplier = manifest["supplier"]
    invoice = manifest["invoice"]
    purchase_order = manifest["purchase_order"]
    receipt = manifest["goods_receipt"]
    if not supplier.get("tax_code") or not supplier.get("name"):
        raise ValueError("Demo metadata requires supplier tax_code and name")
    if invoice.get("seller_tax_code") != supplier["tax_code"]:
        raise ValueError("Demo invoice seller tax code must match the supplier")
    if purchase_order.get("supplier_tax_code") != supplier["tax_code"]:
        raise ValueError("Demo PO supplier tax code must match the supplier")
    if not invoice.get("po_number") or invoice["po_number"] != purchase_order.get("po_number"):
        raise ValueError("Demo invoice and PO must use the same PO number")
    if receipt.get("po_number") != purchase_order.get("po_number"):
        raise ValueError("Demo GR must reference the demo PO")
    if not isinstance(invoice.get("items"), list) or not invoice["items"]:
        raise ValueError("Demo invoice must include at least one item line")
    if not isinstance(purchase_order.get("lines"), list) or not purchase_order["lines"]:
        raise ValueError("Demo PO must include at least one item line")
    if not isinstance(receipt.get("lines"), list) or not receipt["lines"]:
        raise ValueError("Demo GR must include at least one received item line")
    return manifest


def seed_public_demo(
    db: Session,
    *,
    upload_dir: str,
    fixture_path: str,
) -> dict[str, int]:
    """Create missing records from the PDF's JSON manifest, without overwriting edits."""
    fixture = Path(fixture_path)
    if not fixture.is_file():
        raise FileNotFoundError(f"Public demo invoice fixture not found: {fixture}")

    manifest = _load_manifest(fixture)
    supplier_data = manifest["supplier"]
    invoice_data = manifest["invoice"]
    purchase_order_data = manifest["purchase_order"]
    receipt_data = manifest["goods_receipt"]
    checksum = _sha256(fixture)
    destination = Path(upload_dir) / "demo" / fixture.name
    copied_fixture = False
    counts = {
        "suppliers_created": 0,
        "purchase_orders_created": 0,
        "goods_receipts_created": 0,
        "invoices_created": 0,
        "invoice_items_created": 0,
        "product_categories_created": 0,
        "products_created": 0,
        "customers_created": 0,
        "employees_created": 0,
        "accounting_vouchers_created": 0,
    }

    try:
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists():
            if _sha256(destination) != checksum:
                raise FileExistsError(
                    f"Refusing to replace a different demo invoice at {destination}"
                )
        else:
            shutil.copy2(fixture, destination)
            copied_fixture = True

        supplier = db.query(Supplier).filter_by(tax_code=supplier_data["tax_code"]).first()
        if supplier is None:
            supplier = Supplier(
                supplier_code="NCC-HD001-DEMO",
                tax_code=supplier_data["tax_code"],
                name=supplier_data["name"],
                email=supplier_data.get("email", ""),
            )
            db.add(supplier)
            counts["suppliers_created"] += 1
        db.flush()

        demo_category = db.query(ProductCategory).filter_by(code="DEMO-CAT-01").first()
        if demo_category is None:
            demo_category = ProductCategory(
                code="DEMO-CAT-01",
                name="Danh mục DEMO - Thiết bị văn phòng",
                description="Dữ liệu minh họa, có thể sửa hoặc xóa sau khi thử nghiệm.",
            )
            db.add(demo_category)
            db.flush()
            counts["product_categories_created"] += 1

        if db.query(Product).filter_by(sku="DEMO-PRODUCT-01").first() is None:
            db.add(Product(
                sku="DEMO-PRODUCT-01",
                product_name="Sản phẩm DEMO - Máy tính văn phòng",
                unit="Chiếc",
                category_id=demo_category.id,
                cost_price=12000000,
                selling_price=14500000,
                stock_qty=5,
            ))
            counts["products_created"] += 1

        if db.query(Customer).filter_by(code="DEMO-CUSTOMER-01").first() is None:
            db.add(Customer(
                code="DEMO-CUSTOMER-01",
                name="Khách hàng DEMO",
                phone="0900000000",
                address="Địa chỉ minh họa",
                email="demo-customer@example.test",
            ))
            counts["customers_created"] += 1

        if db.query(Employee).filter_by(code="DEMO-EMPLOYEE-01").first() is None:
            db.add(Employee(
                code="DEMO-EMPLOYEE-01",
                full_name="Nhân viên DEMO",
                role="Kế toán viên",
                phone="0910000000",
                email="demo-employee@example.test",
            ))
            counts["employees_created"] += 1

        if db.query(AccountingVoucher).filter_by(voucher_number="DEMO-PC-01").first() is None:
            db.add(AccountingVoucher(
                voucher_number="DEMO-PC-01",
                voucher_type="CHI",
                voucher_date=invoice_data["invoice_date"],
                related_party_name=supplier_data["name"],
                content="Phiếu chi DEMO - thanh toán hóa đơn HD_001",
                amount=invoice_data["total_amount"],
                is_auto_generated=False,
            ))
            counts["accounting_vouchers_created"] += 1

        purchase_order = db.query(PurchaseOrder).filter_by(
            po_number=purchase_order_data["po_number"]
        ).first()
        if purchase_order is not None and (
            purchase_order.supplier_id != supplier.id
            or purchase_order.supplier_tax_code != supplier_data["tax_code"]
        ):
            raise ValueError("Demo PO supplier does not match the manifest supplier")
        if purchase_order is None:
            purchase_order = PurchaseOrder(
                po_number=purchase_order_data["po_number"],
                supplier_tax_code=purchase_order_data["supplier_tax_code"],
                supplier_id=supplier.id,
                total_amount=purchase_order_data["total_amount"],
                status=purchase_order_data.get("status", "open"),
            )
            db.add(purchase_order)
            db.flush()
            sync_purchase_order_lines(purchase_order, purchase_order_data["lines"])
            counts["purchase_orders_created"] += 1
        elif not purchase_order.line_rows:
            if purchase_order.supplier_id != supplier.id:
                raise ValueError("Demo PO supplier does not match the manifest supplier")
            sync_purchase_order_lines(purchase_order, purchase_order_data["lines"])

        receipt = db.query(GoodsReceipt).filter_by(
            receipt_number=receipt_data["receipt_number"]
        ).first()
        if receipt is not None and receipt.po_id != purchase_order.id:
            raise ValueError("Demo GR does not reference the manifest PO")
        if receipt is None:
            receipt = GoodsReceipt(
                receipt_number=receipt_data["receipt_number"],
                po_number=receipt_data["po_number"],
                po_id=purchase_order.id,
            )
            db.add(receipt)
            db.flush()
            sync_goods_receipt_lines(receipt, receipt_data["lines"])
            counts["goods_receipts_created"] += 1
        elif not receipt.line_rows:
            if receipt.po_id != purchase_order.id:
                raise ValueError("Demo GR does not reference the manifest PO")
            sync_goods_receipt_lines(receipt, receipt_data["lines"])

        invoice = db.query(Invoice).filter_by(sha256=checksum).first()
        if invoice is not None and (
            invoice.seller_supplier_id != supplier.id or invoice.po_id != purchase_order.id
        ):
            raise ValueError("Demo invoice supplier or PO does not match the manifest")
        if invoice is None:
            invoice = Invoice(
                original_name=fixture.name,
                stored_path=str(destination.resolve()),
                mime_type="application/pdf",
                sha256=checksum,
                seller_supplier_id=supplier.id,
                po_id=purchase_order.id,
                status="needs_review",
                seller_tax_code=invoice_data["seller_tax_code"],
                buyer_tax_code=invoice_data.get("buyer_tax_code", ""),
                invoice_number=invoice_data["invoice_number"],
                invoice_date=invoice_data["invoice_date"],
                total_amount=invoice_data["total_amount"],
                ocr_text="",
                warnings=[],
                po_number=invoice_data["po_number"],
                po_reference_text=invoice_data["po_number"],
                review_note=invoice_data.get("review_note", ""),
            )
            db.add(invoice)
            db.flush()
            sync_invoice_items(invoice, invoice_data["items"], source="demo_seed")
            counts["invoices_created"] += 1
            counts["invoice_items_created"] += len(invoice_data["items"])
        elif not invoice.item_rows:
            sync_invoice_items(invoice, invoice_data["items"], source="demo_seed")
            counts["invoice_items_created"] += len(invoice_data["items"])

        invoice_file = db.query(InvoiceFile).filter_by(sha256=checksum).first()
        if invoice_file is None:
            invoice_file = InvoiceFile(
                invoice=invoice,
                original_name=fixture.name,
                relative_path=str(Path("demo") / fixture.name),
                mime_type="application/pdf",
                size_bytes=fixture.stat().st_size,
                sha256=checksum,
                is_primary=True,
            )
            db.add(invoice_file)

        db.commit()
        return counts
    except Exception:
        db.rollback()
        if copied_fixture:
            destination.unlink(missing_ok=True)
        raise
