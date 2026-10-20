from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from apscheduler.schedulers.background import BackgroundScheduler

from app.api import auth, invoices, ledger, reports
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password
from app.models import User
from app.services.scheduler import generate_daily_reconciliation_report, scan_inbox_folder

scheduler = BackgroundScheduler(daemon=True)


def initialize():
    if settings.database_url.startswith("sqlite"):
        with engine.connect() as connection:
            connection.exec_driver_sql("PRAGMA journal_mode=WAL")
            connection.commit()
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        initial_users = (
            (settings.admin_email, settings.admin_password, "admin"),
            (settings.accountant_email, settings.accountant_password, "accountant"),
            (settings.chief_accountant_email, settings.chief_accountant_password, "chief_accountant"),
        )
        created = False
        for email, password, role in initial_users:
            if email and not db.query(User).filter_by(email=email).first():
                db.add(User(email=email, role=role, password_hash=hash_password(password)))
                created = True
        if created:
            db.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize()
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    scheduler.add_job(generate_daily_reconciliation_report, "cron", hour=1, minute=0,
                      id="daily-reconciliation-report", replace_existing=True)
    if settings.inbox_scan_dir:
        scheduler.add_job(scan_inbox_folder, "interval", minutes=1, id="inbox-folder-scan", replace_existing=True)
    scheduler.start()
    yield
    if scheduler.running:
        scheduler.shutdown(wait=False)


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(ledger.router, prefix="/api")
app.include_router(invoices.router, prefix="/api")
app.include_router(reports.router, prefix="/api")

frontend_dir = Path(__file__).resolve().parents[2] / "frontend"
assets_dir = (frontend_dir / "assets") if (frontend_dir / "assets").exists() else (frontend_dir / "src")
app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")


@app.get("/health")
def health():
    return {"status": "ok", "service": settings.app_name}


@app.get("/pdf.worker.min.js")
def pdf_worker():
    target = frontend_dir / "pdf.worker.min.js"
    if target.is_file():
        return FileResponse(target, media_type="application/javascript")
    raise HTTPException(404, "Không tìm thấy pdf.worker.min.js")


@app.get("/sample_vat_invoice.pdf")
def sample_pdf():
    target = frontend_dir / "sample_vat_invoice.pdf"
    if target.is_file():
        return FileResponse(target, media_type="application/pdf")
    raise HTTPException(404, "Không tìm thấy sample_vat_invoice.pdf")


@app.get("/")
@app.get("/{full_path:path}")
def index(full_path: str = ""):
    if full_path and not full_path.startswith("api/"):
        target = frontend_dir / full_path
        if target.is_file():
            mime = "application/javascript" if full_path.endswith(".js") else (
                "application/pdf" if full_path.endswith(".pdf") else None
            )
            return FileResponse(target, media_type=mime)
    return FileResponse(frontend_dir / "index.html")

