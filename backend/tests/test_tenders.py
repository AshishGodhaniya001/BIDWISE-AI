import io
from pathlib import Path

from pypdf import PdfWriter

from models import Proposal, Tender, User
from routes import tender_routes

from .conftest import register


def _pdf_bytes() -> bytes:
    output = io.BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    writer.write(output)
    return output.getvalue()


def test_upload_is_validated_and_filename_is_not_used_for_storage(authenticated_client, monkeypatch):
    monkeypatch.setattr(tender_routes, "process_tender_analysis", lambda *_args: None)
    response = authenticated_client.post(
        "/v1/tenders/upload",
        files={"file": ("../../unsafe name.pdf", _pdf_bytes(), "application/pdf")},
    )
    assert response.status_code == 202, response.text
    tender_id = response.json()["id"]
    detail = authenticated_client.get(f"/v1/tenders/{tender_id}").json()["tender"]
    assert detail["filename"] == "unsafe name.pdf"


def test_upload_rejects_fake_pdf(authenticated_client):
    response = authenticated_client.post(
        "/v1/tenders/upload",
        files={"file": ("fake.pdf", b"not actually a pdf", "application/pdf")},
    )
    assert response.status_code == 400


def test_tenders_are_tenant_isolated(client, db):
    register(client, "first@example.com")
    first = db.query(User).filter(User.email == "first@example.com").one()
    tender = Tender(user_id=first.id, filename="one.pdf", filepath="missing.pdf", tender_name="Private")
    db.add(tender)
    db.commit()
    tender_id = tender.id
    client.post("/v1/auth/logout")
    register(client, "second@example.com")
    assert client.get(f"/v1/tenders/{tender_id}").status_code == 404


def test_failed_proposal_can_be_retried(authenticated_client, db, monkeypatch):
    user = db.query(User).filter(User.email == "owner@example.com").one()
    tender = Tender(
        user_id=user.id,
        filename="one.pdf",
        filepath="missing.pdf",
        tender_name="Analyzed tender",
        status="analyzed",
    )
    db.add(tender)
    db.flush()
    proposal = Proposal(tender_id=tender.id, user_id=user.id, status="failed", error="quota")
    db.add(proposal)
    db.commit()
    monkeypatch.setattr("backend.routes.proposal_routes.process_proposal_generation", lambda *_args: None)
    response = authenticated_client.post(f"/v1/proposals/generate/{tender.id}")
    assert response.status_code == 202
    assert response.json()["status"] == "generating"


def test_delete_removes_file_and_proposal(authenticated_client, db, tmp_path: Path):
    user = db.query(User).filter(User.email == "owner@example.com").one()
    upload_root = Path(tender_routes.delete_uploaded_file.__globals__["UPLOAD_DIR"])
    user_dir = upload_root / str(user.id)
    user_dir.mkdir(parents=True, exist_ok=True)
    uploaded = user_dir / "delete-me.pdf"
    uploaded.write_bytes(_pdf_bytes())
    tender = Tender(user_id=user.id, filename="delete.pdf", filepath=str(uploaded), tender_name="Delete")
    db.add(tender)
    db.flush()
    db.add(Proposal(tender_id=tender.id, user_id=user.id, status="draft"))
    db.commit()
    tender_id = tender.id

    response = authenticated_client.delete(f"/v1/tenders/{tender_id}")
    assert response.status_code == 204
    assert not uploaded.exists()
    assert db.query(Proposal).filter(Proposal.tender_id == tender_id).count() == 0
