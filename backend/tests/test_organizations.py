from models import Membership, User


def _register(client, email: str, name: str = "Team User"):
    response = client.post("/v1/auth/register", json={"name": name, "email": email, "password": "S3curePass123!"})
    assert response.status_code == 201, response.text


def _login(client, email: str):
    response = client.post("/v1/auth/login", json={"email": email, "password": "S3curePass123!"})
    assert response.status_code == 200, response.text


def test_registration_creates_admin_workspace(client):
    _register(client, "owner@example.com", "Owner")
    profile = client.get("/v1/auth/profile")
    assert profile.status_code == 200, profile.text
    body = profile.json()
    assert body["role"] == "admin"
    assert body["organization_name"] == "Owner's Company"

    organizations = client.get("/v1/organizations").json()
    assert len(organizations) == 1
    assert organizations[0]["role"] == "admin"
    assert organizations[0]["member_count"] == 1


def test_create_company_workspace_switches_active_org(client):
    _register(client, "owner@example.com", "Owner")
    response = client.post("/v1/organizations", json={"name": "Acme Bids Pvt Ltd"})
    assert response.status_code == 201, response.text
    created = response.json()
    assert created["name"] == "Acme Bids Pvt Ltd"
    assert created["role"] == "admin"

    profile = client.get("/v1/auth/profile").json()
    assert profile["organization_name"] == "Acme Bids Pvt Ltd"


def test_invitation_acceptance_and_bid_manager_limits(client):
    _register(client, "owner@example.com", "Owner")
    invite = client.post("/v1/organizations/invitations", json={"email": "manager@example.com", "role": "bid_manager"})
    assert invite.status_code == 201, invite.text
    token = invite.json()["token"]

    _register(client, "manager@example.com", "Manager")
    accepted = client.post(f"/v1/organizations/invitations/{token}/accept")
    assert accepted.status_code == 204, accepted.text
    assert client.get("/v1/auth/profile").json()["role"] == "bid_manager"

    blocked = client.post("/v1/organizations/invitations", json={"email": "newadmin@example.com", "role": "admin"})
    assert blocked.status_code == 403

    allowed = client.post("/v1/organizations/invitations", json={"email": "reviewer@example.com", "role": "reviewer"})
    assert allowed.status_code == 201, allowed.text


def test_cannot_demote_last_admin_or_invite_existing_member(client, db):
    _register(client, "owner@example.com", "Owner")
    owner = db.query(User).filter(User.email == "owner@example.com").one()
    membership = db.query(Membership).filter(Membership.user_id == owner.id, Membership.organization_id == owner.active_organization_id).one()

    demote = client.put(f"/v1/organizations/members/{membership.id}/employee")
    assert demote.status_code == 409

    duplicate = client.post("/v1/organizations/invitations", json={"email": "owner@example.com", "role": "reviewer"})
    assert duplicate.status_code == 409
