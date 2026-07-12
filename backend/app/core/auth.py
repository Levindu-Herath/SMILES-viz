"""
Authentication dependency for FastAPI routes.
Verifies Supabase JWTs using the project's JWT secret.
No network call to Supabase — pure local signature verification.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.core.config import settings

security = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """
    Decode and verify the Supabase JWT from the Authorization header.

    Returns the token payload containing user info:
        - sub: user UUID
        - email: user email
        - role: "authenticated"
    """
    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing user identity",
        )

    return {
        "id": user_id,
        "email": payload.get("email", ""),
        "role": payload.get("role", ""),
    }
