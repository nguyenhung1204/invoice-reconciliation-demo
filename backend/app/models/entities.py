from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(40), default="accountant")
    active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Supplier(Base):
    __tablename__ = "suppliers"
    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_code: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
    tax_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    address: Mapped[str] = mapped_column(String(500), default="")
    phone: Mapped[str] = mapped_column(String(40), default="")
    email: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    purchase_orders: Mapped[list["PurchaseOrder"]] = relationship(back_populates="supplier")


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    po_number: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id", name="fk_purchase_orders_supplier"), index=True)
    supplier_tax_code: Mapped[str] = mapped_column(String(32), index=True)  # source-document snapshot for the existing API
    total_amount: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    status: Mapped[str] = mapped_column(String(32), default="open")
    order_date: Mapped[str] = mapped_column(String(10), default="")
    expected_delivery_date: Mapped[str] = mapped_column(String(10), default="")
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    employee_code: Mapped[str] = mapped_column(String(80), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    supplier: Mapped[Supplier] = relationship(back_populates="purchase_orders")
    created_by_user: Mapped[User | None] = relationship()
    line_rows: Mapped[list["PurchaseOrderItem"]] = relationship(
        back_populates="purchase_order", cascade="all, delete-orphan", order_by="PurchaseOrderItem.line_number"
    )
    goods_receipts: Mapped[list["GoodsReceipt"]] = relationship(back_populates="purchase_order")
    invoices: Mapped[list["Invoice"]] = relationship(back_populates="purchase_order")

    @property
    def lines(self) -> list[dict]:
        return [
            {
                "name": row.item_description,
                "unit": row.unit,
                "quantity": float(row.quantity),
                "unit_price": float(row.unit_price),
                "amount": float(row.line_total) if row.line_total is not None else None,
            }
            for row in self.line_rows
        ]


class GoodsReceipt(Base):
    __tablename__ = "goods_receipts"
    id: Mapped[int] = mapped_column(primary_key=True)
    receipt_number: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    po_id: Mapped[int] = mapped_column(ForeignKey("purchase_orders.id", name="fk_goods_receipts_po"), index=True)
    po_number: Mapped[str] = mapped_column(String(80), index=True)  # source-document snapshot for the existing API
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    received_by: Mapped[str] = mapped_column(String(255), default="")
    warehouse_location: Mapped[str] = mapped_column(String(255), default="")
    purchase_order: Mapped[PurchaseOrder] = relationship(back_populates="goods_receipts")
    line_rows: Mapped[list["GoodsReceiptItem"]] = relationship(
        back_populates="goods_receipt", cascade="all, delete-orphan", order_by="GoodsReceiptItem.line_number"
    )

    @property
    def lines(self) -> list[dict]:
        return [
            {"name": row.item_description, "unit": row.unit, "quantity": float(row.quantity_received), "notes": row.notes or ""}
            for row in self.line_rows
        ]


class Invoice(Base):
    __tablename__ = "invoices"
    id: Mapped[int] = mapped_column(primary_key=True)
    original_name: Mapped[str] = mapped_column(String(255))
    stored_path: Mapped[str] = mapped_column(String(500))
    mime_type: Mapped[str] = mapped_column(String(100), default="application/octet-stream")
    sha256: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(32), default="uploaded", index=True)
    seller_supplier_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id", name="fk_invoices_seller_supplier"), nullable=True, index=True)
    po_id: Mapped[int | None] = mapped_column(ForeignKey("purchase_orders.id", name="fk_invoices_po"), nullable=True, index=True)
    po_reference_text: Mapped[str] = mapped_column(String(80), default="")
    seller_tax_code: Mapped[str] = mapped_column(String(32), default="", index=True)
    seller_name: Mapped[str] = mapped_column(String(500), default="")
    buyer_tax_code: Mapped[str] = mapped_column(String(32), default="")
    invoice_number: Mapped[str] = mapped_column(String(80), default="")
    invoice_series: Mapped[str] = mapped_column(String(80), default="")
    invoice_date: Mapped[str] = mapped_column(String(32), default="")
    total_amount: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    currency_code: Mapped[str] = mapped_column(String(3), default="VND")
    subtotal_amount: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    tax_amount: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    ocr_text: Mapped[str] = mapped_column(Text, default="")
    ocr_blocks: Mapped[list] = mapped_column(JSON, default=list)
    ocr_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    warnings: Mapped[list] = mapped_column(JSON, default=list)
    po_number: Mapped[str] = mapped_column(String(80), default="")
    review_note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    item_rows: Mapped[list["InvoiceItem"]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan", order_by="InvoiceItem.line_number"
    )
    purchase_order: Mapped[PurchaseOrder | None] = relationship(back_populates="invoices")
    seller_supplier: Mapped[Supplier | None] = relationship(foreign_keys=[seller_supplier_id])
    file_rows: Mapped[list["InvoiceFile"]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan", order_by="InvoiceFile.invoice_file_id"
    )
    dataset_memberships: Mapped[list["InvoiceDatasetMembership"]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan"
    )


