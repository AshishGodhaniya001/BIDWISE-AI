import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


TEST_DB_PATH = Path(tempfile.gettempdir()) / "bidwise_test.db"
TEST_UPLOAD_DIR = Path(tempfile.gettempdir()) / "bidwise_test_uploads"
os.environ.update(
    {
        "APP_ENV": "test",
        "SECRET_KEY": "test-secret-key-that-is-long-and-not-used-outside-tests",
        "DATABASE_URL": f"sqlite:///{TEST_DB_PATH}",
        "UPLOAD_DIR": str(TEST_UPLOAD_DIR),
        "GEMINI_API_KEY": "",
    }
)
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from database import Base, SyncSessionLocal, sync_engine
from main import app


@pytest.fixture()
def client():
    from rate_limit import auth_limiter
    auth_limiter.reset()
    Base.metadata.drop_all(bind=sync_engine)
    Base.metadata.create_all(bind=sync_engine)
    TEST_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    with TestClient(app) as test_client:
        yield test_client
    Base.metadata.drop_all(bind=sync_engine)


@pytest.fixture()
def db():
    session = SyncSessionLocal()
    try:
        yield session
    finally:
        session.close()


def register(client: TestClient, email: str = "owner@example.com") -> dict:
    response = client.post(
        "/v1/auth/register",
        json={"name": "Test Owner", "email": email, "password": "S3curePass123!"},
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture()
def authenticated_client(client: TestClient):
    register(client)
    return client
