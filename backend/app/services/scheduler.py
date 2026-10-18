from hashlib import sha256
from pathlib import Path

from app.core.config import settings
from app.core.database import SessionLocal
from app.models import AuditEvent, Invoice


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