class InvoiceItem(Base):
    """Normalized, editable invoice line; research labels live in another table."""

    __tablename__ = "invoice_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(
        ForeignKey("invoices.id", ondelete="CASCADE"), index=True
    )
    line_number: Mapped[int] = mapped_column(Integer)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"), nullable=True)
    item_description: Mapped[str] = mapped_column(Text)
    unit: Mapped[str | None] = mapped_column(String(80), nullable=True)
    quantity: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    unit_price: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    tax_rate: Mapped[float | None] = mapped_column(Numeric(7, 4), nullable=True)
    line_total: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    data_source: Mapped[str] = mapped_column(String(32), default="manual")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    invoice: Mapped[Invoice] = relationship(back_populates="item_rows")
    product: Mapped["Product | None"] = relationship()
    __table_args__ = (UniqueConstraint("invoice_id", "line_number", name="uq_invoice_item_line"),)


class Product(Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(primary_key=True)
    sku: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
    product_name: Mapped[str] = mapped_column(String(500))
    unit: Mapped[str | None] = mapped_column(String(80), nullable=True)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("product_categories.id"), nullable=True, index=True)
    cost_price: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    selling_price: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    stock_qty: Mapped[float] = mapped_column(Numeric(18, 4), default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    category: Mapped["ProductCategory | None"] = relationship(back_populates="products")


class ProductCategory(Base):
    __tablename__ = "product_categories"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    products: Mapped[list[Product]] = relationship(back_populates="category")


class Customer(Base):
    __tablename__ = "customers"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    phone: Mapped[str] = mapped_column(String(40), default="")
    address: Mapped[str] = mapped_column(String(500), default="")
    email: Mapped[str] = mapped_column(String(255), default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Employee(Base):
    __tablename__ = "employees"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(120), default="Kế toán viên")
    phone: Mapped[str] = mapped_column(String(40), default="")
    email: Mapped[str] = mapped_column(String(255), default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ReconciliationSetting(Base):
    __tablename__ = "reconciliation_settings"
    id: Mapped[int] = mapped_column(primary_key=True)
    currency_tolerance: Mapped[float] = mapped_column(Numeric(18, 2))
    item_similarity_threshold: Mapped[int] = mapped_column(Integer)
    ocr_confidence_min: Mapped[float] = mapped_column(Numeric(7, 6))
    rpa_scan_interval_minutes: Mapped[int] = mapped_column(Integer, default=5)
    auto_alert_email: Mapped[bool] = mapped_column(Boolean, default=True)
    auto_alert_telegram: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class AccountingVoucher(Base):
    __tablename__ = "accounting_vouchers"
    id: Mapped[int] = mapped_column(primary_key=True)
    voucher_number: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    voucher_type: Mapped[str] = mapped_column(String(8))
    voucher_date: Mapped[str] = mapped_column(String(10))
    related_party_name: Mapped[str] = mapped_column(String(255))
    related_invoice_id: Mapped[int | None] = mapped_column(ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True)
    content: Mapped[str] = mapped_column(Text)
    amount: Mapped[float] = mapped_column(Numeric(18, 2))
    is_auto_generated: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    po_id: Mapped[int] = mapped_column(ForeignKey("purchase_orders.id"), index=True)
    line_number: Mapped[int] = mapped_column(Integer)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"), nullable=True)
    item_description: Mapped[str] = mapped_column(Text)
    unit: Mapped[str | None] = mapped_column(String(80), nullable=True)
    quantity: Mapped[float] = mapped_column(Numeric(18, 4))
    unit_price: Mapped[float] = mapped_column(Numeric(18, 2))
    line_total: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    purchase_order: Mapped[PurchaseOrder] = relationship(back_populates="line_rows")
    product: Mapped[Product | None] = relationship()
    __table_args__ = (UniqueConstraint("po_id", "line_number", name="uq_purchase_order_item_line"),)


class GoodsReceiptItem(Base):
    __tablename__ = "goods_receipt_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    gr_id: Mapped[int] = mapped_column(ForeignKey("goods_receipts.id"), index=True)
    po_item_id: Mapped[int | None] = mapped_column(ForeignKey("purchase_order_items.id"), nullable=True)
    line_number: Mapped[int] = mapped_column(Integer)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"), nullable=True)
    item_description: Mapped[str] = mapped_column(Text)
    unit: Mapped[str | None] = mapped_column(String(80), nullable=True)
    quantity_received: Mapped[float] = mapped_column(Numeric(18, 4))
    notes: Mapped[str] = mapped_column(Text, default="")
    goods_receipt: Mapped[GoodsReceipt] = relationship(back_populates="line_rows")
    purchase_order_item: Mapped[PurchaseOrderItem | None] = relationship()
    product: Mapped[Product | None] = relationship()
    __table_args__ = (UniqueConstraint("gr_id", "line_number", name="uq_goods_receipt_item_line"),)


class InvoiceFile(Base):
    __tablename__ = "invoice_files"
    invoice_file_id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"), index=True)
    original_name: Mapped[str] = mapped_column(String(255))
    relative_path: Mapped[str] = mapped_column(String(700))
    mime_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    invoice: Mapped[Invoice] = relationship(back_populates="file_rows")


class InvoiceOCRRun(Base):
    __tablename__ = "invoice_ocr_runs"
    ocr_run_id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"), index=True)
    engine: Mapped[str] = mapped_column(String(80))
    model_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    model_version: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(32))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Numeric(12, 4), nullable=True)
    config_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class InvoiceOCRField(Base):
    __tablename__ = "invoice_ocr_fields"
    ocr_field_id: Mapped[int] = mapped_column(primary_key=True)
    ocr_run_id: Mapped[int] = mapped_column(ForeignKey("invoice_ocr_runs.ocr_run_id"), index=True)
    field_key: Mapped[str] = mapped_column(String(80))
    value_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    normalized_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Numeric(7, 6), nullable=True)
    page_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bbox_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    warning: Mapped[str | None] = mapped_column(Text, nullable=True)


