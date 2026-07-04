from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import ComplianceRequirement, Membership, Proposal, Tender


def _format_inr(amount: Decimal) -> str:
    if amount >= Decimal("10000000"):
        return f"₹{amount / Decimal('10000000'):.1f}Cr"
    if amount >= Decimal("100000"):
        return f"₹{amount / Decimal('100000'):.1f}L"
    return f"₹{amount:,.0f}"


async def get_dashboard_stats(organization_id: int, db: AsyncSession) -> dict[str, Any]:
    tenders_result = await db.execute(
        select(Tender).where(Tender.organization_id == organization_id)
    )
    tenders = tenders_result.scalars().all()

    scores = [t.bid_success_score for t in tenders if t.bid_success_score is not None]
    total_revenue = sum(
        (Decimal(t.budget_amount) for t in tenders if t.budget_amount is not None),
        Decimal("0"),
    )
    recent = sorted(tenders, key=lambda tender: tender.created_at or datetime.min.replace(tzinfo=timezone.utc), reverse=True)[:5]
    upcoming = sorted(
        [tender for tender in tenders if tender.deadline_date and tender.deadline_date >= date.today()],
        key=lambda tender: tender.deadline_date,
    )[:5]

    blocked = (
        await db.execute(
            select(func.count(ComplianceRequirement.id))
            .join(Tender, Tender.id == ComplianceRequirement.tender_id)
            .where(Tender.organization_id == organization_id, ComplianceRequirement.status == "blocked")
        )
    ).scalar_one()

    pending = (
        await db.execute(
            select(func.count(Proposal.id))
            .join(Tender, Tender.id == Proposal.tender_id)
            .where(Tender.organization_id == organization_id, Proposal.approval_status == "in_review")
        )
    ).scalar_one()

    team = (
        await db.execute(
            select(func.count(Membership.id))
            .where(Membership.organization_id == organization_id)
        )
    ).scalar_one()

    return {
        "total_tenders": len(tenders),
        "active_bids": sum(1 for tender in tenders if tender.status in {"queued", "extracting", "analyzing", "analyzed"}),
        "avg_success_score": round(sum(scores) / len(scores), 1) if scores else None,
        "total_revenue_opportunity": _format_inr(total_revenue) if total_revenue else "N/A",
        "upcoming_deadlines": upcoming,
        "recent_tenders": recent,
        "blocked_requirements": blocked,
        "pending_approvals": pending,
        "team_members": team,
    }
