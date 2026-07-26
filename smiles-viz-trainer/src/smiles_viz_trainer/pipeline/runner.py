"""
Training pipeline runner.
Orchestrates: dataset loading → graph conversion → WL encoding → FDDL → scaling → classifier → evaluation → save bundle.
"""

import time
from pathlib import Path
from typing import Callable, Optional

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import MaxAbsScaler

from smiles_viz_trainer.pipeline.graph_utils import smiles_to_graph
from smiles_viz_trainer.pipeline.wl import WL
from smiles_viz_trainer.pipeline.fddl_gpu import FDDLGPU
from smiles_viz_trainer.pipeline.evaluator import Evaluator
from smiles_viz_trainer.pipeline.seeding import seed_everything
from smiles_viz_trainer.pipeline.artifact_store import save_bundle
from smiles_viz_trainer.server.schemas.training import TrainingStage

# Split proportions — same as sparsegraphs export pipeline
TEST_SIZE = 0.15
VAL_SIZE_OF_REMAINDER = 0.15 / 0.85
VOCAB_ML_RATIO = 2 / 7

# Maps user-facing classifier names to what Evaluator expects
CLASSIFIER_MAP = {
    "logistic_regression": "predict_logistic_regression",
    "gradient_boosting": "predict_gradient_boosting",
    "linear_svm": "predict_svm",
    "random_forest": "predict_random_forest",
}