class InvoiceReview(Base):
    __tablename__ = "invoice_reviews"
    review_id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"), index=True)
    reviewer_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    revision_number: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(32))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_note: Mapped[str] = mapped_column(Text, default="")
    snapshot_json: Mapped[dict] = mapped_column(JSON, default=dict)
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    invalidated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    __table_args__ = (UniqueConstraint("invoice_id", "revision_number", name="uq_invoice_review_revision"),)


class ReconciliationRun(Base):
    __tablename__ = "reconciliation_runs"
    reconciliation_run_id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"), index=True)
    review_id: Mapped[int | None] = mapped_column(ForeignKey("invoice_reviews.review_id"), nullable=True)
    po_id: Mapped[int | None] = mapped_column(ForeignKey("purchase_orders.id"), nullable=True)
    gr_id: Mapped[int | None] = mapped_column(ForeignKey("goods_receipts.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(32))
    result_json: Mapped[dict] = mapped_column(JSON, default=dict)
    amount_tolerance: Mapped[float] = mapped_column(Numeric(18, 2), default=0)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    run_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class ReconciliationRunGoodsReceipt(Base):
    __tablename__ = "reconciliation_run_goods_receipts"
    id: Mapped[int] = mapped_column(primary_key=True)
    reconciliation_run_id: Mapped[int] = mapped_column(ForeignKey("reconciliation_runs.reconciliation_run_id"), index=True)
    gr_id: Mapped[int] = mapped_column(ForeignKey("goods_receipts.id"), index=True)
    __table_args__ = (UniqueConstraint("reconciliation_run_id", "gr_id", name="uq_reconciliation_run_gr"),)


class ReconciliationLineAllocation(Base):
    __tablename__ = "reconciliation_line_allocations"
    allocation_id: Mapped[int] = mapped_column(primary_key=True)
    reconciliation_run_id: Mapped[int] = mapped_column(ForeignKey("reconciliation_runs.reconciliation_run_id"), index=True)
    # Keep superseded reconciliation snapshots when a review replaces its
    # invoice lines. The allocation remains useful through its JSON snapshots.
    invoice_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("invoice_items.id", ondelete="SET NULL"), nullable=True, index=True
    )
    po_item_id: Mapped[int | None] = mapped_column(ForeignKey("purchase_order_items.id"), nullable=True)
    gr_item_id: Mapped[int | None] = mapped_column(ForeignKey("goods_receipt_items.id"), nullable=True)
    allocated_quantity: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    allocated_amount: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    invoice_snapshot_json: Mapped[dict] = mapped_column(JSON, default=dict)
    po_snapshot_json: Mapped[dict] = mapped_column(JSON, default=dict)
    gr_snapshot_json: Mapped[dict] = mapped_column(JSON, default=dict)


class ReconciliationFinding(Base):
    __tablename__ = "reconciliation_findings"
    finding_id: Mapped[int] = mapped_column(primary_key=True)
    reconciliation_run_id: Mapped[int] = mapped_column(ForeignKey("reconciliation_runs.reconciliation_run_id"), index=True)
    allocation_id: Mapped[int | None] = mapped_column(ForeignKey("reconciliation_line_allocations.allocation_id"), nullable=True)
    finding_type: Mapped[str] = mapped_column(String(80))
    severity: Mapped[str] = mapped_column(String(24))
    expected_value: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    actual_value: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    difference_value: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    details: Mapped[str] = mapped_column(Text, default="")


class InvoiceApproval(Base):
    __tablename__ = "invoice_approvals"
    approval_id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id"), index=True)
    review_id: Mapped[int] = mapped_column(ForeignKey("invoice_reviews.review_id"))
    reconciliation_run_id: Mapped[int] = mapped_column(ForeignKey("reconciliation_runs.reconciliation_run_id"))
    approver_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(32))
    approved_amount: Mapped[float] = mapped_column(Numeric(18, 2))
    currency_code: Mapped[str] = mapped_column(String(3), default="VND")
    snapshot_json: Mapped[dict] = mapped_column(JSON, default=dict)
    content_hash: Mapped[str] = mapped_column(String(64))
    decided_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class InvoicePayment(Base):
    __tablename__ = "invoice_payments"
    payment_id: Mapped[int] = mapped_column(primary_key=True)
    approval_id: Mapped[int] = mapped_column(ForeignKey("invoice_approvals.approval_id"), index=True)
    recorded_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    amount: Mapped[float] = mapped_column(Numeric(18, 2))
    currency_code: Mapped[str] = mapped_column(String(3), default="VND")
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    method: Mapped[str | None] = mapped_column(String(40), nullable=True)
    reference: Mapped[str | None] = mapped_column(String(160), nullable=True)
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class InvoiceDataset(Base):
    __tablename__ = "datasets"
    id: Mapped[int] = mapped_column(primary_key=True)
    dataset_code: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_file: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_sheet: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    memberships: Mapped[list["InvoiceDatasetMembership"]] = relationship(
        back_populates="dataset", cascade="all, delete-orphan"
    )


