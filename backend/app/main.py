from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from apscheduler.schedulers.background import BackgroundScheduler

from app.api import auth, invoices, ledger, reports
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password
from app.models import User
from app.services.scheduler import scan_inbox_folder

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
    if settings.inbox_scan_dir:
        scheduler.add_job(scan_inbox_folder, "interval", minutes=1, id="inbox-folder-scan", replace_existing=True)
        scheduler.start()
    yield
    if scheduler.running:
        scheduler.shutdown(wait=False)


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
app.include_router(auth.router, prefix="/api")
app.include_router(ledger.router, prefix="/api")
app.include_router(invoices.router, prefix="/api")
app.include_router(reports.router, prefix="/api")

frontend_dir = Path(__file__).resolve().parents[2] / "frontend"
app.mount("/assets", StaticFiles(directory=frontend_dir / "src"), name="assets")


@app.get("/health")
def health():
    return {"status": "ok", "service": settings.app_name}


@app.get("/")
def index():
    return FileResponse(frontend_dir / "index.html")
