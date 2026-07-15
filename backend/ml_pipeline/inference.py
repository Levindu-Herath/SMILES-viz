"""
Molecular activity prediction pipeline.

Wraps the trained WL -> FDDL -> classifier pipeline from the sparsegraphs
submodule (backend/sparsegraphs), which already implements graph encoding,
sparse coding, and classification end to end via
`sparsegraphs.utils.inference.InferencePipeline`. This module just adds the
sys.path wiring needed to import that package, loads it once as a singleton,
and adapts its output to this API's shape.
"""

import sys
import threading
from pathlib import Path
from typing import Optional

from app.core.config import settings

SPARSEGRAPHS_DIR = settings.artifact_dir_path.parents[1]
if str(SPARSEGRAPHS_DIR) not in sys.path:
    sys.path.insert(0, str(SPARSEGRAPHS_DIR))


class MolecularActivityPredictor:
    """Loads the trained artifact bundle once and serves predictions from it."""

    def __init__(self, artifact_dir: Path):
        from utils.inference import InferencePipeline

        self._pipeline = InferencePipeline.from_dir(str(artifact_dir))
        self._apply_compat_patches()

    def _apply_compat_patches(self) -> None:
        """Patch attributes that scikit-learn versions no longer round-trip
        through pickle when the running version differs from the training
        version (the bundle was trained on a newer sklearn than is installable
        here). `multi_class` was dropped from LogisticRegression's pickled
        state; without it, predict_proba raises AttributeError. "auto" mirrors
        the effective behaviour for this binary classifier.
        """
        lr = self._pipeline.models.get("Logistic Regression")
        if lr is not None and not hasattr(lr, "multi_class"):
            lr.multi_class = "auto"

    @property
    def default_model(self) -> str:
        return self._pipeline.default_model

    def available_models(self) -> list[str]:
        return list(self._pipeline.models.keys())

    def threshold_for(self, model_name: str) -> float:
        return float(self._pipeline.thresholds.get(model_name, 0.5))

    def predict(self, smiles: str, model_name: Optional[str] = None) -> dict:
        """Run the full SMILES -> prediction pipeline.

        Returns {'smiles', 'model_name', 'prediction', 'prediction_label',
        'probability', 'threshold'}.
        """
        from rdkit import Chem

        smiles = smiles.strip()
        if not smiles:
            raise ValueError("SMILES string is empty.")
        if Chem.MolFromSmiles(smiles) is None:
            raise ValueError(f"Could not parse SMILES: {smiles!r}")

        model_name = model_name or self.default_model
        if model_name not in self._pipeline.models:
            raise ValueError(
                f"Unknown model '{model_name}'. Available: {sorted(self._pipeline.models)}"
            )

        result = self._pipeline.predict_smiles(smiles, model_name=model_name)

        return {
            "smiles": smiles,
            "model_name": result["model"],
            "prediction": "Active" if result["label"] == 1 else "Inactive",
            "prediction_label": result["label"],
            "probability": result["probability"],
            "threshold": result["threshold"],
        }


_predictor: Optional[MolecularActivityPredictor] = None
_predictor_lock = threading.Lock()


def get_predictor() -> MolecularActivityPredictor:
    """Singleton accessor — loads artifacts on first call only."""
    global _predictor
    if _predictor is None:
        with _predictor_lock:
            if _predictor is None:
                _predictor = MolecularActivityPredictor(settings.artifact_dir_path)
    return _predictor
