"""Seed data for AutoInvoice matching the screenshot demonstration"""
from datetime import datetime, timezone
from app.core.database import SessionLocal, engine, Base
from app.models import Supplier, PurchaseOrder, GoodsReceipt, Invoice, AuditEvent

def seed():
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        # Check if already seeded
        if db.query(Supplier).count() > 0:
            print("Database already has suppliers. Cleaning up to re-seed...")
            db.query(Invoice).delete()
            db.query(GoodsReceipt).delete()
            db.query(PurchaseOrder).delete()
            db.query(Supplier).delete()
            db.commit()

        # 1. Suppliers
        suppliers = [
            Supplier(tax_code="0101778163", name="Công ty Cổ phần Viễn thông FPT", email="hotro@fpt.com.vn"),
            Supplier(tax_code="0302888783", name="Công ty Cổ phần Thế Giới Số (Digiworld)", email="contact@digiworld.com.vn"),
            Supplier(tax_code="0301464830", name="Tập đoàn Thiên Long", email="sales@thienlong.vn"),
            Supplier(tax_code="0100107624", name="Tập đoàn Xăng dầu Việt Nam (Petrolimex)", email="vanphong@petrolimex.com.vn"),
            Supplier(tax_code="0900189284", name="Công ty Cổ phần Tập đoàn Hòa Phát", email="thep@hoaphat.com.vn"),
            Supplier(tax_code="0300588569", name="Công ty Cổ phần Sữa Việt Nam (Vinamilk)", email="vinamilk@vinamilk.com.vn"),
        ]
        db.add_all(suppliers)
        db.commit()
        print(f"Added {len(suppliers)} suppliers.")

        # 2. Purchase Orders
        pos = [
            PurchaseOrder(
                po_number="PO-2026-0001",
                supplier_tax_code="0101778163",
                total_amount=16500000.0,
                status="fulfilled",
                lines=[
                    {"name": "Gói cước Internet Doanh nghiệp FPT FTTH Pro 200", "unit": "Tháng", "quantity": 3, "unit_price": 2500000.0, "amount": 7500000.0},
                    {"name": "Dịch vụ Thuê Máy chủ ảo Cloud VPS 8 Core 16GB RAM", "unit": "Tháng", "quantity": 5, "unit_price": 1800000.0, "amount": 9000000.0}
                ]
            ),
            PurchaseOrder(
                po_number="PO-2026-0002",
                supplier_tax_code="0302888783",
                total_amount=76000000.0,
                status="fulfilled",
                lines=[
                    {"name": "Laptop Dell Vostro 3520 Intel Core i5-1235U 8GB SSD 512GB", "unit": "Chiếc", "quantity": 4, "unit_price": 16000000.0, "amount": 64000000.0},
                    {"name": "Thanh RAM Kingston Fury Beast 16GB DDR4 Bus 3200", "unit": "Thanh", "quantity": 10, "unit_price": 1200000.0, "amount": 12000000.0}
                ]
            ),
            PurchaseOrder(
                po_number="PO-2026-0003",
                supplier_tax_code="0301464830",
                total_amount=8900000.0,
                status="partially_delivered",
                lines=[
                    {"name": "Bút bi Gel Thiên Long Smooth Ink 0.5mm Xanh", "unit": "Hộp", "quantity": 100, "unit_price": 35000.0, "amount": 3500000.0},
                    {"name": "Giấy in Double A Khổ A4 Định lượng 70gsm (Ram 500 tờ)", "unit": "Ram", "quantity": 50, "unit_price": 108000.0, "amount": 5400000.0}
                ]
            ),
            PurchaseOrder(
                po_number="PO-2026-0004",
                supplier_tax_code="0100107624",
                total_amount=18450000.0,
                status="fulfilled",
                lines=[
                    {"name": "Xăng RON 95-V Nhiên liệu vận tải xe ban giám đốc", "unit": "Lít", "quantity": 750, "unit_price": 24600.0, "amount": 18450000.0}
                ]
            ),
            PurchaseOrder(
                po_number="PO-2026-0005",
                supplier_tax_code="0900189284",
                total_amount=142000000.0,
                status="fulfilled",
                lines=[
                    {"name": "Thép cuộn xây dựng Hòa Phát D6 mác SAE1008", "unit": "Tấn", "quantity": 4, "unit_price": 16500000.0, "amount": 66000000.0},
                    {"name": "Thép thanh vằn Hòa Phát D10 CB300V tiêu chuẩn TCVN 1651-2:2018", "unit": "Tấn", "quantity": 5, "unit_price": 15200000.0, "amount": 76000000.0}
                ]
            ),
            PurchaseOrder(
                po_number="PO-2026-0006",
                supplier_tax_code="0300588569",
                total_amount=24000000.0,
                status="fulfilled",
                lines=[
                    {"name": "Sữa tươi tiệt trùng Vinamilk 100% Có đường Hộp 1L (Thùng 12 hộp)", "unit": "Thùng", "quantity": 60, "unit_price": 400000.0, "amount": 24000000.0}
                ]
            ),
        ]
        db.add_all(pos)
        db.commit()
        print(f"Added {len(pos)} purchase orders.")

        # 3. Goods Receipts
        grs = [
            GoodsReceipt(
                receipt_number="PNK-2026-0001",
                po_number="PO-2026-0001",
                lines=[
                    {"name": "Gói cước Internet Doanh nghiệp FPT FTTH Pro 200", "quantity": 3},
                    {"name": "Dịch vụ Thuê Máy chủ ảo Cloud VPS 8 Core 16GB RAM", "quantity": 5}
                ]
            ),
            GoodsReceipt(
                receipt_number="PNK-2026-0002",
                po_number="PO-2026-0002",
                lines=[
                    {"name": "Laptop Dell Vostro 3520 Intel Core i5-1235U 8GB SSD 512GB", "quantity": 4},
                    {"name": "Thanh RAM Kingston Fury Beast 16GB DDR4 Bus 3200", "quantity": 10}
                ]
            ),
            GoodsReceipt(
                receipt_number="PNK-2026-0003",
                po_number="PO-2026-0003",
                lines=[
                    {"name": "Bút bi Gel Thiên Long Smooth Ink 0.5mm Xanh", "quantity": 100},
                    {"name": "Giấy in Double A Khổ A4 Định lượng 70gsm", "quantity": 50}
                ]
            ),
            GoodsReceipt(
                receipt_number="PNK-2026-0004",
                po_number="PO-2026-0004",
                lines=[
                    {"name": "Xăng RON 95-V Nhiên liệu vận tải xe ban giám đốc", "quantity": 750}
                ]
            ),
            GoodsReceipt(
                receipt_number="PNK-2026-0005",
                po_number="PO-2026-0005",
                lines=[
                    {"name": "Thép cuộn xây dựng Hòa Phát D6 mác SAE1008", "quantity": 4},
                    {"name": "Thép thanh vằn Hòa Phát D10 CB300V tiêu chuẩn TCVN", "quantity": 5}
                ]
            ),
            GoodsReceipt(
                receipt_number="PNK-2026-0006",
                po_number="PO-2026-0006",
                lines=[
                    {"name": "Sữa tươi tiệt trùng Vinamilk 100% Có đường Hộp 1L", "quantity": 60}
                ]
            ),
        ]
        db.add_all(grs)
        db.commit()
        print(f"Added {len(grs)} goods receipts.")

        # 4. Invoices
        invoices = [
            Invoice(
                original_name="0001892_1C26TAA.pdf",
                stored_path="uploads/0001892_1C26TAA.pdf",
                mime_type="application/pdf",
                sha256="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                status="matched",
                seller_tax_code="0101778163",
                buyer_tax_code="0109876543",
                invoice_number="0001892",
                invoice_date="2026-03-03",
                total_amount=18150000.0,
                ocr_confidence=0.984,
                po_number="PO-2026-0001",
                items=[
                    {"name": "Gói cước Internet Doanh nghiệp FPT FTTH Pro 200", "unit": "Tháng", "quantity": 3, "unit_price": 2500000.0, "amount": 7500000.0},
                    {"name": "Dịch vụ Thuê Máy chủ ảo Cloud VPS 8 Core 16GB RAM", "unit": "Tháng", "quantity": 5, "unit_price": 1800000.0, "amount": 9000000.0}
                ],
                ocr_text="HÓA ĐƠN GIÁ TRỊ GIA TĂNG\nMẫu số: 01GTKT0/001\nKý hiệu: 1C26TAA\nSố: 0001892\nNgày 03 tháng 03 năm 2026\nĐơn vị bán hàng: Công ty Cổ phần Viễn thông FPT\nMã số thuế: 0101778163",
                warnings=[]
            ),
            Invoice(
                original_name="hoa-don-01gtkt0-0004521.png",
                stored_path="uploads/hoa-don-01gtkt0-0004521.png",
                mime_type="image/png",
                sha256="a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
                status="mismatch",
                seller_tax_code="0302888783",
                buyer_tax_code="0109876543",
                invoice_number="0004521",
                invoice_date="2026-03-12",
                total_amount=85250000.0,
                ocr_confidence=0.962,
                po_number="PO-2026-0002",
                items=[
                    {"name": "Laptop Dell Vostro 3520 Intel Core i5-1235U 8GB SSD 512GB", "unit": "Chiếc", "quantity": 4, "unit_price": 16000000.0, "amount": 64000000.0},
                    {"name": "Thanh RAM Kingston Fury Beast 16GB DDR4 Bus 3200", "unit": "Thanh", "quantity": 10, "unit_price": 1350000.0, "amount": 13500000.0}
                ],
                ocr_text="HÓA ĐƠN GIÁ TRỊ GIA TĂNG\nMẫu số: 01GTKT0/001\nKý hiệu: 1C26TBB\nSố: 0004521\nNgày 12 tháng 03 năm 2026\nĐơn vị bán hàng: CÔNG TY CỔ PHẦN THẾ GIỚI SỐ (DIGIWORLD)\nMã số thuế: 0302888783",
                warnings=[
                    {
                        "code": "PRICE_MISMATCH",
                        "message": "Lệch đơn giá mặt hàng dòng số 2 (RAM Kingston): Đơn giá trên Hóa đơn là 1.350.000 đ/thanh, cao hơn đơn giá thỏa thuận trên Đơn đặt hàng PO-2026-0002 (1.200.000 đ/thanh). Chênh lệch vượt +150.000 đ/thanh (+1.500.000 đ chưa thuế)."
                    }
                ]
            ),
            Invoice(
                original_name="0007812_1C26TCC.pdf",
                stored_path="uploads/0007812_1C26TCC.pdf",
                mime_type="application/pdf",
                sha256="c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2",
                status="approved",
                seller_tax_code="0301464830",
                buyer_tax_code="0109876543",
                invoice_number="0007812",
                invoice_date="2026-03-16",
                total_amount=9790000.0,
                ocr_confidence=0.978,
                po_number="PO-2026-0003",
                items=[
                    {"name": "Bút bi Gel Thiên Long Smooth Ink 0.5mm Xanh", "unit": "Hộp", "quantity": 100, "unit_price": 35000.0, "amount": 3500000.0},
                    {"name": "Giấy in Double A Khổ A4 Định lượng 70gsm (Ram 500 tờ)", "unit": "Ram", "quantity": 50, "unit_price": 108000.0, "amount": 5400000.0}
                ],
                ocr_text="HÓA ĐƠN GIÁ TRỊ GIA TĂNG\nMẫu số: 01GTKT0/001\nKý hiệu: 1C26TCC\nSố: 0007812\nNgày 16 tháng 03 năm 2026\nĐơn vị bán hàng: Tập đoàn Thiên Long\nMã số thuế: 0301464830",
                warnings=[]
            ),
            Invoice(
                original_name="0009134_1C26TDD.pdf",
                stored_path="uploads/0009134_1C26TDD.pdf",
                mime_type="application/pdf",
                sha256="d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3",
                status="matched",
                seller_tax_code="0100107624",
                buyer_tax_code="0109876543",
                invoice_number="0009134",
                invoice_date="2026-03-21",
                total_amount=20295000.0,
                ocr_confidence=0.991,
                po_number="PO-2026-0004",
                items=[
                    {"name": "Xăng RON 95-V Nhiên liệu vận tải xe ban giám đốc", "unit": "Lít", "quantity": 750, "unit_price": 24600.0, "amount": 18450000.0}
                ],
                ocr_text="HÓA ĐƠN GIÁ TRỊ GIA TĂNG\nMẫu số: 01GTKT0/001\nKý hiệu: 1C26TDD\nSố: 0009134\nNgày 21 tháng 03 năm 2026\nĐơn vị bán hàng: Tập đoàn Xăng dầu Việt Nam (Petrolimex)\nMã số thuế: 0100107624",
                warnings=[]
            ),
            Invoice(
                original_name="0012450_1C26TEE.pdf",
                stored_path="uploads/0012450_1C26TEE.pdf",
                mime_type="application/pdf",
                sha256="e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4",
                status="needs_review",
                seller_tax_code="0900189284",
                buyer_tax_code="0109876543",
                invoice_number="0012450",
                invoice_date="2026-03-23",
                total_amount=156200000.0,
                ocr_confidence=0.955,
                po_number="PO-2026-0005",
                items=[
                    {"name": "Thép cuộn xây dựng Hòa Phát D6 mác SAE1008", "unit": "Tấn", "quantity": 4, "unit_price": 16500000.0, "amount": 66000000.0},
                    {"name": "Thép thanh vằn Hòa Phát D10 CB300V tiêu chuẩn TCVN 1651-2:2018", "unit": "Tấn", "quantity": 5, "unit_price": 15200000.0, "amount": 76000000.0}
                ],
                ocr_text="HÓA ĐƠN GIÁ TRỊ GIA TĂNG\nMẫu số: 01GTKT0/001\nKý hiệu: 1C26TEE\nSố: 0012450\nNgày 23 tháng 03 năm 2026\nĐơn vị bán hàng: Công ty Cổ phần Tập đoàn Hòa Phát\nMã số thuế: 0900189284",
                warnings=[
                    {
                        "code": "REVIEW_NEEDED",
                        "message": "Cần kế toán viên kiểm tra đối chiếu thực tế với chứng từ gốc."
                    }
                ]
            ),
            Invoice(
                original_name="0015678_1C26TFF.pdf",
                stored_path="uploads/0015678_1C26TFF.pdf",
                mime_type="application/pdf",
                sha256="f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5",
                status="matched",
                seller_tax_code="0300588569",
                buyer_tax_code="0109876543",
                invoice_number="0015678",
                invoice_date="2026-03-25",
                total_amount=26400000.0,
                ocr_confidence=0.980,
                po_number="PO-2026-0006",
                items=[
                    {"name": "Sữa tươi tiệt trùng Vinamilk 100% Có đường Hộp 1L (Thùng 12 hộp)", "unit": "Thùng", "quantity": 60, "unit_price": 400000.0, "amount": 24000000.0}
                ],
                ocr_text="HÓA ĐƠN GIÁ TRỊ GIA TĂNG\nMẫu số: 01GTKT0/001\nKý hiệu: 1C26TFF\nSố: 0015678\nNgày 25 tháng 03 năm 2026\nĐơn vị bán hàng: Công ty Cổ phần Sữa Việt Nam (Vinamilk)\nMã số thuế: 0300588569",
                warnings=[]
            ),
        ]
        db.add_all(invoices)
        db.commit()
        print(f"Added {len(invoices)} invoices.")

if __name__ == "__main__":
    seed()
