from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import Membership, Reminder, Tender, User
from schemas import ReminderCreate, ReminderResponse
from tenant import active_organization_id, current_membership

router = APIRouter(prefix="/reminders", tags=["Reminders"])

@router.get("", response_model=list[ReminderResponse])
async def list_reminders(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    return (await db.execute(select(Reminder).where(Reminder.organization_id == active_organization_id(current_user)).order_by(Reminder.remind_at))).scalars().all()

@router.post("", response_model=ReminderResponse, status_code=status.HTTP_201_CREATED)
async def create_reminder(payload: ReminderCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    org_id = active_organization_id(current_user)
    if (await current_membership(current_user, db)).role not in {"admin", "bid_manager"}: raise HTTPException(status_code=403, detail="Only admins and bid managers can schedule reminders")
    if not (await db.execute(select(Tender).where(
        Tender.id == payload.tender_id,
        or_(Tender.organization_id == org_id, and_(Tender.organization_id.is_(None), Tender.user_id == current_user.id)),
    ))).scalar_one_or_none(): raise HTTPException(status_code=404, detail="Tender not found")
    recipient = payload.recipient_user_id or current_user.id
    if not (await db.execute(select(Membership).where(Membership.user_id == recipient, Membership.organization_id == org_id))).scalar_one_or_none(): raise HTTPException(status_code=422, detail="Recipient is not an organization member")
    reminder = Reminder(organization_id=org_id, tender_id=payload.tender_id, created_by=current_user.id, recipient_user_id=recipient, remind_at=payload.remind_at, reminder_type=payload.reminder_type)
    db.add(reminder); await db.commit(); await db.refresh(reminder); return reminder

@router.delete("/{reminder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_reminder(reminder_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    reminder = (await db.execute(select(Reminder).where(Reminder.id == reminder_id, Reminder.organization_id == active_organization_id(current_user)))).scalar_one_or_none()
    if not reminder: raise HTTPException(status_code=404, detail="Reminder not found")
    reminder.status = "cancelled"; await db.commit()
