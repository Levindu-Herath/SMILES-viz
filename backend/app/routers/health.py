"""
Health and readiness endpoints.
"""

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/api/health")
def health():
    return {"status": "ok"}

@router.get("/api/debug-config")
def debug_config():
    from app.core.config import settings
    secret = settings.SUPABASE_JWT_SECRET
    return {
        "secret_loaded": len(secret) > 0,
        "secret_length": len(secret),
        "first_5_chars": secret[:5] if secret else "EMPTY",
    }

@router.get("/api/debug-token-header")
def debug_token_header():
    from jose import jwt
    # Grab the token from the frontend console:
    # copy((await (await import('./lib/supabase')).supabase.auth.getSession()).data.session.access_token)
    token = "PASTE_TOKEN_HERE"
    header = jwt.get_unverified_header(token)
    return header