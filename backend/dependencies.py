from fastapi import Depends, HTTPException
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import Tender, User
from tenant import active_organization_id


def visible_tender_filter(user: User):
    org_id = active_organization_id(user)
    return or_(
        Tender.organization_id == org_id,
        and_(Tender.organization_id.is_(None), Tender.user_id == user.id),
    )


async def get_visible_tender(tender_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(
        select(Tender).where(Tender.id == tender_id, visible_tender_filter(current_user))
    )
    tender = result.scalar_one_or_none()
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")
    return tender
