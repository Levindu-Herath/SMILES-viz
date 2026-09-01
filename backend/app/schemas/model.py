"""
Pydantic schemas for the published-model registry (publish/list) endpoints.
"""

from typing import Optional

from pydantic import BaseModel


class ModelMetric(BaseModel):
    accuracy: Optional[float] = None
    roc_auc: Optional[float] = None


class ModelBundleResponse(BaseModel):
    id: str
    name: str
    dataset: Optional[str] = None
    implementation: Optional[str] = None
    default_model: str
    available_models: list[str]
    metrics: dict[str, ModelMetric]
    created_at: str


class ModelListResponse(BaseModel):
    models: list[ModelBundleResponse]


class PublishResponse(BaseModel):
    model: ModelBundleResponse
    message: str
