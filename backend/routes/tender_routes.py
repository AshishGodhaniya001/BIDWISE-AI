from pathlib import Path
import io
import csv
from fastapi.responses import StreamingResponse
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from dependencies import visible_tender_filter
from models import Activity, Competitor, Notification, Proposal, Tender, TenderAddendum, User, ComplianceRequirement
from schemas import AnalyzeResponse, TenderListResponse, TenderResponse
from services.job_service import process_tender_analysis
from services.pdf_service import delete_uploaded_file, save_uploaded_pdf
from tenant import active_organization_id, require_roles


router = APIRouter(prefix="/tenders", tags=["Tenders"])


@router.post("/upload", response_model=TenderResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_tender(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _membership=Depends(require_roles("admin", "bid_manager")),
):
    filepath, original_name, _size = await save_uploaded_pdf(file, current_user.id)
    fallback_name = Path(original_name).stem.replace("_", " ").replace("-", " ").title()
    tender = Tender(
        user_id=current_user.id,
        organization_id=active_organization_id(current_user),
        filename=original_name,
        filepath=filepath,
        tender_name=fallback_name,
        status="queued",
    )
    db.add(tender)
    await db.flush()
    db.add(Activity(
        user_id=current_user.id,
        organization_id=active_organization_id(current_user),
        tender_id=tender.id,
        action="uploaded_tender",
        details=f"Uploaded {original_name}",
    ))
    await db.commit()
    await db.refresh(tender)
    background_tasks.add_task(process_tender_analysis, tender.id, current_user.id)
    return tender


@router.get("", response_model=list[TenderListResponse])
async def list_tenders(
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Tender)
        .where(visible_tender_filter(current_user))
        .order_by(Tender.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/{tender_id}", response_model=AnalyzeResponse)
async def get_tender(tender_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(
        select(Tender).where(Tender.id == tender_id, visible_tender_filter(current_user))
    )
    tender = result.scalar_one_or_none()
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")
    competitors_result = await db.execute(
        select(Competitor).where(Competitor.tender_id == tender_id)
    )
    competitors = competitors_result.scalars().all()
    return AnalyzeResponse(tender=tender, competitors=competitors)


@router.post("/{tender_id}/analyze", response_model=TenderResponse, status_code=status.HTTP_202_ACCEPTED)
async def retry_analysis(
    tender_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _membership=Depends(require_roles("admin", "bid_manager")),
):
    result = await db.execute(
        select(Tender).where(Tender.id == tender_id, visible_tender_filter(current_user))
    )
    tender = result.scalar_one_or_none()
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")
    if tender.status in {"queued", "extracting", "analyzing"}:
        raise HTTPException(status_code=409, detail="Analysis is already running")
    tender.status = "queued"
    tender.analysis_error = ""
    await db.commit()
    await db.refresh(tender)
    background_tasks.add_task(process_tender_analysis, tender.id, current_user.id)
    return tender


@router.post("/{tender_id}/favorite", response_model=TenderResponse)
async def toggle_favorite(tender_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(
        select(Tender).where(Tender.id == tender_id, visible_tender_filter(current_user))
    )
    tender = result.scalar_one_or_none()
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")
    tender.is_favorite = not tender.is_favorite
    action = "favorited_tender" if tender.is_favorite else "unfavorited_tender"
    db.add(Activity(user_id=current_user.id, organization_id=tender.organization_id or active_organization_id(current_user), tender_id=tender.id, action=action, details=tender.tender_name))
    await db.commit()
    await db.refresh(tender)
    return tender


@router.delete("/{tender_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tender(tender_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user), _membership=Depends(require_roles("admin", "bid_manager"))):
    result = await db.execute(
        select(Tender).where(Tender.id == tender_id, visible_tender_filter(current_user))
    )
    tender = result.scalar_one_or_none()
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")
    filepath = tender.filepath
    addendum_paths_result = await db.execute(
        select(TenderAddendum).where(TenderAddendum.tender_id == tender_id)
    )
    addendum_paths = [item.filepath for item in addendum_paths_result.scalars().all()]
    label = tender.tender_name or tender.filename
    await db.execute(update(Activity).where(Activity.tender_id == tender_id).values({Activity.tender_id: None}))
    await db.execute(update(Notification).where(Notification.tender_id == tender_id).values({Notification.tender_id: None}))
    await db.execute(delete(Competitor).where(Competitor.tender_id == tender_id))
    await db.execute(delete(Proposal).where(Proposal.tender_id == tender_id))
    await db.delete(tender)
    db.add(Activity(user_id=current_user.id, organization_id=tender.organization_id or active_organization_id(current_user), tender_id=None, action="deleted_tender", details=f"Deleted {label}"))
    await db.commit()
    delete_uploaded_file(filepath)
    for addendum_path in addendum_paths:
        delete_uploaded_file(addendum_path)


@router.get("/{tender_id}/compliance-matrix", response_class=StreamingResponse)
async def download_compliance_matrix(
    tender_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _membership=Depends(require_roles("admin", "bid_manager", "reviewer")),
):
    result = await db.execute(
        select(Tender).where(Tender.id == tender_id, visible_tender_filter(current_user))
    )
    tender = result.scalar_one_or_none()
    if not tender:
        raise HTTPException(status_code=404, detail="Tender not found")

    requirements_result = await db.execute(
        select(ComplianceRequirement)
        .where(ComplianceRequirement.tender_id == tender_id)
        .order_by(ComplianceRequirement.id)
    )
    requirements = requirements_result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "ID", "Category", "Requirement", "Is Mandatory", "Status", "Responsible",
        "Notes", "Company Match", "Company Evidence", "Missing Proof",
        "Source Page", "Source Quote",
    ])

    for req in requirements:
        writer.writerow([
            req.id, req.category, req.requirement, req.is_mandatory, req.status,
            req.responsible_employee, req.notes, req.company_match,
            req.company_evidence, req.missing_proof, req.source_page, req.source_quote,
        ])

    output.seek(0)
    response = StreamingResponse(iter([output.read()]), media_type="text/csv")
    response.headers["Content-Disposition"] = f"attachment; filename=compliance-matrix-{tender.id}.csv"
    return response
