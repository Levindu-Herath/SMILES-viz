"""Smoke tests: every reference bundle loads from the sparsegraphs submodule
and produces a well-formed prediction, both directly and over HTTP."""

import pytest

from app.core.config import settings
from ml_pipeline.inference import get_predictor

ASPIRIN = "CC(=O)Oc1ccccc1C(=O)O"


@pytest.mark.parametrize("disease_id", settings.disease_ids())
def test_reference_bundle_loads_and_predicts(disease_id):
    result = get_predictor(disease_id).predict(ASPIRIN)

    assert result["prediction_label"] in (1, -1)
    assert 0.0 <= result["probability"] <= 1.0
    is_active = result["probability"] >= result["threshold"]
    assert (result["prediction"] == "Active") == is_active


def test_predict_endpoint(client):
    resp = client.post("/api/predict", json={"smiles": ASPIRIN})

    assert resp.status_code == 200
    body = resp.json()
    assert body["smiles"] == ASPIRIN
    assert 0.0 <= body["probability"] <= 1.0


def test_predict_rejects_invalid_smiles(client):
    resp = client.post("/api/predict", json={"smiles": "C(C"})

    assert resp.status_code == 422
