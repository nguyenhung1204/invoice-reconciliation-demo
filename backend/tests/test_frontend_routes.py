from contextlib import asynccontextmanager
import re

import pytest
from fastapi.testclient import TestClient

from app.main import app


@asynccontextmanager
async def no_lifespan(_app):
    yield




def test_root_and_compatibility_routes_serve_the_same_react_frontend():
    from pathlib import Path

    dist = Path(__file__).resolve().parents[2] / "frontend" / "react-app" / "dist"
    if not (dist / "index.html").is_file():
        pytest.skip("React migration candidate has not been built")

    original_lifespan = app.router.lifespan_context
    app.router.lifespan_context = no_lifespan
    try:
        with TestClient(app) as client:
            responses = [client.get(path) for path in ("/", "/mock", "/new", "/index.html")]
            asset_paths = [re.findall(r'(?:src|href)="(/react-app-assets/[^\"]+)"', response.text) for response in responses]
            asset_responses = [client.get(path) for paths in asset_paths for path in paths]
        assert all(response.status_code == 200 for response in responses)
        assert all(paths for paths in asset_paths)
        assert all(paths == asset_paths[0] for paths in asset_paths)
        assert all(asset_response.status_code == 200 for asset_response in asset_responses)
    finally:
        app.router.lifespan_context = original_lifespan


def test_unknown_api_route_returns_json_404_instead_of_legacy_html():
    original_lifespan = app.router.lifespan_context
    app.router.lifespan_context = no_lifespan
    try:
        with TestClient(app) as client:
            response = client.get("/api/not-a-real-route")
        assert response.status_code == 404
        assert response.headers["content-type"].startswith("application/json")
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
