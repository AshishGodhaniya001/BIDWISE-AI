from .conftest import register


def test_cookie_authentication_flow(client):
    register(client)
    assert "bidwise_session" in client.cookies
    assert client.get("/v1/auth/profile").status_code == 200

    assert client.post("/v1/auth/logout").status_code == 204
    assert client.get("/v1/auth/profile").status_code == 401

    login = client.post(
        "/v1/auth/login",
        json={"email": "owner@example.com", "password": "S3curePass123!"},
    )
    assert login.status_code == 200
    assert client.get("/v1/auth/profile").json()["email"] == "owner@example.com"


def test_profile_update_uses_json_body(authenticated_client):
    response = authenticated_client.put(
        "/v1/auth/profile",
        json={
            "company": "Acme Infrastructure",
            "capabilities": "Solar EPC and public works",
            "certifications": "ISO 9001",
            "years_experience": 8,
            "annual_turnover": "25000000",
        },
    )
    assert response.status_code == 200
    profile = response.json()
    assert profile["company"] == "Acme Infrastructure"
    assert profile["years_experience"] == 8


def test_rejects_weak_password(client):
    response = client.post(
        "/v1/auth/register",
        json={"name": "Test Owner", "email": "weak@example.com", "password": "short"},
    )
    assert response.status_code == 422
