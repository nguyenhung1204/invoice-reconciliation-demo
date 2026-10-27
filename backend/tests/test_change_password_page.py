from contextlib import asynccontextmanager

from fastapi.testclient import TestClient

from app.main import app


@asynccontextmanager
async def no_lifespan(_app):
    yield


def test_change_password_page_uses_authenticated_app_session():
    original_lifespan = app.router.lifespan_context
    app.router.lifespan_context = no_lifespan
    try:
        with TestClient(app) as client:
            response = client.get("/change-password.html")
        assert response.status_code == 200
        assert "sessionStorage.getItem('autoinvoice_access_token')" in response.text
        assert "fetch('/api/auth/change-password'" in response.text
    finally:
        app.router.lifespan_context = original_lifespan
