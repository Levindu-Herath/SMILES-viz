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
from app.services.interpretability_service import compute_prediction_heatmap
from ml_pipeline.inference import get_predictor

router = APIRouter(prefix="/api/predict", tags=["prediction"])

# Held-out test metrics from the bundle's eval report (sparsegraphs/artifacts/.../eval).
_MODEL_METRICS = {
    "Logistic Regression": {"accuracy": 0.7097, "roc_auc": 0.7783},
    "Gradient Boosting": {"accuracy": 0.7230, "roc_auc": 0.8046},
    "Linear SVM": {"accuracy": 0.7211, "roc_auc": 0.7989},
    "Random Forest": {"accuracy": 0.7381, "roc_auc": 0.8087},
}


@router.post("", response_model=PredictionResponse)
def predict_activity(
    req: PredictionRequest,
    user: Optional[dict] = Depends(get_current_user),
):
    """Auth optional."""
    try:
        result = get_predictor().predict(req.smiles, req.model_name)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return result


@router.post("/heatmap", response_model=HeatmapResponse)
def predict_heatmap(
    req: PredictionRequest,
    user: Optional[dict] = Depends(get_current_user),
):
    """Auth optional. Per-atom importance heatmap explaining a prediction."""
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
