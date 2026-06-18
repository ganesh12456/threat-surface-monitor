"""
app/routers/auth.py
Authentication endpoints: register, login, supabase-login, password reset, current user.
"""
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.config import settings
from app.core import supabase as db_service
from app.core.security import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.schemas.auth import (
    PasswordResetRequest,
    Token,
    UserCreate,
    UserLogin,
    UserResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Authentication"])


class SupabaseLoginRequest(BaseModel):
    access_token: str
    email: str
    full_name: str | None = None


@router.post(
    "/register",
    response_model=Token,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
)
async def register(
    body: UserCreate,
) -> Token:
    """
    Create a new user account and return a JWT access token.
    """
    # Check uniqueness
    existing = await db_service.get_user_by_email(body.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists.",
        )

    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    user_data = {
        "id": user_id,
        "email": body.email,
        "hashed_password": hash_password(body.password),
        "full_name": body.full_name,
        "role": body.role,
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    await db_service.create_user(user_data)

    token_data = {
        "sub": user_id,
        "email": body.email,
        "role": body.role,
        "is_active": True,
    }
    access_token = create_access_token(token_data)

    user_response = UserResponse(
        id=uuid.UUID(user_id),
        email=body.email,
        full_name=body.full_name,
        role=body.role,
        is_active=True,
        created_at=now,
        updated_at=now,
    )

    logger.info("New user registered: %s (%s)", body.email, body.role)

    return Token(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=user_response,
    )


@router.post(
    "/login",
    response_model=Token,
    summary="Authenticate and receive a JWT token",
)
async def login(
    body: UserLogin,
) -> Token:
    """
    Verify email/password credentials and return a JWT access token.
    """
    row = await db_service.get_user_by_email(body.email)

    # Use constant-time comparison to prevent timing attacks
    dummy_hash = "$2b$12$dummyhashforinvaliduserXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
    stored_hash = row["hashed_password"] if row else dummy_hash

    if not verify_password(body.password, stored_hash) or not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email address or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not row["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated.",
        )

    token_data = {
        "sub": str(row["id"]),
        "email": row["email"],
        "role": row["role"],
        "is_active": row["is_active"],
    }
    access_token = create_access_token(token_data)

    user_response = UserResponse(
        id=uuid.UUID(str(row["id"])),
        email=row["email"],
        full_name=row.get("full_name"),
        role=row["role"],
        is_active=row["is_active"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )

    logger.info("User logged in: %s", row["email"])

    return Token(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=user_response,
    )


@router.post(
    "/supabase-login",
    response_model=Token,
    summary="Login or register via Supabase OAuth (Google)",
)
async def supabase_login(
    body: SupabaseLoginRequest,
) -> Token:
    """
    Exchanges a Supabase token for a backend JWT and upserts the user record.
    """
    user_id = None
    email = body.email
    full_name = body.full_name

    # 1. Try verifying with Supabase if configured
    if settings.SUPABASE_URL and (settings.SUPABASE_SERVICE_KEY or settings.SUPABASE_PUBLISHABLE_KEY):
        try:
            from app.core.supabase import supabase
            if supabase:
                resp = supabase.auth.get_user(body.access_token)
                if resp and resp.user:
                    user_id = resp.user.id
                    email = resp.user.email
                    full_name = (
                        resp.user.user_metadata.get("full_name")
                        or resp.user.user_metadata.get("name")
                        or full_name
                    )
        except Exception as exc:
            logger.warning("Supabase token verification failed: %s. Using request details.", exc)

    # 2. Upsert the user locally (in supabase database or memory)
    row = await db_service.get_user_by_email(email)
    now = datetime.now(timezone.utc)

    if row:
        user_id = str(row["id"])
        user_role = row["role"]
        is_active = row["is_active"]
        db_name = row.get("full_name") or full_name
        created_at = row["created_at"]
        updated_at = row["updated_at"]
    else:
        if not user_id:
            user_id = str(uuid.uuid4())
        user_role = "viewer"
        is_active = True
        created_at = now
        updated_at = now
        db_name = full_name

        user_data = {
            "id": user_id,
            "email": email,
            "hashed_password": "social-login-placeholder",
            "full_name": full_name,
            "role": user_role,
            "is_active": is_active,
            "created_at": now,
            "updated_at": now,
        }
        await db_service.create_user(user_data)

    token_data = {
        "sub": user_id,
        "email": email,
        "role": user_role,
        "is_active": is_active,
    }
    access_token = create_access_token(token_data)

    user_response = UserResponse(
        id=uuid.UUID(user_id),
        email=email,
        full_name=db_name,
        role=user_role,
        is_active=is_active,
        created_at=created_at,
        updated_at=updated_at,
    )

    logger.info("User logged in via Google OAuth: %s", email)

    return Token(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=user_response,
    )


@router.post(
    "/reset-password",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Request a password reset email",
)
async def reset_password(
    body: PasswordResetRequest,
) -> dict:
    """
    Initiate a password reset flow.
    """
    # Check if user exists (for internal logging only)
    user = await db_service.get_user_by_email(body.email)
    if user:
        logger.info("Password reset requested for existing user: %s", body.email)
    else:
        logger.info("Password reset requested for non-existent email: %s", body.email)

    return {
        "message": "If an account with that email exists, a password reset link has been sent."
    }


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get the currently authenticated user",
)
async def get_me(
    current_user: dict = Depends(get_current_user),
) -> UserResponse:
    """
    Return the profile of the currently authenticated user.
    """
    row = await db_service.get_user_by_id(current_user["sub"])
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    return UserResponse(
        id=uuid.UUID(str(row["id"])),
        email=row["email"],
        full_name=row.get("full_name"),
        role=row["role"],
        is_active=row["is_active"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )

