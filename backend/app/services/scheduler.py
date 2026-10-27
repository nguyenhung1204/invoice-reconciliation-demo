from hashlib import sha256
import csv
from datetime import date
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler

from app.core.config import settings
from app.core.database import SessionLocal
from app.models import AuditEvent, Invoice

REPORT_DIR = Path(__file__).resolve().parents[2] / "data" / "reports"
scheduler = BackgroundScheduler(daemon=True)


def start_background_scheduler(inbox_interval_minutes: int = 5) -> None:
    scheduler.add_job(generate_daily_reconciliation_report, "cron", hour=1, minute=0,
                      id="daily-reconciliation-report", replace_existing=True)
    inbox = Path(settings.inbox_scan_dir) if settings.inbox_scan_dir else None
    if inbox and inbox.is_dir():
        scheduler.add_job(scan_inbox_folder, "interval", minutes=inbox_interval_minutes,
                          id="inbox-folder-scan", replace_existing=True)
    elif scheduler.get_job("inbox-folder-scan"):
        scheduler.remove_job("inbox-folder-scan")
    if not scheduler.running:
        scheduler.start()


def update_background_scan_interval(interval_minutes: int) -> None:
    """Apply a saved interval to the running worker when its folder is configured."""
    inbox = Path(settings.inbox_scan_dir) if settings.inbox_scan_dir else None
    if not scheduler.running or not inbox or not inbox.is_dir():
        return
    if scheduler.get_job("inbox-folder-scan"):
        scheduler.reschedule_job("inbox-folder-scan", trigger="interval", minutes=interval_minutes)
    else:
        scheduler.add_job(scan_inbox_folder, "interval", minutes=interval_minutes,
                          id="inbox-folder-scan", replace_existing=True)


def stop_background_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)


def scan_inbox_folder() -> int:
    """Copy unseen files from an explicitly configured local inbox into the review queue."""
    source = Path(settings.inbox_scan_dir) if settings.inbox_scan_dir else None
    if not source or not source.is_dir():
        return 0
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    accepted = {".pdf", ".png", ".jpg", ".jpeg"}
    inserted = 0
    with SessionLocal() as db:
        for path in source.iterdir():
            if not path.is_file() or path.suffix.lower() not in accepted:
                continue
            content = path.read_bytes()
            digest = sha256(content).hexdigest()
            if db.query(Invoice).filter(Invoice.sha256 == digest).first():
                continue
            target = upload_dir / f"inbox-{digest[:20]}{path.suffix.lower()}"
            target.write_bytes(content)
            row = Invoice(original_name=path.name[:255], stored_path=str(target),
                          mime_type={".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}[path.suffix.lower()],
                          sha256=digest, status="needs_review",
                          warnings=[{"code": "INBOX_SCAN", "message": "Được tiếp nhận từ thư mục theo dõi; chờ chạy OCR hoặc rà soát."}])
            db.add(row); db.flush()
            db.add(AuditEvent(actor_email="system@scheduler", action="invoice.inbox_scan", entity_type="invoice",
                              entity_id=str(row.id), detail=path.name))
            inserted += 1
        db.commit()
    return inserted


def generate_daily_reconciliation_report(report_date: date | None = None) -> Path:
    """Write a dated CSV snapshot of invoice reconciliation outcomes."""
    report_date = report_date or date.today()
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORT_DIR / f"reconciliation-{report_date.isoformat()}.csv"
    with SessionLocal() as db, report_path.open("w", encoding="utf-8-sig", newline="") as target:
        writer = csv.writer(target)
        writer.writerow(["invoice_id", "file_name", "invoice_number", "invoice_date", "seller_tax_code",
                         "total_amount", "po_number", "status", "warning_codes", "warning_messages", "created_at"])
        for row in db.query(Invoice).filter(Invoice.status != "archived").order_by(Invoice.created_at.asc()):
            warnings = row.warnings or []
            writer.writerow([row.id, row.original_name, row.invoice_number, row.invoice_date,
                             row.seller_tax_code, row.total_amount, row.po_number, row.status,
                             ";".join(w.get("code", "") for w in warnings),
                             ";".join(w.get("message", "") for w in warnings),
                             row.created_at.isoformat() if row.created_at else ""])
    return report_path
