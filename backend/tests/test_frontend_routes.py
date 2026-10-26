from contextlib import asynccontextmanager
import re

import pytest
from fastapi.testclient import TestClient

from app.main import app


@asynccontextmanager
async def no_lifespan(_app):
    yield




def test_root_serves_the_migrated_react_frontend_when_enabled(monkeypatch):
    from pathlib import Path
    from app.core.config import settings

    dist = Path(__file__).resolve().parents[2] / "frontend" / "react-app" / "dist"
    if not (dist / "index.html").is_file():
        pytest.skip("React migration candidate has not been built")

    monkeypatch.setattr(settings, "primary_frontend", "react")
    original_lifespan = app.router.lifespan_context
    app.router.lifespan_context = no_lifespan
    try:
        with TestClient(app) as client:
            response = client.get("/")
            asset_paths = re.findall(r'(?:src|href)="(/react-app-assets/[^\"]+)"', response.text)
            asset_responses = [client.get(path) for path in asset_paths]
        assert response.status_code == 200
        assert asset_paths
        assert all(asset_response.status_code == 200 for asset_response in asset_responses)
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


def test_old_route_is_removed():
    original_lifespan = app.router.lifespan_context
    app.router.lifespan_context = no_lifespan
    try:
        with TestClient(app) as client:
            response = client.get("/old")
        assert response.status_code == 404
    finally:
        app.router.lifespan_context = original_lifespan


def test_migration_candidate_and_assets_are_served_when_built():
    from pathlib import Path

    dist = Path(__file__).resolve().parents[2] / "frontend" / "react-app" / "dist"
    if not (dist / "index.html").is_file():
        pytest.skip("React migration candidate has not been built")

    original_lifespan = app.router.lifespan_context
    app.router.lifespan_context = no_lifespan
    try:
        with TestClient(app) as client:
            response = client.get("/new")
            assert response.status_code == 200
            asset_paths = re.findall(r'(?:src|href)="(/react-app-assets/[^\"]+)"', response.text)
            assert asset_paths
            for asset_path in asset_paths:
                asset_response = client.get(asset_path)
                assert asset_response.status_code == 200
    finally:
        app.router.lifespan_context = original_lifespan
