import difflib
import json

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from dependencies import get_visible_tender
from models import ComplianceRequirement, KnowledgeItem, Proposal, TenderAddendum, User
from schemas import AddendumResponse, ComplianceRequirementResponse, ComplianceRequirementUpdate, DecisionSummary
from services.decision_service import apply_decision, enrich_requirements
from services.pdf_service import extract_text_from_pdf, save_uploaded_pdf
from tenant import active_organization_id


router = APIRouter(prefix="/tenders", tags=["Bid Decision Engine"])


@router.get("/{tender_id}/compliance", response_model=list[ComplianceRequirementResponse])
async def compliance(tender_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    tender = await get_visible_tender(tender_id, db, current_user)
    requirements = (await db.execute(select(ComplianceRequirement).where(ComplianceRequirement.tender_id == tender_id).order_by(ComplianceRequirement.is_mandatory.desc(), ComplianceRequirement.source_page))).scalars().all()
    knowledge = (await db.execute(select(KnowledgeItem).where(KnowledgeItem.organization_id == active_organization_id(current_user)))).scalars().all()
    enrich_requirements(requirements, knowledge)
    apply_decision(tender, requirements)
    return requirements


@router.put("/{tender_id}/compliance/{requirement_id}", response_model=ComplianceRequirementResponse)
async def update_compliance(tender_id: int, requirement_id: int, payload: ComplianceRequirementUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    tender = await get_visible_tender(tender_id, db, current_user)
    item = (await db.execute(select(ComplianceRequirement).where(ComplianceRequirement.id == requirement_id, ComplianceRequirement.tender_id == tender_id))).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Requirement not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value.strip() if isinstance(value, str) else value)
    requirements = (await db.execute(select(ComplianceRequirement).where(ComplianceRequirement.tender_id == tender_id))).scalars().all()
    knowledge = (await db.execute(select(KnowledgeItem).where(KnowledgeItem.organization_id == active_organization_id(current_user)))).scalars().all()
    enrich_requirements(requirements, knowledge)
    apply_decision(tender, requirements)
    await db.commit()
    await db.refresh(item)
    return item


@router.get("/{tender_id}/decision", response_model=DecisionSummary)
async def decision(tender_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    tender = await get_visible_tender(tender_id, db, current_user)
    requirements = (await db.execute(select(ComplianceRequirement).where(ComplianceRequirement.tender_id == tender_id))).scalars().all()
    knowledge = (await db.execute(select(KnowledgeItem).where(KnowledgeItem.organization_id == active_organization_id(current_user)))).scalars().all()
    enrich_requirements(requirements, knowledge)
    apply_decision(tender, requirements)
    ready = sum(item.status in {"ready", "not_applicable"} for item in requirements)
    blocked = sum(item.status == "blocked" or item.company_match == "gap" for item in requirements)
    proposal = (await db.execute(select(Proposal).where(Proposal.tender_id == tender_id))).scalar_one_or_none()
    coverage = round(ready / len(requirements) * 100, 1) if requirements and proposal else 0
    try:
        reasons = json.loads(tender.recommendation_reasons)
    except json.JSONDecodeError:
        reasons = [tender.recommendation_reasons] if tender.recommendation_reasons else []
    return DecisionSummary(
        overall_score=tender.bid_success_score,
        scores={"eligibility": tender.eligibility_score, "technical_fit": tender.technical_fit_score, "financial_fit": tender.financial_fit_score, "documentation_readiness": tender.documentation_score, "timeline_risk": tender.timeline_score},
        recommendation=tender.recommendation,
        reasons=reasons,
        estimated_effort_hours=tender.estimated_effort_hours,
        compliance_total=len(requirements), compliance_ready=ready, compliance_blocked=blocked, proposal_coverage=coverage,
    )


@router.get("/{tender_id}/document")
async def document(tender_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    tender = await get_visible_tender(tender_id, db, current_user)
    return FileResponse(tender.filepath, media_type="application/pdf", filename=tender.filename, content_disposition_type="inline")


@router.get("/{tender_id}/addenda", response_model=list[AddendumResponse])
async def list_addenda(tender_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    await get_visible_tender(tender_id, db, current_user)
    return (await db.execute(select(TenderAddendum).where(TenderAddendum.tender_id == tender_id).order_by(TenderAddendum.created_at.desc()))).scalars().all()


@router.post("/{tender_id}/addenda", response_model=AddendumResponse, status_code=status.HTTP_201_CREATED)
async def upload_addendum(tender_id: int, file: UploadFile = File(...), db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    tender = await get_visible_tender(tender_id, db, current_user)
    filepath, filename, _ = await save_uploaded_pdf(file, current_user.id)
    original = extract_text_from_pdf(tender.filepath)
    revised = extract_text_from_pdf(filepath)
    old_lines = [line.strip() for line in original.splitlines() if line.strip() and not line.startswith("[Page ")]
    new_lines = [line.strip() for line in revised.splitlines() if line.strip() and not line.startswith("[Page ")]
    changes = list(difflib.unified_diff(old_lines, new_lines, lineterm=""))
    meaningful = [line for line in changes if line.startswith(("+", "-")) and not line.startswith(("+++", "---"))][:300]
    added = sum(line.startswith("+") for line in meaningful)
    removed = sum(line.startswith("-") for line in meaningful)
    item = TenderAddendum(tender_id=tender.id, filename=filename, filepath=filepath, summary=f"Detected {added} added and {removed} removed text lines.", changes=json.dumps(meaningful))
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item
