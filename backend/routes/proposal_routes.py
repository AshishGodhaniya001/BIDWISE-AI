from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from dependencies import get_visible_tender
from models import Proposal, ProposalReviewComment, ProposalVersion, User
from schemas import ProposalResponse, ProposalReviewCommentResponse, ProposalReviewRequest, ProposalUpdateSchema, ProposalVersionResponse
from services.job_service import process_proposal_generation
from tenant import current_membership


class ProposalOrStatus(BaseModel):
    exists: bool = False
    proposal: ProposalResponse | None = None


router = APIRouter(prefix="/proposals", tags=["Proposals"])


@router.post("/generate/{tender_id}", response_model=ProposalResponse, status_code=status.HTTP_202_ACCEPTED)
async def generate(tender_id: int, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    tender = await get_visible_tender(tender_id, db, current_user)
    if (await current_membership(current_user, db)).role not in {"admin", "bid_manager"}: raise HTTPException(status_code=403, detail="Only admins and bid managers can generate proposals")
    if tender.status != "analyzed": raise HTTPException(status_code=409, detail="Complete tender analysis before generating a proposal")
    proposal = (await db.execute(select(Proposal).where(Proposal.tender_id == tender_id))).scalar_one_or_none()
    if proposal and proposal.status == "generating": raise HTTPException(status_code=409, detail="Proposal generation is already running")
    if not proposal:
        proposal = Proposal(tender_id=tender_id, user_id=current_user.id, status="generating", version=0, approval_status="draft")
        db.add(proposal)
    else:
        proposal.status = "generating"; proposal.error = ""; proposal.approval_status = "draft"
    await db.commit(); await db.refresh(proposal)
    background_tasks.add_task(process_proposal_generation, proposal.id, current_user.id)
    return proposal


@router.get("/{tender_id}", response_model=ProposalOrStatus)
async def get_proposal(tender_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    await get_visible_tender(tender_id, db, current_user)
    proposal = (await db.execute(select(Proposal).where(Proposal.tender_id == tender_id))).scalar_one_or_none()
    return ProposalOrStatus(exists=proposal is not None, proposal=proposal)


@router.put("/{tender_id}", response_model=ProposalResponse)
async def update_proposal(tender_id: int, payload: ProposalUpdateSchema, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    await get_visible_tender(tender_id, db, current_user)
    if (await current_membership(current_user, db)).role not in {"admin", "bid_manager"}: raise HTTPException(status_code=403, detail="Only admins and bid managers can edit proposals")
    proposal = (await db.execute(select(Proposal).where(Proposal.tender_id == tender_id))).scalar_one_or_none()
    if not proposal: raise HTTPException(status_code=404, detail="Proposal not found")
    next_version = proposal.version + 1
    for field, value in payload.model_dump().items(): setattr(proposal, field, value)
    proposal.status = "edited"; proposal.error = ""; proposal.version = next_version; proposal.approval_status = "draft"
    db.add(ProposalVersion(proposal_id=proposal.id, version=next_version, **payload.model_dump()))
    await db.commit(); await db.refresh(proposal)
    return proposal


@router.get("/{tender_id}/versions", response_model=list[ProposalVersionResponse])
async def proposal_versions(tender_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    await get_visible_tender(tender_id, db, current_user)
    proposal = (await db.execute(select(Proposal).where(Proposal.tender_id == tender_id))).scalar_one_or_none()
    if not proposal: raise HTTPException(status_code=404, detail="Proposal not found")
    return (await db.execute(select(ProposalVersion).where(ProposalVersion.proposal_id == proposal.id).order_by(ProposalVersion.version.desc()))).scalars().all()


@router.post("/{tender_id}/review", response_model=ProposalResponse)
async def review_proposal(tender_id: int, payload: ProposalReviewRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    await get_visible_tender(tender_id, db, current_user)
    proposal = (await db.execute(select(Proposal).where(Proposal.tender_id == tender_id))).scalar_one_or_none()
    if not proposal: raise HTTPException(status_code=404, detail="Proposal not found")
    role = (await current_membership(current_user, db)).role
    transitions = {
        "submit": ({"admin", "bid_manager"}, {"draft", "changes_requested"}, "in_review"),
        "approve": ({"admin", "reviewer"}, {"in_review"}, "approved"),
        "request_changes": ({"admin", "reviewer"}, {"in_review"}, "changes_requested"),
        "return_to_draft": ({"admin", "bid_manager"}, {"in_review", "changes_requested"}, "draft"),
    }
    roles, allowed_states, target = transitions[payload.action]
    if role not in roles: raise HTTPException(status_code=403, detail="Your role cannot perform this review action")
    if proposal.approval_status not in allowed_states: raise HTTPException(status_code=409, detail=f"Cannot {payload.action} from {proposal.approval_status}")
    now = datetime.now(timezone.utc); proposal.approval_status = target; proposal.review_comment = payload.comment
    if payload.action == "submit": proposal.submitted_by = current_user.id; proposal.submitted_at = now
    if payload.action in {"approve", "request_changes"}: proposal.reviewed_by = current_user.id; proposal.reviewed_at = now
    db.add(ProposalReviewComment(proposal_id=proposal.id, user_id=current_user.id, action=payload.action, comment=payload.comment))
    await db.commit(); await db.refresh(proposal)
    return proposal


@router.get("/{tender_id}/reviews", response_model=list[ProposalReviewCommentResponse])
async def review_history(tender_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    await get_visible_tender(tender_id, db, current_user)
    proposal = (await db.execute(select(Proposal).where(Proposal.tender_id == tender_id))).scalar_one_or_none()
    if not proposal: return []
    return (await db.execute(select(ProposalReviewComment).where(ProposalReviewComment.proposal_id == proposal.id).order_by(ProposalReviewComment.created_at.desc()))).scalars().all()
