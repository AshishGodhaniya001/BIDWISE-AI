import json
import logging
from datetime import datetime, timezone

from sqlalchemy import and_, or_

from database import SyncSessionLocal
from models import Activity, ComplianceRequirement, KnowledgeItem, Notification, Proposal, ProposalVersion, Tender, User
from services.decision_service import apply_decision, enrich_requirements
from services.email_service import send_email
from services.gemini_service import QuotaExceededError, analyze_tender_pdf, generate_proposal, is_gemini_configured, local_analyze_tender_pdf, local_generate_proposal
from services.pdf_service import extract_text_from_pdf


logger = logging.getLogger("bidwise.jobs")


def _company_profile(user: User) -> dict:
    return {
        "company": user.company,
        "capabilities": user.capabilities,
        "certifications": user.certifications,
        "years_experience": user.years_experience,
        "annual_turnover": str(user.annual_turnover) if user.annual_turnover is not None else None,
    }


def process_tender_analysis(tender_id: int, user_id: int) -> None:
    db = SyncSessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return
        tender = db.query(Tender).filter(
            Tender.id == tender_id,
            or_(
                Tender.organization_id == user.active_organization_id,
                and_(Tender.organization_id.is_(None), Tender.user_id == user.id),
            ),
        ).first()
        if not tender:
            return
        tender.status = "extracting"
        tender.analysis_error = ""
        tender.analysis_started_at = datetime.now(timezone.utc)
        db.commit()

        text = extract_text_from_pdf(tender.filepath)
        if not text.strip():
            raise RuntimeError("No text could be extracted. Install OCR or upload a text-based PDF.")
        if not is_gemini_configured():
            tender.status = "needs_configuration"
            tender.analysis_error = "GEMINI_API_KEY is not configured"
            db.commit()
            return

        tender.status = "analyzing"
        db.commit()
        try:
            result = analyze_tender_pdf(text, _company_profile(user))
        except QuotaExceededError:
            logger.warning("Gemini quota unavailable; using local analysis for tender %s", tender_id)
            result = local_analyze_tender_pdf(text)
        tender.tender_name = result.tender_name or tender.tender_name
        tender.department = result.department
        tender.deadline = result.deadline
        tender.deadline_date = result.deadline_date
        tender.budget = result.budget
        tender.budget_amount = result.budget_amount
        tender.currency = result.currency.upper()
        tender.eligibility_criteria = result.eligibility_criteria
        tender.required_documents = result.required_documents
        tender.summary = result.summary
        tender.risk_analysis = result.risk_analysis
        tender.cost_estimation = result.cost_estimation
        tender.source_references = json.dumps([item.model_dump() for item in result.evidence])
        tender.analysis_confidence = result.confidence
        db.query(ComplianceRequirement).filter(ComplianceRequirement.tender_id == tender.id).delete()
        requirements = [ComplianceRequirement(
            tender_id=tender.id,
            requirement=item.requirement,
            category=item.category,
            is_mandatory=item.is_mandatory,
            source_page=item.source_page,
            source_quote=item.source_quote,
        ) for item in result.requirements]
        db.add_all(requirements)
        knowledge_org_id = tender.organization_id or user.active_organization_id
        knowledge = db.query(KnowledgeItem).filter(KnowledgeItem.organization_id == knowledge_org_id).all()
        enrich_requirements(requirements, knowledge)
        apply_decision(tender, requirements)
        tender.analysis_error = ""
        tender.status = "analyzed"
        tender.analysis_completed_at = datetime.now(timezone.utc)
        db.add(Activity(user_id=user_id, organization_id=knowledge_org_id, tender_id=tender.id, action="analyzed_tender", details=tender.tender_name))
        db.commit()
    except Exception as exc:
        db.rollback()
        tender = db.query(Tender).filter(Tender.id == tender_id).first()
        if tender:
            tender.status = "failed"
            tender.analysis_error = str(exc)[:1000]
            tender.analysis_completed_at = datetime.now(timezone.utc)
            db.commit()
        logger.exception("Tender analysis failed for %s", tender_id)
    finally:
        db.close()


