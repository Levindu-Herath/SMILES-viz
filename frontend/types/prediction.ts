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

export interface TopAtom {
  atom_idx: number;
  element: string;
  score: number;
  percentage: number;
  direction: "supporting" | "opposing";
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
  atom_heatmap_svg: string;
  top_atoms: TopAtom[];
  substructure_heatmap_svg: string;
  top_substructures: TopSubstructure[];
}
