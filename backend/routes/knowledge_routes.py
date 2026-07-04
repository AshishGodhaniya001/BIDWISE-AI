from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import ComplianceRequirement, KnowledgeItem, Tender, User
from schemas import KnowledgeItemCreate, KnowledgeItemResponse
from services.decision_service import apply_decision, enrich_requirements
from tenant import active_organization_id, require_roles


router = APIRouter(prefix="/knowledge", tags=["Company Knowledge Vault"])


async def _refresh_decisions(db: AsyncSession, organization_id: int, user_id: int) -> None:
    knowledge = (await db.execute(select(KnowledgeItem).where(KnowledgeItem.organization_id == organization_id))).scalars().all()
    for tender in (await db.execute(
        select(Tender).where(
            or_(
                Tender.organization_id == organization_id,
                and_(Tender.organization_id.is_(None), Tender.user_id == user_id),
            ),
            Tender.status == "analyzed",
        )
    )).scalars().all():
        requirements = (await db.execute(select(ComplianceRequirement).where(ComplianceRequirement.tender_id == tender.id))).scalars().all()
        enrich_requirements(requirements, knowledge)
        apply_decision(tender, requirements)


@router.get("", response_model=list[KnowledgeItemResponse])
async def list_items(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (await db.execute(select(KnowledgeItem).where(KnowledgeItem.organization_id == active_organization_id(current_user)).order_by(KnowledgeItem.updated_at.desc()).offset(offset).limit(limit))).scalars().all()


@router.post("", response_model=KnowledgeItemResponse, status_code=status.HTTP_201_CREATED)
async def create_item(payload: KnowledgeItemCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user), _membership=Depends(require_roles("admin", "bid_manager"))):
    org_id = active_organization_id(current_user)
    item = KnowledgeItem(user_id=current_user.id, organization_id=org_id, **payload.model_dump())
    db.add(item)
    await db.flush()
    await _refresh_decisions(db, org_id, current_user.id)
    await db.commit()
    await db.refresh(item)
    return item


@router.put("/{item_id}", response_model=KnowledgeItemResponse)
async def update_item(item_id: int, payload: KnowledgeItemCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user), _membership=Depends(require_roles("admin", "bid_manager"))):
    org_id = active_organization_id(current_user)
    item = (await db.execute(select(KnowledgeItem).where(KnowledgeItem.id == item_id, KnowledgeItem.organization_id == org_id))).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Knowledge item not found")
    for field, value in payload.model_dump().items():
        setattr(item, field, value)
    await _refresh_decisions(db, org_id, current_user.id)
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(item_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user), _membership=Depends(require_roles("admin", "bid_manager"))):
    org_id = active_organization_id(current_user)
    item = (await db.execute(select(KnowledgeItem).where(KnowledgeItem.id == item_id, KnowledgeItem.organization_id == org_id))).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Knowledge item not found")
    await db.delete(item)
    await db.flush()
    await _refresh_decisions(db, org_id, current_user.id)
    await db.commit()
