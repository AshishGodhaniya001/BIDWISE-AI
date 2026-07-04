from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import Activity, User
from schemas import ActivityResponse
from tenant import active_organization_id

router = APIRouter(prefix="/activities", tags=["Activities"])


@router.get("", response_model=list[ActivityResponse])
async def list_activities(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        (await db.execute(
            select(Activity)
            .where(Activity.organization_id == active_organization_id(current_user))
            .order_by(Activity.created_at.desc())
            .offset(offset)
            .limit(limit)
        )).scalars().all()
    )
