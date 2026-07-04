from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import User
from schemas import DashboardResponse
from services.analytics_service import get_dashboard_stats
from tenant import active_organization_id

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("", response_model=DashboardResponse)
async def dashboard(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    return await get_dashboard_stats(active_organization_id(current_user), db)
