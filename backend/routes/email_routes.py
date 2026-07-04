from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import Notification, Tender, User
from schemas import NotificationResponse, SendEmailSchema
from services.email_service import build_notification_body
from services.job_service import process_notification
from tenant import active_organization_id


router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.post("/send", response_model=NotificationResponse, status_code=status.HTTP_202_ACCEPTED)
async def send_notification(
    payload: SendEmailSchema,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tender = (await db.execute(select(Tender).where(
        Tender.id == payload.tender_id, Tender.organization_id == active_organization_id(current_user)
    ))).scalar_one_or_none()
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")

    subject = f"BidWise AI - {payload.notification_type.replace('_', ' ').title()}"
    body = build_notification_body(payload.notification_type, tender.tender_name, tender.summary)
    notification = Notification(
        user_id=current_user.id,
        organization_id=active_organization_id(current_user),
        tender_id=payload.tender_id,
        subject=subject,
        body=body,
        status="queued",
    )
    db.add(notification)
    await db.commit()
    await db.refresh(notification)
    background_tasks.add_task(process_notification, notification.id, current_user.email)
    return notification


@router.get("", response_model=list[NotificationResponse])
async def list_notifications(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        (await db.execute(
            select(Notification)
            .where(Notification.organization_id == active_organization_id(current_user))
            .order_by(Notification.created_at.desc())
            .offset(offset)
            .limit(limit)
        )).scalars().all()
    )