class InvoiceDatasetMembership(Base):
    __tablename__ = "dataset_invoices"
    id: Mapped[int] = mapped_column(primary_key=True)
    dataset_id: Mapped[int] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), index=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("invoices.id", ondelete="CASCADE"), index=True)
    source_record_id: Mapped[str] = mapped_column(String(100))
    source_image: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_workbook: Mapped[str] = mapped_column(String(255))
    source_sheet: Mapped[str] = mapped_column(String(255))
    source_row: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    dataset: Mapped[InvoiceDataset] = relationship(back_populates="memberships")
    invoice: Mapped[Invoice] = relationship(back_populates="dataset_memberships")
    ground_truth_fields: Mapped[list["InvoiceGroundTruthField"]] = relationship(
        back_populates="membership", cascade="all, delete-orphan"
    )
    item_labels: Mapped[list["DatasetInvoiceItemLabel"]] = relationship(
        back_populates="membership", cascade="all, delete-orphan"
    )
    __table_args__ = (
        UniqueConstraint("dataset_id", "invoice_id", name="uq_dataset_invoice"),
        UniqueConstraint("dataset_id", "source_record_id", name="uq_dataset_source_record"),
    )


class InvoiceGroundTruthField(Base):
    __tablename__ = "invoice_ground_truth_fields"
    id: Mapped[int] = mapped_column(primary_key=True)
    dataset_invoice_id: Mapped[int] = mapped_column(
        ForeignKey("dataset_invoices.id", ondelete="CASCADE"), index=True
    )
    field_key: Mapped[str] = mapped_column(String(80))
    raw_value: Mapped[str] = mapped_column(Text)
    normalized_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_column: Mapped[str] = mapped_column(String(255))
    annotation_status: Mapped[str] = mapped_column(String(32), default="labeled")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    membership: Mapped[InvoiceDatasetMembership] = relationship(back_populates="ground_truth_fields")
    __table_args__ = (
        UniqueConstraint("dataset_invoice_id", "field_key", name="uq_invoice_ground_truth_field"),
    )


