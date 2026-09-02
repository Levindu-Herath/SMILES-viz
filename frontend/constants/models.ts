/**
 * Fixed classifier used by the Analyze → Predict flow.
 *
 * The four-way model chooser was removed from the Analyze tab: most users are
 * not ML practitioners, so the choice added confusion rather than value.
 * Predictions on the Analyze tab now always run against this one classifier.
 *
 * This name MUST match one of the classifier names the reference bundle exposes
 * via `GET /api/predict/models` (backend `_MODEL_METRICS` /
 * `predictor.available_models()`), currently:
 *   "Logistic Regression" | "Gradient Boosting" | "Linear SVM" | "Random Forest"
 *
 * To switch the Analyze prediction model, change ONLY this constant. (Note:
 * Random Forest and Logistic Regression have marginally higher held-out ROC-AUC;
 * Linear SVM is used for its speed, determinism, and cleaner alignment with the
 * linear WL/FDDL substructure heatmaps.)
 */
export const REFERENCE_PREDICT_MODEL = "Linear SVM" as const;
