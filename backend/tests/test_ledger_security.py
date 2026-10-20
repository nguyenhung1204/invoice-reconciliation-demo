from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.ledger import router
from app.core.database import Base, get_db
from app.core.dependencies import current_user
from app.models import Supplier


def make_client(role):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    app = FastAPI()
    app.include_router(router, prefix="/api")

    def db_override():
        with factory() as db:
            yield db

    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[current_user] = lambda: SimpleNamespace(email=f"{role}@example.test", role=role)
    return TestClient(app), engine, factory


def test_accountant_cannot_clear_all():
    client, engine, _ = make_client("accountant")
    try:
        response = client.post("/api/ledger/clear-all")
        assert response.status_code == 403
    finally:
        engine.dispose()


def test_admin_can_clear_all():
    client, engine, factory = make_client("admin")
    try:
        with factory() as db:
            db.add(Supplier(tax_code="1234567890", name="Example"))
            db.commit()
        response = client.post("/api/ledger/clear-all")
        assert response.status_code == 200
        with factory() as db:
            assert db.query(Supplier).count() == 0
    finally:
        engine.dispose()