class DatasetInvoiceItemLabel(Base):
    __tablename__ = "dataset_invoice_item_labels"
    id: Mapped[int] = mapped_column(primary_key=True)
    dataset_invoice_id: Mapped[int] = mapped_column(
        ForeignKey("dataset_invoices.id", ondelete="CASCADE"), index=True
    )
    line_number: Mapped[int] = mapped_column(Integer)
    item_description: Mapped[str] = mapped_column(Text)
    unit: Mapped[str | None] = mapped_column(String(80), nullable=True)
    quantity: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    unit_price: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    annotation_status: Mapped[str] = mapped_column(String(32), default="description_only")
    source_column: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    membership: Mapped[InvoiceDatasetMembership] = relationship(back_populates="item_labels")
    __table_args__ = (
        UniqueConstraint("dataset_invoice_id", "line_number", name="uq_dataset_invoice_item_label"),
    )


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    actor_email: Mapped[str] = mapped_column(String(255))
    action: Mapped[str] = mapped_column(String(80), index=True)
    entity_type: Mapped[str] = mapped_column(String(80))
    entity_id: Mapped[str] = mapped_column(String(80))
    detail: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class SchemaMigration(Base):
    __tablename__ = "schema_migrations"
    revision: Mapped[str] = mapped_column(String(100), primary_key=True)
    applied_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
