"""
Router for the published-model registry: publish a trained bundle and list
the signed-in user's published models. Thin HTTP layer — logic lives in
app.services.model_service.
"""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.core.auth import get_current_user
from app.schemas.model import ModelBundleResponse, ModelListResponse, PublishResponse
from app.services import model_service

router = APIRouter(prefix="/api/models", tags=["models"])


@router.get("", response_model=ModelListResponse)
def list_my_models(user: dict = Depends(get_current_user)):
    """Auth required — this list is scoped to the signed-in user's own published models."""
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in required.")
    rows = model_service.list_my_models(user["id"])
    return ModelListResponse(models=[ModelBundleResponse(**row) for row in rows])


@router.post("", response_model=PublishResponse)
def publish_model(
    file: UploadFile = File(...),
    name: str = Form(...),
    user: dict = Depends(get_current_user),
):
    """Auth required."""
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in required.")
    try:
        row = model_service.publish_model(
            file=file,
            name=name,
            user_id=user["id"],
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return PublishResponse(model=ModelBundleResponse(**row), message="Model published successfully.")


@router.delete("/{model_id}")
def delete_model(model_id: str, user: dict = Depends(get_current_user)):
    """Auth required — only the owner may delete their published model."""
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in required.")
    try:
        model_service.delete_model(model_id, user["id"])
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    return {"message": "Model deleted successfully."}
