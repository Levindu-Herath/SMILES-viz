"""
Request/response schemas for the activity prediction endpoints.
"""

from typing import Optional

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


class TopAtom(BaseModel):
    atom_idx: int
    element: str
    score: float
    percentage: float
    direction: str


class TopSubstructure(BaseModel):
    token: str
    description: str
    score: float
    percentage: float
    occurrences: int
    direction: str


class HeatmapResponse(BaseModel):
    smiles: str
    model_name: str
    prediction: str
    confidence: Optional[float]
    atom_heatmap_svg: str
    top_atoms: list[TopAtom]
    substructure_heatmap_svg: str
    top_substructures: list[TopSubstructure]
