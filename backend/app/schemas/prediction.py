"""
Request/response schemas for the activity prediction endpoints.
"""

from pydantic import BaseModel


class PredictionRequest(BaseModel):
    smiles: str
    model_name: str = "Logistic Regression"


class PredictionResponse(BaseModel):
    smiles: str
    model_name: str
    prediction: str
    prediction_label: int
    probability: float
    threshold: float


class ModelInfo(BaseModel):
    name: str
    accuracy: float
    roc_auc: float
    threshold: float


class AvailableModelsResponse(BaseModel):
    models: list[ModelInfo]
    default_model: str
