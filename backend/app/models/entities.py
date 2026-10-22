from datetime import datetime, timezone
from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, Numeric, String, Text, UniqueConstraint
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
    tax_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    email: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    po_number: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    supplier_tax_code: Mapped[str] = mapped_column(String(32), index=True)
    total_amount: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(32), default="open")
    lines: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class GoodsReceipt(Base):
    __tablename__ = "goods_receipts"
    id: Mapped[int] = mapped_column(primary_key=True)
    receipt_number: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    po_number: Mapped[str] = mapped_column(String(80), index=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    lines: Mapped[list] = mapped_column(JSON, default=list)


class Invoice(Base):
    __tablename__ = "invoices"
    id: Mapped[int] = mapped_column(primary_key=True)
    original_name: Mapped[str] = mapped_column(String(255))
    stored_path: Mapped[str] = mapped_column(String(500))
    mime_type: Mapped[str] = mapped_column(String(100), default="application/octet-stream")
    sha256: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(32), default="uploaded", index=True)
    seller_tax_code: Mapped[str] = mapped_column(String(32), default="", index=True)
    buyer_tax_code: Mapped[str] = mapped_column(String(32), default="")
    invoice_number: Mapped[str] = mapped_column(String(80), default="")
    invoice_date: Mapped[str] = mapped_column(String(32), default="")
    total_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    items: Mapped[list] = mapped_column(JSON, default=list)
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
    dataset_memberships: Mapped[list["InvoiceDatasetMembership"]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan"
    )


class InvoiceItem(Base):
    """Normalized invoice line table; Invoice.items remains for old rows only."""

    __tablename__ = "invoice_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_id: Mapped[int] = mapped_column(
        ForeignKey("invoices.id", ondelete="CASCADE"), index=True
    )
    line_number: Mapped[int] = mapped_column(Integer)
    item_description: Mapped[str] = mapped_column(Text)
    unit: Mapped[str | None] = mapped_column(String(80), nullable=True)
    quantity: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    unit_price: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    line_total: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    data_source: Mapped[str] = mapped_column(String(32), default="manual")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    invoice: Mapped[Invoice] = relationship(back_populates="item_rows")
    __table_args__ = (UniqueConstraint("invoice_id", "line_number", name="uq_invoice_item_line"),)


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
    actor_email: Mapped[str] = mapped_column(String(255))
    action: Mapped[str] = mapped_column(String(80), index=True)
    entity_type: Mapped[str] = mapped_column(String(80))
    entity_id: Mapped[str] = mapped_column(String(80))
    detail: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
