"""
Router for molecular activity prediction endpoints.
Thin HTTP layer — pipeline logic lives in ml_pipeline.inference.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import get_current_user
from app.schemas.prediction import (
    AvailableModelsResponse,
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
_MODEL_METRICS = {
    "Logistic Regression": {"accuracy": 0.9522, "roc_auc": 0.8518},
    "Gradient Boosting": {"accuracy": 0.9478, "roc_auc": 0.7925},
    "Linear SVM": {"accuracy": 0.9442, "roc_auc": 0.8510},
    "Random Forest": {"accuracy": 0.9527, "roc_auc": 0.8546},
}


def _resolve_predictor(model_id: str):
    """"reference" (the default) uses the bundled model; any other id is a
    published bundle, resolved through the model registry."""
    if model_id in (None, "reference"):
        return get_predictor()
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
    predictor = _resolve_predictor(req.model_id)
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
        result = compute_prediction_heatmap(req.smiles, req.model_name)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return result


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
