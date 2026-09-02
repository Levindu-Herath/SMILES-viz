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

export interface DiseaseInfo {
  id: string;
  label: string;
  nci_id: number;
}

export interface AvailableDiseasesResponse {
  diseases: DiseaseInfo[];
  default_disease: string;
}

export interface PredictionResult {
  smiles: string;
  model_name: string;
  prediction: "Active" | "Inactive";
  prediction_label: number;
  probability: number;
  threshold: number;
}

export interface TopSubstructure {
  token: string;
  description: string;
  score: number;
  percentage: number;
  occurrences: number;
  direction: "supporting" | "opposing";
}

export interface HeatmapResult {
  smiles: string;
  model_name: string;
  prediction: "Active" | "Inactive";
  confidence: number | null;
  score_a_heatmap_png: string;
  top_substructures_a: TopSubstructure[];
  score_b_heatmap_png: string;
  top_substructures_b: TopSubstructure[];
}
