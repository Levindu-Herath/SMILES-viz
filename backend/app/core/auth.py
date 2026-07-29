"""
Authentication dependency for FastAPI routes.
Verifies Supabase JWTs against Supabase's published JWKS.

Supabase's newer "JWT Signing Keys" sign access tokens with an
asymmetric algorithm (ES256) and a rotating key identified by `kid`,
rather than the legacy static HS256 secret. We fetch and cache the
JWKS from Supabase and verify each token against the matching key.
"""

import json
import time
import urllib.request
from urllib.error import URLError

from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.core.config import settings

# auto_error=False so requests without an Authorization header are let through
# (as unauthenticated) instead of FastAPI raising a 403 before we even get a look.
security = HTTPBearer(auto_error=False)

_JWKS_CACHE_TTL_SECONDS = 3600
_jwks_cache: dict = {"keys": [], "fetched_at": 0.0}


def _fetch_jwks() -> list[dict]:
    url = f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json"
    with urllib.request.urlopen(url, timeout=5) as response:
        return json.loads(response.read())["keys"]


def _get_jwks(force_refresh: bool = False) -> list[dict]:
    now = time.time()
    if not force_refresh and _jwks_cache["keys"] and now - _jwks_cache["fetched_at"] < _JWKS_CACHE_TTL_SECONDS:
        return _jwks_cache["keys"]

    try:
        keys = _fetch_jwks()
    except (URLError, ValueError, KeyError):
        if _jwks_cache["keys"]:
            return _jwks_cache["keys"]
        raise

    _jwks_cache["keys"] = keys
    _jwks_cache["fetched_at"] = now
    return keys


def _get_signing_key(kid: str) -> dict:
    for key in _get_jwks():
        if key.get("kid") == kid:
            return key

    # Key not found — could be a recent rotation, so force one refresh.
    for key in _get_jwks(force_refresh=True):
        if key.get("kid") == kid:
            return key

    raise JWTError(f"No matching signing key for kid={kid}")


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[dict]:
    """
    Decode and verify the Supabase JWT from the Authorization header, if present.

    Auth is optional: requests with no (or an invalid) token are treated as
    unauthenticated rather than rejected. Returns the token payload containing
    user info when a valid token is present:
        - sub: user UUID
        - email: user email
        - role: "authenticated"
    Returns None when there is no credentials/token.
    """
    if credentials is None:
        return None

    token = credentials.credentials

    try:
        header = jwt.get_unverified_header(token)
        signing_key = _get_signing_key(header["kid"])
        payload = jwt.decode(
            token,
            signing_key,
            algorithms=[signing_key["alg"]],
            options={"verify_aud": False},
        )
    except (JWTError, KeyError) as e:
        print(f"JWT ERROR: {e}")
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
