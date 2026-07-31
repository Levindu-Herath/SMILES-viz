"""
Molecular activity prediction pipeline.

Wraps the trained WL -> FDDL -> classifier pipeline whose artifacts live in
the sparsegraphs submodule (backend/sparsegraphs). This module deliberately
does NOT go through `sparsegraphs.utils.artifact_store.load_bundle` /
`InferencePipeline`: that path resolves the dict learner class through
`utils.registry.get_dict_learner_class("FDDLGPU")`, which lazily imports
`dict_learners.fddl_gpu` -- and that module does `import torch` at module
scope. Torch is only needed there for the *training*-time FDDL-GPU dictionary
learning (tensor-based ISTA run on the GPU); at inference time all it does is
sparse-code a fixed, already-learned dictionary, which is a plain ISTA loop
over a numpy array. So this module loads the WL encoder (no torch dependency)
and the raw dictionary artifacts (`.npy`/`.json`, no torch dependency either)
directly, and re-implements just that ISTA loop in numpy -- mirroring
`FDDLGPU._soft_threshold` / `_step_size` / `infer()` step for step -- so the
backend can serve predictions without torch installed at all.

`sparsegraphs/` itself is a read-only submodule and is never modified.
"""

import json
import sys
import threading
from pathlib import Path
from typing import Optional

import joblib
import numpy as np

from app.core.config import settings

SPARSEGRAPHS_DIR = settings.artifact_dir_path.parents[1]
if str(SPARSEGRAPHS_DIR) not in sys.path:
    sys.path.insert(0, str(SPARSEGRAPHS_DIR))


class _NumpySparseCoder:
    """Torch-free re-implementation of FDDLGPU's inference-time ISTA coding.

    Loads the dictionary straight from `fddl_config.json` / `fddl_D.npy`
    (as written by `FDDLGPU.save`) instead of via `FDDLGPU.load`, so
    importing `dict_learners.fddl_gpu` -- and therefore torch -- is never
    triggered. The math is identical to `FDDLGPU.infer`: proximal gradient
    descent (ISTA) with soft-thresholding against the fixed dictionary `D`.
    """

    def __init__(self, D: np.ndarray, lambda1: float, lambda2: float, eta: float, ipm_iters: int):
        self.D = D.astype(np.float32)
        self.lambda1 = lambda1
        self.lambda2 = lambda2
        self.eta = eta
        self.ipm_iters = ipm_iters

    @classmethod
    def from_dir(cls, dirpath: Path) -> "_NumpySparseCoder":
        with open(dirpath / "fddl_config.json", encoding="utf-8") as f:
            config = json.load(f)
        D = np.load(dirpath / "fddl_D.npy")
        return cls(
            D=D,
            lambda1=config["lambda1"],
            lambda2=config["lambda2"],
            eta=config["eta"],
            ipm_iters=config["ipm_iters"],
        )

    @staticmethod
    def _soft_threshold(X: np.ndarray, tau: float) -> np.ndarray:
        return np.sign(X) * np.maximum(np.abs(X) - tau, 0.0)

    def _step_size(self, D: np.ndarray) -> float:
        spectral_norm = np.linalg.norm(D, ord=2)
        L = 2.0 * (spectral_norm**2) + 2.0 * self.lambda2 * (1.0 + self.eta)
        return 1.0 / (1.05 * L)

    def infer(self, embeddings: np.ndarray) -> np.ndarray:
        """embeddings: (n_samples, features) -> sparse codes (n_samples, atoms)."""
        A = embeddings.T.astype(np.float32)
        D = self.D
        Z = np.zeros((D.shape[1], A.shape[1]), dtype=np.float32)
        t = self._step_size(D)

        for _ in range(self.ipm_iters * 2):
            grad = -2 * D.T @ (A - D @ Z)
            Z = Z - t * grad
            Z = self._soft_threshold(Z, self.lambda1 * t)

        return Z.T

    @property
    def _dictionary(self) -> np.ndarray:
        """(n_atoms, n_features) view of D, matching AKSVD's `_dictionary`
        orientation -- interpretability code (WLAKSVDInterpreter) indexes the
        dictionary per-atom (`dictionary[atom_idx]`), but D here is stored
        (n_features, n_atoms) for the ISTA matmuls in infer()."""
        return self.D.T


class MolecularActivityPredictor:
    """Loads the trained artifact bundle once and serves predictions from it."""

    def __init__(self, artifact_dir: Path):
        from graph_encoders.wl import WL
        from utils.inference import smiles_to_graph

        self._smiles_to_graph = smiles_to_graph
        self._encoder = WL.load(str(artifact_dir / "encoder"))
        self._dict_learner = _NumpySparseCoder.from_dir(artifact_dir / "dict_learner")
        self._scaler = joblib.load(artifact_dir / "scaler.joblib")

        with open(artifact_dir / "manifest.json", encoding="utf-8") as f:
            manifest = json.load(f)
        self._default_model = manifest["default_model"]

        self._models = {
            name: joblib.load(artifact_dir / rel_path.replace("\\", "/"))
            for name, rel_path in manifest["models"].items()
        }

        with open(artifact_dir / "thresholds.json", encoding="utf-8") as f:
            self._thresholds = json.load(f)

        self._apply_compat_patches()

    def _apply_compat_patches(self) -> None:
        """Patch attributes that scikit-learn versions no longer round-trip
        through pickle when the running version differs from the training
        version (the bundle was trained on a newer sklearn than is installable
        here). `multi_class` was dropped from LogisticRegression's pickled
        state; without it, predict_proba raises AttributeError. "auto" mirrors
        the effective behaviour for this binary classifier.
        """
        lr = self._models.get("Logistic Regression")
        if lr is not None and not hasattr(lr, "multi_class"):
            lr.multi_class = "auto"

    @property
    def default_model(self) -> str:
        return self._default_model

    @property
    def encoder(self):
        return self._encoder

    @property
    def dict_learner(self):
        return self._dict_learner

    @property
    def scaler(self):
        return self._scaler

    def model_for(self, model_name: Optional[str] = None):
        return self._models[model_name or self._default_model]

    def graph_for(self, smiles: str):
        """Build the same networkx graph predict() feeds the encoder."""
        return self._smiles_to_graph(smiles.strip())

    def available_models(self) -> list[str]:
        return list(self._models.keys())

    def threshold_for(self, model_name: str) -> float:
        return float(self._thresholds.get(model_name, 0.5))

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

        model_name = model_name or self._default_model
        if model_name not in self._models:
            raise ValueError(
                f"Unknown model '{model_name}'. Available: {sorted(self._models)}"
            )

        graph = self._smiles_to_graph(smiles)
        embeddings = self._encoder.generate_inferencing_embeddings([graph])
        codes = self._dict_learner.infer(embeddings)
        X_scaled = self._scaler.transform(codes)

        model = self._models[model_name]
        proba = float(model.predict_proba(X_scaled)[:, 1][0])
        threshold = self.threshold_for(model_name)
        label = 1 if proba >= threshold else -1

        return {
            "smiles": smiles,
            "model_name": model_name,
            "prediction": "Active" if label == 1 else "Inactive",
            "prediction_label": label,
            "probability": proba,
            "threshold": threshold,
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