def process_proposal_generation(proposal_id: int, user_id: int) -> None:
    db = SyncSessionLocal()
    try:
        proposal = db.query(Proposal).filter(Proposal.id == proposal_id).first()
        if not proposal:
            return
        tender = db.query(Tender).filter(Tender.id == proposal.tender_id).first()
        user = db.query(User).filter(User.id == user_id).first()
        if not tender or not user:
            raise RuntimeError("Tender or user no longer exists")
        if tender.status != "analyzed":
            raise RuntimeError("Tender analysis must complete before generating a proposal")
        if not is_gemini_configured():
            raise RuntimeError("GEMINI_API_KEY is not configured")

        tender_info = {
            "tender_name": tender.tender_name,
            "department": tender.department,
            "deadline": tender.deadline,
            "budget": tender.budget,
            "eligibility_criteria": tender.eligibility_criteria,
            "required_documents": tender.required_documents,
            "summary": tender.summary,
            "risk_analysis": tender.risk_analysis,
            "cost_estimation": tender.cost_estimation,
        }
        knowledge_org_id = tender.organization_id or user.active_organization_id
        knowledge = db.query(KnowledgeItem).filter(KnowledgeItem.organization_id == knowledge_org_id, KnowledgeItem.is_verified.is_(True)).all()
        requirements = db.query(ComplianceRequirement).filter(ComplianceRequirement.tender_id == tender.id).all()
        knowledge_data = [{"category": item.category, "title": item.title, "content": item.content, "reference": item.reference} for item in knowledge]
        requirement_data = [{"requirement": item.requirement, "status": item.status, "company_evidence": item.company_evidence} for item in requirements]
        try:
            result = generate_proposal(tender_info, _company_profile(user), knowledge_data, requirement_data)
        except QuotaExceededError:
            logger.warning("Gemini quota unavailable; using local proposal generation for tender %s", tender.id)
            result = local_generate_proposal(tender_info, _company_profile(user), knowledge_data, requirement_data)
        proposal.technical_proposal = result.technical_proposal
        proposal.cover_letter = result.cover_letter
        proposal.executive_summary = result.executive_summary
        proposal.scope_of_work = result.scope_of_work
        proposal.status = "generated"
        proposal.error = ""
        proposal.version += 1
        db.add(ProposalVersion(
            proposal_id=proposal.id,
            version=proposal.version,
            technical_proposal=result.technical_proposal,
            cover_letter=result.cover_letter,
            executive_summary=result.executive_summary,
            scope_of_work=result.scope_of_work,
        ))
        db.add(Activity(user_id=user_id, organization_id=knowledge_org_id, tender_id=tender.id, action="generated_proposal", details=tender.tender_name))
        db.commit()
    except Exception as exc:
        db.rollback()
        proposal = db.query(Proposal).filter(Proposal.id == proposal_id).first()
        if proposal:
            proposal.status = "failed"
            proposal.error = str(exc)[:1000]
            db.commit()
        logger.exception("Proposal generation failed for %s", proposal_id)
    finally:
        db.close()


def process_notification(notification_id: int, recipient: str) -> None:
    db = SyncSessionLocal()
    try:
        notification = db.query(Notification).filter(Notification.id == notification_id).first()
        if not notification:
            return
        sent = send_email(recipient, notification.subject, notification.body)
        notification.email_sent = sent
        notification.status = "sent" if sent else "failed"
        notification.error = "" if sent else "SMTP is not configured or delivery failed"
        db.commit()
    except Exception as exc:
        db.rollback()
        notification = db.query(Notification).filter(Notification.id == notification_id).first()
        if notification:
            notification.status = "failed"
            notification.error = str(exc)[:1000]
            db.commit()
        logger.exception("Notification delivery failed for %s", notification_id)
    finally:
        db.close()
