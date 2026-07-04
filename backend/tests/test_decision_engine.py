from models import ComplianceRequirement, Tender, User


def test_knowledge_vault_recalculates_explainable_decision(authenticated_client, db):
    user = db.query(User).filter(User.email == "owner@example.com").one()
    tender = Tender(user_id=user.id, filename="decision.pdf", filepath="missing.pdf", tender_name="Decision", status="analyzed")
    db.add(tender)
    db.flush()
    db.add(ComplianceRequirement(
        tender_id=tender.id,
        requirement="Bidder must hold an ISO 9001 quality certificate",
        category="eligibility",
        is_mandatory=True,
        source_page=3,
        source_quote="must hold an ISO 9001 quality certificate",
    ))
    db.commit()

    response = authenticated_client.post("/v1/knowledge", json={
        "category": "certificate",
        "title": "ISO 9001 Certificate",
        "content": "Company holds a valid ISO 9001 quality certificate",
        "reference": "certificate-001",
        "expires_on": None,
        "is_verified": True,
    })
    assert response.status_code == 201, response.text
    matrix = authenticated_client.get(f"/v1/tenders/{tender.id}/compliance").json()
    assert matrix[0]["company_match"] == "match"
    decision = authenticated_client.get(f"/v1/tenders/{tender.id}/decision").json()
    assert decision["scores"]["eligibility"] == 100
    assert decision["recommendation"] == "GO"


def test_compliance_workflow_tracks_owner_and_readiness(authenticated_client, db):
    user = db.query(User).filter(User.email == "owner@example.com").one()
    tender = Tender(user_id=user.id, filename="work.pdf", filepath="missing.pdf", tender_name="Work", status="analyzed")
    db.add(tender)
    db.flush()
    item = ComplianceRequirement(tender_id=tender.id, requirement="Submit project plan", category="document")
    db.add(item)
    db.commit()
    response = authenticated_client.put(f"/v1/tenders/{tender.id}/compliance/{item.id}", json={"responsible_employee": "Asha", "status": "ready"})
    assert response.status_code == 200, response.text
    assert response.json()["responsible_employee"] == "Asha"
    assert response.json()["status"] == "ready"


def test_empty_vault_means_review_not_proven_failure(authenticated_client, db):
    user = db.query(User).filter(User.email == "owner@example.com").one()
    tender = Tender(user_id=user.id, filename="unknown.pdf", filepath="missing.pdf", tender_name="Unknown", status="analyzed")
    db.add(tender)
    db.flush()
    db.add(ComplianceRequirement(tender_id=tender.id, requirement="Bidder must hold ISO 27001", category="eligibility", is_mandatory=True, company_match="gap"))
    db.commit()
    matrix = authenticated_client.get(f"/v1/tenders/{tender.id}/compliance").json()
    decision = authenticated_client.get(f"/v1/tenders/{tender.id}/decision").json()
    assert matrix[0]["company_match"] == "unknown"
    assert decision["recommendation"] == "REVIEW"
    assert decision["overall_score"] is None
