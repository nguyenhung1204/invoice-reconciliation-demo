import io
import tempfile
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from starlette.datastructures import Headers, UploadFile

from app.api import invoices
from app.core.database import Base
from app.models import Invoice, InvoiceFile, InvoiceOCRRun


def test_upload_saves_invoice_when_ocr_succeeds(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'upload-test.db'}")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    monkeypatch.setattr(invoices.settings, "upload_dir", str(tmp_path / "uploads"))
    monkeypatch.setattr(
        invoices,
        "recognize_file",
        lambda _path: {"text": "OCR text", "confidence": 0.98, "blocks": []},
    )

    async def recognize_inline(func, *args):
        return func(*args)

    monkeypatch.setattr(invoices, "run_in_threadpool", recognize_inline)
    file_bytes = tempfile.SpooledTemporaryFile()
    file_bytes.write(b"test image bytes")
    file_bytes.seek(0)
    upload = UploadFile(
        filename="smoke.png",
        file=file_bytes,
        headers=Headers({"content-type": "image/png"}),
    )

    try:
        operation = invoices.upload_invoice(
            upload,
            session,
            SimpleNamespace(email="reviewer@example.com"),
        )
        try:
            operation.send(None)
        except StopIteration as complete:
            result = complete.value
        assert result["status"] == "ocr_done"
        assert result["ocr_text"] == "OCR text"
        invoice = session.query(Invoice).one()
        assert session.query(InvoiceFile).filter_by(invoice_id=invoice.id).count() == 1
        assert session.query(InvoiceOCRRun).filter_by(invoice_id=invoice.id, status="succeeded").count() == 1
    finally:
        file_bytes.close()
        session.close()
        engine.dispose()
