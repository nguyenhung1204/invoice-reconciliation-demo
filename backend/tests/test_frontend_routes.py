from contextlib import asynccontextmanager

from fastapi.testclient import TestClient

from app.main import app


@asynccontextmanager
async def no_lifespan(_app):
    yield


def test_root_serves_the_api_connected_frontend():
    original_lifespan = app.router.lifespan_context
    app.router.lifespan_context = no_lifespan
    try:
        with TestClient(app) as client:
            response = client.get("/")
        assert response.status_code == 200
        assert 'src="/legacy-assets/app.js"' in response.text
        assert 'href="/legacy-assets/styles.css"' in response.text
        assert "Mock Frontend" not in response.text
    finally:
        app.router.lifespan_context = original_lifespan


def test_mock_frontend_remains_available_separately():
    original_lifespan = app.router.lifespan_context
    app.router.lifespan_context = no_lifespan
    try:
        with TestClient(app) as client:
            response = client.get("/mock")
        assert response.status_code == 200
        assert '/assets/index-sIj6KsIT.js' in response.text
    finally:
        app.router.lifespan_context = original_lifespan
