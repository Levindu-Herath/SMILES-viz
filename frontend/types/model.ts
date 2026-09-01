export interface ModelBundle {
  id: string;
  name: string;
  dataset: string | null;
  implementation: string | null;
  default_model: string;
  available_models: string[];
  metrics: Record<string, { accuracy?: number; roc_auc?: number }>;
  created_at: string;
}

export interface ModelListResponse {
  models: ModelBundle[];
}
