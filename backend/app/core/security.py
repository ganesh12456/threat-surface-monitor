"""
app/core/security.py
JWT creation/verification, password hashing, current-user dependency, and RBAC.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
import bcrypt

from app.core.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    """Return bcrypt hash of *password*."""
    pwd_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Return True if *plain* matches *hashed*."""
    try:
        if not hashed or hashed == "social-login-placeholder":
            return False
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception as exc:
        logger.error(f"Error verifying password: {exc}")
        return False


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

_bearer_scheme = HTTPBearer()


def create_access_token(data: dict[str, Any]) -> str:
    """
    Create a signed JWT access token.

    Args:
        data: Payload claims to encode (must include 'sub').

    Returns:
        Encoded JWT string.
    """
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def verify_token(token: str) -> dict[str, Any]:
    """
    Decode and verify a JWT token.

    Args:
        token: Raw JWT string.

    Returns:
        Decoded payload dict.

    Raises:
        HTTPException 401 if token is invalid or expired.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        if payload.get("sub") is None:
            raise credentials_exception
        return payload
    except JWTError as exc:
        logger.debug("JWT verification failed: %s", exc)
        raise credentials_exception


# ---------------------------------------------------------------------------
# FastAPI dependency — current user
# ---------------------------------------------------------------------------


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> dict[str, Any]:
    """
    FastAPI dependency that extracts and validates the Bearer token.

    Returns:
        Decoded JWT payload containing at minimum 'sub' (user id) and 'role'.
    """
    return verify_token(credentials.credentials)


async def get_current_active_user(
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Dependency that ensures the user is active (not soft-deleted)."""
    if not current_user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user account",
        )
    return current_user


# ---------------------------------------------------------------------------
# RBAC
# ---------------------------------------------------------------------------

ROLE_HIERARCHY: dict[str, int] = {
    "viewer": 1,
    "analyst": 2,
    "admin": 3,
}


class RoleChecker:
    """
    FastAPI dependency for role-based access control.

    Usage::

        @router.delete(
            "/{id}",
            dependencies=[Depends(RoleChecker(["admin"]))],
        )
    """

    def __init__(self, allowed_roles: list[str]) -> None:
        self.allowed_roles = allowed_roles

    def __call__(self, current_user: dict = Depends(get_current_user)) -> dict:
        user_role = current_user.get("role", "viewer")
        # Allow if user's role level >= any required role level
        required_level = min(
            ROLE_HIERARCHY.get(r, 99) for r in self.allowed_roles
        )
        if ROLE_HIERARCHY.get(user_role, 0) < required_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required role(s): {self.allowed_roles}",
            )
        return current_user
