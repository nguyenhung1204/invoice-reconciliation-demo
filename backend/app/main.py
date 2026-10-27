from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api import accounting, auth, invoices, ledger, master_data, reports
from app.core.config import settings
from app.core.database import SessionLocal, engine
from app.core.security import hash_password
from app.models import ReconciliationSetting, User
from app.services.scheduler import start_background_scheduler, stop_background_scheduler
from app.services.demo_seed import seed_public_demo
from app.services.reconciliation_settings import get_reconciliation_settings
from app.migrations.runner import upgrade_schema

def initialize():
    if settings.database_url.startswith("sqlite"):
        with engine.connect() as connection:
            connection.exec_driver_sql("PRAGMA journal_mode=WAL")
            connection.commit()
    upgrade_schema(engine)
    with SessionLocal() as db:
        if db.get(ReconciliationSetting, 1) is None:
            db.add(ReconciliationSetting(id=1, **get_reconciliation_settings()))
            db.commit()
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
        if settings.load_demo_seed:
            seed_public_demo(
                db,
                upload_dir=settings.upload_dir,
                fixture_path=settings.demo_invoice_fixture_path,
            )


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize()
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    from app.models import ReconciliationSetting
    with SessionLocal() as db:
        saved_settings = db.get(ReconciliationSetting, 1)
        inbox_interval_minutes = saved_settings.rpa_scan_interval_minutes if saved_settings else 5
    start_background_scheduler(inbox_interval_minutes)
    yield
    stop_background_scheduler()


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)


@app.middleware("http")
async def revalidate_active_frontend(request, call_next):
    response = await call_next(request)
    content_type = response.headers.get("content-type", "")
    if content_type.startswith("text/html") or content_type.startswith("application/javascript"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(ledger.router, prefix="/api")
app.include_router(master_data.router, prefix="/api")
app.include_router(accounting.router, prefix="/api")
app.include_router(invoices.router, prefix="/api")
app.include_router(reports.router, prefix="/api")

frontend_dir = Path(__file__).resolve().parents[2] / "frontend"
assets_dir = (frontend_dir / "assets") if (frontend_dir / "assets").exists() else (frontend_dir / "src")
app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")
app.mount("/legacy-assets", StaticFiles(directory=frontend_dir / "src"), name="legacy-assets")
react_app_dist = frontend_dir / "react-app" / "dist"
app.mount(
    "/react-app-assets",
    StaticFiles(directory=react_app_dist, check_dir=False),
    name="react-app-assets",
)


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
def live_frontend():
    target = react_app_dist / "index.html"
    if target.is_file():
        return FileResponse(target)
    raise HTTPException(404, "Giao diện React chưa được build.")


@app.get("/change-password.html")
def change_password_page():
    target = frontend_dir / "change-password.html"
    if target.is_file():
        return FileResponse(target)
    raise HTTPException(404, "Không tìm thấy trang đổi mật khẩu.")


@app.get("/old")
def old_removed():
    raise HTTPException(404, "Đường dẫn /old đã bị xóa hoàn toàn khỏi hệ thống.")


@app.get("/mock")
def mock_frontend():
    # Keep the old URL working, but never serve a second, disconnected UI.
    return live_frontend()


@app.get("/new")
def migration_candidate_frontend():
    target = react_app_dist / "index.html"
    if target.is_file():
        return FileResponse(target)
    raise HTTPException(404, "React migration candidate has not been built yet.")


@app.get("/{full_path:path}")
def index(full_path: str = ""):
    if full_path.startswith("api/"):
        raise HTTPException(404, "Không tìm thấy API")
    return live_frontend()

