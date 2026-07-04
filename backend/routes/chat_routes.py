import json

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from dependencies import get_visible_tender
from models import TenderChatMessage, User
from schemas import TenderChatRequest, TenderChatResponse
from services.chat_service import answer_question
from services.pdf_service import extract_text_from_pdf
from tenant import active_organization_id


router = APIRouter(prefix="/tenders", tags=["Tender Assistant"])


@router.get("/{tender_id}/chat", response_model=list[TenderChatResponse])
async def history(tender_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    await get_visible_tender(tender_id, db, current_user)
    org_id = active_organization_id(current_user)
    return (await db.execute(select(TenderChatMessage).where(TenderChatMessage.tender_id == tender_id, TenderChatMessage.organization_id == org_id).order_by(TenderChatMessage.created_at).limit(100))).scalars().all()


@router.post("/{tender_id}/chat", response_model=TenderChatResponse)
async def ask(tender_id: int, payload: TenderChatRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    tender = await get_visible_tender(tender_id, db, current_user)
    answer, citations = answer_question(payload.question, extract_text_from_pdf(tender.filepath))
    org_id = active_organization_id(current_user)
    message = TenderChatMessage(organization_id=org_id, tender_id=tender_id, user_id=current_user.id, question=payload.question, answer=answer, citations=json.dumps(citations))
    db.add(message); await db.commit(); await db.refresh(message)
    return message
