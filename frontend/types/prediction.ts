export interface ModelInfo {
  name: string;
  accuracy: number;
  roc_auc: number;
  threshold: number;
}

export interface AvailableModelsResponse {
  models: ModelInfo[];
  default_model: string;
}

export interface PredictionResult {
  smiles: string;
  model_name: string;
  prediction: "Active" | "Inactive";
  prediction_label: number;
  probability: number;
  threshold: number;
}