def run_training(
    file_path: str,
    smiles_column: str,
    target_column: str,
    classifier: str,
    output_dir: str,
    progress_callback: Optional[Callable] = None,
    seed: int = 42,
    wl_params: Optional[dict] = None,
    fddl_params: Optional[dict] = None,
) -> dict:
    """
    Run the full training pipeline.

    progress_callback signature: (stage: TrainingStage, progress: float, stage_progress: float, message: str) -> None

    Returns a dict with: output_path, metrics, total_molecules, valid_molecules, training_duration_seconds, classifier
    """
    start_time = time.time()

    def update(stage, progress, stage_progress, message):
        if progress_callback:
            progress_callback(stage, progress, stage_progress, message)

    # --- Stage 1: VALIDATING (loading + converting dataset) ---
    update(TrainingStage.VALIDATING, 0.0, 0.0, "Loading dataset...")

    df = pd.read_csv(file_path)
    smiles_list = df[smiles_column].tolist()

    # Convert labels to numpy array
    labels_raw = df[target_column].tolist()
    unique_labels = sorted(set(labels_raw))
    if len(unique_labels) != 2:
        raise ValueError(f"Expected binary classification (2 classes), got {len(unique_labels)}: {unique_labels}")

    # Always map to -1/1 for the WL encoder
    # Convert to numeric first if strings
    try:
        numeric_labels = [float(l) for l in labels_raw]
        unique_numeric = sorted(set(numeric_labels))
        # Map smaller value to -1, larger to 1
        label_map = {unique_numeric[0]: -1, unique_numeric[1]: 1}
        labels = np.array([label_map[l] for l in numeric_labels], dtype=int)
    except (ValueError, TypeError):
        # String labels - map alphabetically first to -1, second to 1
        label_map = {unique_labels[0]: -1, unique_labels[1]: 1}
        labels = np.array([label_map[l] for l in labels_raw], dtype=int)

    # Convert SMILES to graphs, skip invalid ones
    graphs = []
    valid_labels = []
    total_molecules = len(smiles_list)

    for i, smi in enumerate(smiles_list):
        if i % 50 == 0:
            stage_prog = i / total_molecules
            update(TrainingStage.VALIDATING, 0.05 * stage_prog, stage_prog, f"Converting molecule {i+1}/{total_molecules}")
        try:
            g = smiles_to_graph(str(smi))
            graphs.append(g)
            valid_labels.append(labels[i])
        except (ValueError, Exception):
            continue

    valid_molecules = len(graphs)
    y = np.array(valid_labels)

    if valid_molecules < 20:
        raise ValueError(f"Only {valid_molecules} valid molecules found. Need at least 20 for training.")

    update(TrainingStage.VALIDATING, 0.05, 1.0, f"Dataset loaded: {valid_molecules}/{total_molecules} valid molecules")

    # --- Split ---
    seed_everything(seed)
    G_train_full, G_test, y_train_full, y_test = train_test_split(
        graphs, y, test_size=TEST_SIZE, random_state=seed, stratify=y
    )
    G_train, G_val, y_train, y_val = train_test_split(
        G_train_full, y_train_full,
        test_size=VAL_SIZE_OF_REMAINDER, random_state=seed, stratify=y_train_full
    )
    G_vocab, G_ml, y_vocab, y_ml = train_test_split(
        G_train, y_train,
        test_size=VOCAB_ML_RATIO, random_state=seed, stratify=y_train
    )

    # --- Stage 2: ENCODING (WL kernel) ---
    update(TrainingStage.ENCODING, 0.10, 0.0, "Fitting WL encoder vocabulary...")

    wl_kwargs = {"seed": seed}
    if wl_params:
        wl_kwargs.update(wl_params)
    encoder = WL(**wl_kwargs)

    train_emb = encoder.generate_training_embeddings(G_vocab, y_vocab)
    update(TrainingStage.ENCODING, 0.20, 1.0, f"WL encoding complete. Vocabulary size: {encoder.n_vocab}")

    # --- Stage 3: SPARSE_CODING (FDDL) ---
    update(TrainingStage.SPARSE_CODING, 0.25, 0.0, "Training FDDL dictionary...")

    fddl_kwargs = {"seed": seed}
    if fddl_params:
        fddl_kwargs.update(fddl_params)
    dict_learner = FDDLGPU(**fddl_kwargs)

    dict_learner.fit(training_graph_embeddings=train_emb, y_train=y_vocab)
    update(TrainingStage.SPARSE_CODING, 0.45, 1.0, "Dictionary learning complete")

    # Generate sparse codes for all splits
    update(TrainingStage.SPARSE_CODING, 0.45, 0.8, "Generating sparse codes for ML train split...")
    ml_emb = encoder.generate_inferencing_embeddings(G_ml)
    X_ml = dict_learner.infer(ml_emb)

    val_emb = encoder.generate_inferencing_embeddings(G_val)
    X_val = dict_learner.infer(val_emb)

    test_emb = encoder.generate_inferencing_embeddings(G_test)
    X_test = dict_learner.infer(test_emb)

    update(TrainingStage.SPARSE_CODING, 0.50, 1.0, "All sparse codes generated")

    # --- Stage 4: NORMALIZING ---
    update(TrainingStage.NORMALIZING, 0.50, 0.0, "Scaling features...")

    scaler = MaxAbsScaler()
    X_ml_s = scaler.fit_transform(X_ml)
    X_val_s = scaler.transform(X_val)
    X_test_s = scaler.transform(X_test)

    update(TrainingStage.NORMALIZING, 0.55, 1.0, "Feature scaling complete")

    # --- Stage 5: TRAINING (classifier on ML split, threshold on val) ---
    update(TrainingStage.TRAINING, 0.55, 0.0, f"Training {classifier} classifier...")

    evaluator_method = CLASSIFIER_MAP.get(classifier)
    if not evaluator_method:
        raise ValueError(f"Unknown classifier: {classifier}. Options: {list(CLASSIFIER_MAP.keys())}")

    evaluator_val = Evaluator(
        X_ml_s, y_ml, X_val_s, y_val,
        implementation="smiles_viz_trainer",
        dataset=Path(file_path).stem,
        n_atoms=dict_learner.n_atoms(),
        random_state=seed,
    )
    getattr(evaluator_val, evaluator_method)()

    models = evaluator_val.get_fitted_models()
    thresholds = evaluator_val.get_thresholds()

    update(TrainingStage.TRAINING, 0.70, 1.0, "Classifier trained and threshold tuned on validation set")

    # --- Stage 6: EVALUATING (honest test-set evaluation) ---
    update(TrainingStage.EVALUATING, 0.70, 0.0, "Evaluating on held-out test set...")

    evaluator_test = Evaluator(
        X_ml_s, y_ml, X_test_s, y_test,
        implementation="smiles_viz_trainer",
        dataset=Path(file_path).stem,
        n_atoms=dict_learner.n_atoms(),
        random_state=seed,
        fixed_thresholds=thresholds,
    )
    getattr(evaluator_test, evaluator_method)()

    # Get test metrics
    test_record = evaluator_test._model_records[-1]
    metrics = {
        "accuracy": round(float(test_record["accuracy"]), 4),
        "precision": round(float(test_record["precision"]), 4),
        "recall": round(float(test_record["recall"]), 4),
        "f1_score": round(float(test_record["f1"]), 4),
        "roc_auc": round(float(test_record["roc_auc"]), 4),
        "pr_auc": round(float(test_record["pr_auc"]), 4),
        "threshold": round(float(test_record["threshold"]), 4),
    }

    update(TrainingStage.EVALUATING, 0.85, 1.0, f"Evaluation complete. Test F1: {metrics['f1_score']}")

    # --- Stage 7: SAVING ---
    update(TrainingStage.SAVING, 0.85, 0.0, "Saving model bundle...")

    output_path = save_bundle(
        root=output_dir,
        implementation="smiles_viz_trainer",
        dataset=Path(file_path).stem,
        encoder=encoder,
        dict_learner=dict_learner,
        scaler=scaler,
        models=models,
        thresholds=thresholds,
    )

    duration = round(float(time.time() - start_time), 2)

    update(TrainingStage.SAVING, 1.0, 1.0, f"Model saved to {output_path}")

    return {
        "output_path": str(output_path),
        "metrics": metrics,
        "total_molecules": int(total_molecules),
        "valid_molecules": int(valid_molecules),
        "training_duration_seconds": duration,
        "classifier": classifier,
    }
