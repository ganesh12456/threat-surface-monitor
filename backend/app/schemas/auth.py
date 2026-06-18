"""
app/schemas/auth.py
Pydantic v2 schemas for authentication endpoints.
"""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    """Request body for user registration."""

    email: EmailStr
    password: str = Field(..., min_length=8, description="Minimum 8 characters")
    full_name: str | None = None
    role: str = Field(default="viewer", pattern="^(admin|analyst|viewer)$")


class UserLogin(BaseModel):
    """Request body for user login."""

    email: EmailStr
    password: str


class UserResponse(BaseModel):
    """Public representation of a user (no password)."""

    id: UUID
    email: EmailStr
    full_name: str | None = None
    role: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class Token(BaseModel):
    """JWT token response."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds
    user: UserResponse


class TokenData(BaseModel):
    """Claims embedded in a JWT token."""

    sub: str  # user id
    email: str
    role: str
    is_active: bool = True


class PasswordResetRequest(BaseModel):
    """Request body for initiating a password reset."""

    email: EmailStr


class PasswordResetConfirm(BaseModel):
    """Request body for confirming a password reset with token."""

    token: str
    new_password: str = Field(..., min_length=8)
