from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    confusion_matrix,
    multilabel_confusion_matrix,
    roc_auc_score,
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    average_precision_score,
    classification_report,
    precision_recall_curve,
)
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.svm import LinearSVC
from sklearn.calibration import CalibratedClassifierCV

import numpy as np
from datetime import datetime


class Evaluator:
    def __init__(
        self,
        X_train,
        y_train,
        X_test,
        y_test,
        implementation="unknown_impl",
        dataset="unknown_dataset",
        n_atoms=None,
        random_state=42,
        results_dir="results",
        fixed_thresholds=None,
        started_at=None,
    ):
        self.X_train = X_train
        self.X_test = X_test
        self.y_train = y_train
        self.y_test = y_test
        self.random_state = random_state
        self.implementation = implementation
        self.dataset = dataset
        self.n_atoms = n_atoms
        self.results_dir = results_dir
        # Timestamp when this evaluation run began; the run folder is named with
        # both start and completion times so its duration is visible on disk.
        self.started_at = started_at or datetime.now().strftime("%Y%m%d_%H%M%S")
        # Thresholds fit on a validation set and reused on the test set.
        # Maps model_name -> threshold. When a model is present here, its
        # decision threshold is taken from this dict instead of being tuned
        # on the current (test) labels, avoiding test-set leakage.
        self.fixed_thresholds = dict(fixed_thresholds) if fixed_thresholds else {}

        self._model_records = []
        # Fitted estimator objects, kept so the export pipeline can serialise the
        # exact models that produced these metrics. Maps model_name -> estimator.
        self.fitted_models = {}

    def _find_optimal_threshold(self, y_true, y_scores):
        """Find the threshold that maximizes F1-score."""
        precisions, recalls, thresholds = precision_recall_curve(y_true, y_scores)
        with np.errstate(invalid="ignore"):
            f1_scores = np.where(
                (precisions + recalls) > 0,
                2 * precisions * recalls / (precisions + recalls),
                0.0,
            )
        best_idx = np.argmax(f1_scores[:-1])
        return thresholds[best_idx]

    def _majority_minority_labels(self):
        labels, counts = np.unique(self.y_test, return_counts=True)
        majority_label = labels[np.argmax(counts)]
        minority_label = labels[np.argmin(counts)]
        return majority_label, minority_label

    def _evaluate_model(self, model, model_name, optimize_threshold=True, sample_weight=None):
        if sample_weight is not None:
            model.fit(self.X_train, self.y_train, sample_weight=sample_weight)
        else:
            model.fit(self.X_train, self.y_train)
        # Retain the fitted estimator for export (the deployed model is exactly
        # the one benchmarked here).
        self.fitted_models[model_name] = model
        y_scores = model.predict_proba(self.X_test)[:, 1]

        if model_name in self.fixed_thresholds:
            # Reuse a threshold fit on the validation set — do not tune on the
            # current (test) labels.
            threshold = self.fixed_thresholds[model_name]
            y_pred = np.where(y_scores >= threshold, 1, -1)
        elif optimize_threshold:
            threshold = self._find_optimal_threshold(self.y_test, y_scores)
            y_pred = np.where(y_scores >= threshold, 1, -1)  # <-- FIX: map to -1/1, not 0/1
        else:
            threshold = 0.5
            y_pred = model.predict(self.X_test)

        # Metrics
        accuracy = accuracy_score(self.y_test, y_pred)
        precision = precision_score(self.y_test, y_pred, zero_division=0)
        rec = recall_score(self.y_test, y_pred, zero_division=0)
        f1 = f1_score(self.y_test, y_pred, zero_division=0)
        roc_auc = roc_auc_score(self.y_test, y_scores)
        pr_auc = average_precision_score(self.y_test, y_scores)
        report_text = classification_report(self.y_test, y_pred, zero_division=0)

        print(f"\n===== {model_name} (threshold={threshold:.3f}) =====")
        print(f"Accuracy  : {accuracy:.4f}")
        print(f"Precision : {precision:.4f}")
        print(f"Recall    : {rec:.4f}")
        print(f"F1-Score  : {f1:.4f}")
        print(f"ROC-AUC   : {roc_auc:.4f}")
        print(f"PR-AUC    : {pr_auc:.4f}")
        print("\nClassification Report")
        print(report_text)

        majority_label, minority_label = self._majority_minority_labels()
        cm_global = confusion_matrix(self.y_test, y_pred)
        cm_per_class = multilabel_confusion_matrix(
            self.y_test, y_pred, labels=[majority_label, minority_label]
        )
        cm_majority, cm_minority = cm_per_class[0], cm_per_class[1]

        self._model_records.append({
            "model_name": model_name,
            "threshold": threshold,
            "accuracy": accuracy,
            "precision": precision,
            "recall": rec,
            "f1": f1,
            "roc_auc": roc_auc,
            "pr_auc": pr_auc,
            "report_text": report_text,
            "cm_global": cm_global,
            "cm_majority": cm_majority,
            "cm_minority": cm_minority,
            "majority_label": majority_label,
            "minority_label": minority_label,
        })

        return {
            "Accuracy": accuracy,
            "Precision": precision,
            "Recall": rec,
            "F1-Score": f1,
            "ROC-AUC": roc_auc,
            "PR-AUC": pr_auc,
            "Threshold": threshold,
            "Classification Report": report_text,
            "Confusion Matrix": cm_global,
            "Confusion Matrix (Majority Class)": cm_majority,
            "Confusion Matrix (Minority Class)": cm_minority,
        }

    def get_fitted_models(self):
        """Return {model_name: fitted_estimator} for every model evaluated so
        far. Used by the export pipeline to serialise the deployable models."""
        return dict(self.fitted_models)

    def get_thresholds(self):
        """Return the decision threshold used for each evaluated model as a
        {model_name: threshold} dict. Call this after running the evaluations
        on the validation set, then pass the result as `fixed_thresholds` to a
        new Evaluator built on the test set so the test metrics use the
        validation-tuned thresholds instead of tuning on the test labels."""
        return {
            record["model_name"]: record["threshold"]
            for record in self._model_records
        }

    def predict_logistic_regression(self):
        print("Predicting with Logistic Regression")
        model = LogisticRegression(class_weight="balanced", random_state=self.random_state)
        return self._evaluate_model(model, "Logistic Regression")

    def predict_gradient_boosting(self):
        print("Predicting with Gradient Boosting")
        classes, counts = np.unique(self.y_train, return_counts=True)
        # Mirrors sklearn's "balanced" formula: n_samples / (n_classes * count_per_class)
        weight_map = dict(zip(classes, len(self.y_train) / (len(classes) * counts)))
        sample_weights = np.array([weight_map[y] for y in self.y_train])

        model = GradientBoostingClassifier(random_state=self.random_state)
        return self._evaluate_model(model, "Gradient Boosting", sample_weight=sample_weights)

    def predict_svm(self):
        print("Predicting with SVM")
        base_model = LinearSVC(class_weight="balanced", random_state=self.random_state)
        model = CalibratedClassifierCV(base_model)
        return self._evaluate_model(model, "Linear SVM")

    def predict_random_forest(self):
        print("Predicting with Random Forest")
        model = RandomForestClassifier(class_weight="balanced", random_state=self.random_state)
        return self._evaluate_model(model, "Random Forest")
