import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import Membership, Organization, OrganizationInvitation, User
from schemas import InvitationCreate, InvitationPreview, InvitationResponse, MembershipResponse, OrganizationCreate, OrganizationResponse
from tenant import active_organization_id, current_membership, ensure_can_invite, require_roles, validate_role


router = APIRouter(prefix="/organizations", tags=["Organizations"])


def _slugify(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "company"
    return f"{base}-{secrets.token_hex(3)}"


async def _member_count(db: AsyncSession, organization_id: int) -> int:
    return (await db.execute(select(func.count(Membership.id)).where(Membership.organization_id == organization_id))).scalar_one()


def _membership_response(membership: Membership, user: User) -> dict:
    return {"id": membership.id, "user_id": user.id, "name": user.name, "email": user.email, "role": membership.role}


async def _admin_count(db: AsyncSession, organization_id: int) -> int:
    return (await db.execute(select(func.count(Membership.id)).where(Membership.organization_id == organization_id, Membership.role == "admin"))).scalar_one()


@router.get("", response_model=list[OrganizationResponse])
async def organizations(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = (
        (await db.execute(
            select(Membership, Organization)
            .join(Organization, Organization.id == Membership.organization_id)
            .where(Membership.user_id == current_user.id)
            .order_by(Organization.created_at.desc())
        )).all()
    )
    return [
        {"id": org.id, "name": org.name, "slug": org.slug, "plan": org.plan, "role": membership.role, "member_count": await _member_count(db, org.id)}
        for membership, org in rows
    ]


@router.post("", response_model=OrganizationResponse, status_code=status.HTTP_201_CREATED)
async def create_organization(payload: OrganizationCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    organization = Organization(name=payload.name, slug=_slugify(payload.name))
    db.add(organization)
    await db.flush()
    membership = Membership(organization_id=organization.id, user_id=current_user.id, role="admin")
    db.add(membership)
    current_user.active_organization_id = organization.id
    await db.commit()
    await db.refresh(organization)
    return {"id": organization.id, "name": organization.name, "slug": organization.slug, "plan": organization.plan, "role": "admin", "member_count": 1}


@router.post("/{organization_id}/switch", status_code=status.HTTP_204_NO_CONTENT)
async def switch(organization_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not (await db.execute(select(Membership).where(Membership.organization_id == organization_id, Membership.user_id == current_user.id))).scalar_one_or_none():
        raise HTTPException(status_code=403, detail="You are not a member of this organization")
    current_user.active_organization_id = organization_id
    await db.commit()


@router.get("/members", response_model=list[MembershipResponse])
async def members(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    role_order = {"admin": 0, "bid_manager": 1, "reviewer": 2, "employee": 3}
    rows = (
        (await db.execute(
            select(Membership, User)
            .join(User, User.id == Membership.user_id)
            .where(Membership.organization_id == active_organization_id(current_user))
        )).all()
    )
    rows.sort(key=lambda row: (role_order.get(row[0].role, 9), row[1].name.lower()))
    return [_membership_response(membership, user) for membership, user in rows]


@router.post("/invitations", response_model=InvitationResponse, status_code=status.HTTP_201_CREATED)
async def invite(payload: InvitationCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    actor = await current_membership(current_user, db)
    target_role = validate_role(payload.role)
    ensure_can_invite(actor.role, target_role)
    org_id = actor.organization_id
    email = str(payload.email).lower()

    existing_user = (await db.execute(select(User).where(func.lower(User.email) == email))).scalar_one_or_none()
    if existing_user and (await db.execute(select(Membership).where(Membership.organization_id == org_id, Membership.user_id == existing_user.id))).scalar_one_or_none():
        raise HTTPException(status_code=409, detail="This user is already a member of the active organization")

    pending = (
        (await db.execute(
            select(OrganizationInvitation)
            .where(OrganizationInvitation.organization_id == org_id, OrganizationInvitation.email == email, OrganizationInvitation.accepted_at.is_(None))
            .order_by(OrganizationInvitation.created_at.desc())
        )).scalar_one_or_none()
    )
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    if pending:
        pending.role = target_role
        pending.token = secrets.token_urlsafe(32)
        pending.invited_by = current_user.id
        pending.expires_at = expires_at
        await db.commit()
        await db.refresh(pending)
        return pending

    invitation = OrganizationInvitation(
        organization_id=org_id,
        email=email,
        role=target_role,
        token=secrets.token_urlsafe(32),
        invited_by=current_user.id,
        expires_at=expires_at,
    )
    db.add(invitation)
    await db.commit()
    await db.refresh(invitation)
    return invitation


@router.get("/invitations/{token}", response_model=InvitationPreview)
async def invitation_preview(token: str, db: AsyncSession = Depends(get_db)):
    invitation = (await db.execute(select(OrganizationInvitation).where(OrganizationInvitation.token == token, OrganizationInvitation.accepted_at.is_(None)))).scalar_one_or_none()
    if not invitation or invitation.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=404, detail="Invitation is invalid or expired")
    organization = (await db.execute(select(Organization).where(Organization.id == invitation.organization_id))).scalar_one()
    return {
        "email": invitation.email,
        "role": invitation.role,
        "organization_name": organization.name,
        "expires_at": invitation.expires_at,
    }


@router.post("/invitations/{token}/accept", status_code=status.HTTP_204_NO_CONTENT)
async def accept(token: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    invitation = (await db.execute(select(OrganizationInvitation).where(OrganizationInvitation.token == token, OrganizationInvitation.accepted_at.is_(None)))).scalar_one_or_none()
    if not invitation or invitation.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=404, detail="Invitation is invalid or expired")
    if invitation.email != current_user.email:
        raise HTTPException(status_code=403, detail="Invitation email does not match your account")
    membership = (await db.execute(select(Membership).where(Membership.organization_id == invitation.organization_id, Membership.user_id == current_user.id))).scalar_one_or_none()
    if not membership:
        db.add(Membership(organization_id=invitation.organization_id, user_id=current_user.id, role=invitation.role))
    invitation.accepted_at = datetime.now(timezone.utc)
    current_user.active_organization_id = invitation.organization_id
    await db.commit()


@router.put("/members/{membership_id}/{role}", response_model=MembershipResponse)
async def change_role(membership_id: int, role: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user), _membership=Depends(require_roles("admin"))):
    role = validate_role(role)
    org_id = active_organization_id(current_user)
    membership = (await db.execute(select(Membership).where(Membership.id == membership_id, Membership.organization_id == org_id))).scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=404, detail="Member not found")
    if membership.role == "admin" and role != "admin" and (await _admin_count(db, org_id)) <= 1:
        raise HTTPException(status_code=409, detail="Every organization must keep at least one admin")
    membership.role = role
    await db.commit()
    await db.refresh(membership)
    user = (await db.execute(select(User).where(User.id == membership.user_id))).scalar_one()
    return _membership_response(membership, user)


@router.delete("/members/{membership_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(membership_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user), _membership=Depends(require_roles("admin"))):
    org_id = active_organization_id(current_user)
    membership = (await db.execute(select(Membership).where(Membership.id == membership_id, Membership.organization_id == org_id))).scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=404, detail="Member not found")
    if membership.role == "admin" and (await _admin_count(db, org_id)) <= 1:
        raise HTTPException(status_code=409, detail="Every organization must keep at least one admin")
    user = (await db.execute(select(User).where(User.id == membership.user_id))).scalar_one()
    await db.delete(membership)
    if user.active_organization_id == org_id:
        replacement = (await db.execute(select(Membership).where(Membership.user_id == user.id, Membership.id != membership_id).order_by(Membership.id))).scalar_one_or_none()
        user.active_organization_id = replacement.organization_id if replacement else None
    await db.commit()
