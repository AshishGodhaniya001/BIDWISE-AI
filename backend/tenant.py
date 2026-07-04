from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import Membership, User


ROLES = {"admin", "bid_manager", "reviewer", "employee"}
INVITABLE_BY_ROLE = {
    "admin": ROLES,
    "bid_manager": {"reviewer", "employee"},
    "reviewer": set(),
    "employee": set(),
}


def active_organization_id(user: User) -> int:
    if not user.active_organization_id:
        raise HTTPException(status_code=403, detail="Select an organization before continuing")
    return user.active_organization_id


async def current_membership(user: User, db: AsyncSession) -> Membership:
    if not user.active_organization_id:
        result = await db.execute(select(Membership).where(Membership.user_id == user.id).order_by(Membership.id))
        membership = result.scalar_one_or_none()
        if membership:
            user.active_organization_id = membership.organization_id
            await db.flush()
            return membership
    result = await db.execute(select(Membership).where(Membership.user_id == user.id, Membership.organization_id == active_organization_id(user)))
    membership = result.scalar_one_or_none()
    if not membership:
        raise HTTPException(status_code=403, detail="You are not a member of the active organization")
    return membership


def validate_role(role: str) -> str:
    if role not in ROLES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid role")
    return role


def ensure_can_invite(actor_role: str, target_role: str) -> None:
    validate_role(target_role)
    if target_role not in INVITABLE_BY_ROLE.get(actor_role, set()):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"{actor_role.replace('_', ' ').title()} cannot invite {target_role.replace('_', ' ')} users")


def require_roles(*allowed: str):
    async def dependency(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> Membership:
        membership = await current_membership(current_user, db)
        if membership.role not in allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"This action requires one of these roles: {', '.join(allowed)}")
        return membership
    return dependency
