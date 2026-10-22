"""Explicit lifecycle operations for invoices with audit/history foreign keys."""

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import (
    DatasetInvoiceItemLabel,
    InvoiceApproval,
    InvoiceDatasetMembership,
    InvoiceFile,
    InvoiceGroundTruthField,
    InvoiceItem,
    InvoiceOCRField,
    InvoiceOCRRun,
    InvoicePayment,
    InvoiceReview,
    ReconciliationFinding,
    ReconciliationLineAllocation,
    ReconciliationRun,
    ReconciliationRunGoodsReceipt,
)


def delete_invoice_dependents(db: Session, invoice_id: int) -> None:
    """Delete FK dependents in safe order before hard-deleting an invoice."""
    run_ids = select(ReconciliationRun.reconciliation_run_id).where(
        ReconciliationRun.invoice_id == invoice_id
    )
    approval_ids = select(InvoiceApproval.approval_id).where(InvoiceApproval.invoice_id == invoice_id)
    ocr_run_ids = select(InvoiceOCRRun.ocr_run_id).where(InvoiceOCRRun.invoice_id == invoice_id)
    membership_ids = select(InvoiceDatasetMembership.id).where(
        InvoiceDatasetMembership.invoice_id == invoice_id
    )

    db.execute(delete(InvoicePayment).where(InvoicePayment.approval_id.in_(approval_ids)))
    db.execute(delete(ReconciliationFinding).where(ReconciliationFinding.reconciliation_run_id.in_(run_ids)))
    db.execute(delete(ReconciliationLineAllocation).where(
        ReconciliationLineAllocation.reconciliation_run_id.in_(run_ids)
    ))
    db.execute(delete(ReconciliationRunGoodsReceipt).where(
        ReconciliationRunGoodsReceipt.reconciliation_run_id.in_(run_ids)
    ))
    db.execute(delete(InvoiceApproval).where(InvoiceApproval.invoice_id == invoice_id))
    db.execute(delete(ReconciliationRun).where(ReconciliationRun.invoice_id == invoice_id))
    db.execute(delete(InvoiceReview).where(InvoiceReview.invoice_id == invoice_id))
    db.execute(delete(InvoiceOCRField).where(InvoiceOCRField.ocr_run_id.in_(ocr_run_ids)))
    db.execute(delete(InvoiceOCRRun).where(InvoiceOCRRun.invoice_id == invoice_id))
    db.execute(delete(InvoiceGroundTruthField).where(
        InvoiceGroundTruthField.dataset_invoice_id.in_(membership_ids)
    ))
    db.execute(delete(DatasetInvoiceItemLabel).where(
        DatasetInvoiceItemLabel.dataset_invoice_id.in_(membership_ids)
    ))
    db.execute(delete(InvoiceDatasetMembership).where(
        InvoiceDatasetMembership.invoice_id == invoice_id
    ))
    db.execute(delete(InvoiceFile).where(InvoiceFile.invoice_id == invoice_id))
    db.execute(delete(InvoiceItem).where(InvoiceItem.invoice_id == invoice_id))
