from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
import re
import secrets
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from auth import create_access_token, create_password_reset_token, get_current_user, hash_password, verify_password, verify_password_reset_token
from config import ACCESS_TOKEN_EXPIRE_MINUTES, AUTH_COOKIE_NAME, COOKIE_SAMESITE, COOKIE_SECURE
from database import get_db
from models import Membership, Organization, User
from tenant import current_membership
from rate_limit import auth_limiter
from schemas import ForgotPasswordSchema, LoginSchema, ProfileUpdateSchema, RegisterSchema, ResetPasswordSchema, UserProfileSchema
from services.email_service import send_email


router = APIRouter(prefix="/auth", tags=["Authentication"])


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/",
    )


async def _profile_response(user: User, db: AsyncSession) -> dict:
    membership = await current_membership(user, db)
    organization = (await db.execute(select(Organization).where(Organization.id == membership.organization_id))).scalar_one()
    return {
        **UserProfileSchema.model_validate(user).model_dump(),
        "active_organization_id": membership.organization_id,
        "organization_name": organization.name,
        "role": membership.role,
    }


@router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordSchema, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.email == str(payload.email).lower()))).scalar_one_or_none()
    if not user:
        return {"message": "If an account exists with that email, a reset link has been sent"}
    token = create_password_reset_token(user)
    reset_link = f"{'http://localhost:3000'}/reset-password/{token}"
    sent = send_email(user.email, "BidWise AI - Password Reset", f"Reset your password here: {reset_link}\n\nThis link expires in 30 minutes.")
    if sent:
        return {"message": "If an account exists with that email, a reset link has been sent"}
    return {"message": "If an account exists with that email, a reset link has been sent", "reset_link": reset_link}


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordSchema, db: AsyncSession = Depends(get_db)):
    user_id, _email = verify_password_reset_token(payload.token)
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid reset token")
    user.password = hash_password(payload.password)
    await db.commit()
    return {"message": "Password reset successfully"}


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(
    payload: RegisterSchema,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    auth_limiter.check(request, "register")
    email = str(payload.email).lower()
    user = User(name=payload.name, email=email, password=hash_password(payload.password))
    db.add(user)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists")
    await db.refresh(user)
    base_name = f"{user.name}'s Company"
    slug = re.sub(r"[^a-z0-9]+", "-", base_name.lower()).strip("-") + f"-{secrets.token_hex(3)}"
    organization = Organization(name=base_name, slug=slug)
    db.add(organization)
    await db.flush()
    db.add(Membership(organization_id=organization.id, user_id=user.id, role="admin"))
    user.active_organization_id = organization.id
    await db.commit()
    await db.refresh(user)
    _set_session_cookie(response, create_access_token(user))
    return {"message": "User registered successfully", "user_id": user.id}


@router.post("/login")
async def login(
    payload: LoginSchema,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    auth_limiter.check(request, "login")
    user = (await db.execute(select(User).where(User.email == str(payload.email).lower()))).scalar_one_or_none()
    if not user or not verify_password(payload.password, user.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    _set_session_cookie(response, create_access_token(user))
    return {"message": "Signed in successfully"}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response):
    response.delete_cookie(
        AUTH_COOKIE_NAME,
        path="/",
        secure=COOKIE_SECURE,
        httponly=True,
        samesite=COOKIE_SAMESITE,
    )


@router.get("/profile", response_model=UserProfileSchema)
async def get_profile(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    return await _profile_response(current_user, db)


@router.put("/profile", response_model=UserProfileSchema)
async def update_profile(
    payload: ProfileUpdateSchema,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    for field, value in payload.model_dump(exclude_unset=True).items():
        if isinstance(value, str):
            value = value.strip()
        setattr(current_user, field, value)
    await db.commit()
    await db.refresh(current_user)
    return await _profile_response(current_user, db)
