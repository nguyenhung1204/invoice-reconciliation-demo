from pathlib import Path
from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    pass


is_sqlite = settings.database_url.startswith("sqlite")
connect_args = {"check_same_thread": False, "timeout": 60} if is_sqlite else {}
if settings.database_url.startswith("sqlite:///"):
    db_file = Path(settings.database_url.removeprefix("sqlite:///"))
    if not db_file.is_absolute():
        db_file = Path(__file__).resolve().parents[2] / db_file
    db_file.parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(settings.database_url, connect_args=connect_args, pool_pre_ping=True)
if is_sqlite:
    @event.listens_for(engine, "connect")
    def set_sqlite_busy_timeout(dbapi_connection, _connection_record):
        dbapi_connection.execute("PRAGMA busy_timeout=60000")

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
