"""
Router for molecular activity prediction endpoints.
Thin HTTP layer — pipeline logic lives in ml_pipeline.inference.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import get_current_user
from app.core.config import settings
from app.schemas.prediction import (
    AvailableDiseasesResponse,
    AvailableModelsResponse,
    DiseaseInfo,
    HeatmapResponse,
    ModelInfo,
    PredictionRequest,
    PredictionResponse,
)
from app.services import model_service
from app.services.interpretability_service import compute_prediction_heatmap
from ml_pipeline.inference import get_predictor

router = APIRouter(prefix="/api/predict", tags=["prediction"])

# Held-out test metrics from the bundle's eval report (sparsegraphs/artifacts/.../eval).
# Reflects the default disease's bundle only — nothing calls GET /api/predict/models
# since the Analyze tab's model chooser was removed.
_MODEL_METRICS = {
    "Logistic Regression": {"accuracy": 0.9522, "roc_auc": 0.8518},
    "Gradient Boosting": {"accuracy": 0.9478, "roc_auc": 0.7925},
    "Linear SVM": {"accuracy": 0.9442, "roc_auc": 0.8510},
    "Random Forest": {"accuracy": 0.9527, "roc_auc": 0.8546},
}


def _resolve_predictor(model_id: str, disease_id: Optional[str] = None):
    """"reference" uses a built-in per-disease bundle; any other id is a
    published bundle (disease-agnostic)."""
    if model_id in (None, "reference"):
        try:
            return get_predictor(disease_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc))
    try:
        return model_service.get_predictor_for(model_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("", response_model=PredictionResponse)
def predict_activity(
    req: PredictionRequest,
    user: Optional[dict] = Depends(get_current_user),
):
    """Auth optional."""
    predictor = _resolve_predictor(req.model_id, req.disease)
    try:
        result = predictor.predict(req.smiles, req.model_name)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return result


@router.post("/heatmap", response_model=HeatmapResponse)
def predict_heatmap(
    req: PredictionRequest,
    user: Optional[dict] = Depends(get_current_user),
):
    """Auth optional. Per-atom importance heatmap explaining a prediction.

    Only available for the reference model — the interpretability pipeline is
    wired to its specific WL/FDDL artifacts, not to arbitrary published bundles.
    """
    if req.model_id not in (None, "reference"):
        raise HTTPException(
            status_code=400, detail="Heatmap is only available for the reference model."
        )
    try:
        result = compute_prediction_heatmap(req.smiles, req.model_name, req.disease)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return result


@router.get("/diseases", response_model=AvailableDiseasesResponse)
def list_diseases(user: Optional[dict] = Depends(get_current_user)):
    """Auth optional. Reference cancer types the Analyze tab can predict against."""
    return AvailableDiseasesResponse(
        diseases=[
            DiseaseInfo(id=d.id, label=d.label, nci_id=d.nci_id)
            for d in settings.reference_diseases()
        ],
        default_disease=settings.default_disease_id,
    )


@router.get("/models", response_model=AvailableModelsResponse)
def list_models(
    user: Optional[dict] = Depends(get_current_user),
):
    """Auth optional."""
    predictor = get_predictor()
    models = [
        ModelInfo(
            name=name,
            accuracy=_MODEL_METRICS.get(name, {}).get("accuracy", 0.0),
            roc_auc=_MODEL_METRICS.get(name, {}).get("roc_auc", 0.0),
            threshold=predictor.threshold_for(name),
        )
        for name in predictor.available_models()
    ]
    return AvailableModelsResponse(models=models, default_model=predictor.default_model)
