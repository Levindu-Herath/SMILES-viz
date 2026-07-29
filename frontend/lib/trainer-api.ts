const TRAINER_BASE = "http://localhost:5000";

export async function checkTrainerHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${TRAINER_BASE}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function uploadDatasetFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${TRAINER_BASE}/upload`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Upload failed: ${res.status}`);
  }
  const data = await res.json();
  return data.file_path as string;
}

export interface DirectoryEntry {
  name: string;
  path: string;
}

export interface FileEntry {
  name: string;
  path: string;
  extension: string;
  size_bytes: number;
}

export interface BrowseDirectoriesResult {
  current_path: string;
  parent_path: string | null;
  directories: DirectoryEntry[];
  files: FileEntry[];
}

export async function browseDirectories(
  path?: string,
  includeFiles?: boolean,
  fileExtensions?: string,
): Promise<BrowseDirectoriesResult> {
  const url = new URL(`${TRAINER_BASE}/browse-directories`);
  if (path) url.searchParams.set("path", path);
  if (includeFiles) url.searchParams.set("include_files", "true");
  if (fileExtensions) url.searchParams.set("file_extensions", fileExtensions);
  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Failed to browse directory: ${res.status}`);
  }
  return res.json();
}

export async function createDirectory(path: string): Promise<string> {
  const res = await fetch(`${TRAINER_BASE}/browse-directories/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Failed to create directory: ${res.status}`);
  }
  const data = await res.json();
  return data.path as string;
}

export async function listDrives(): Promise<string[]> {
  const res = await fetch(`${TRAINER_BASE}/browse-directories/drives`);
  if (!res.ok) throw new Error(`Failed to list drives: ${res.status}`);
  const data = await res.json();
  return data.drives as string[];
}

interface InvalidRow {
  row: number;
  smiles: string;
  error: string;
}

export interface DatasetValidationResult {
  file_path: string;
  file_format: string;
  total_rows: number;
  valid_smiles: number;
  invalid_smiles: number;
  invalid_rows: InvalidRow[];
  columns: string[];
  detected_smiles_column: string | null;
  detected_target_column: string | null;
  target_value_counts: Record<string, number>;
  is_valid: boolean;
  errors: string[];
  warnings: string[];
}

export async function validateDataset(filePath: string): Promise<DatasetValidationResult> {
  const res = await fetch(`${TRAINER_BASE}/validate-dataset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_path: filePath }),
  });
  if (!res.ok) throw new Error(`Validation failed: ${res.status}`);
  return res.json();
}

interface TrainRequest {
  file_path: string;
  smiles_column?: string;
  target_column?: string;
  classifier: string;
  output_dir?: string;
}

interface TrainResponse {
  job_id: string;
  message: string;
}

export async function startTraining(req: TrainRequest): Promise<TrainResponse> {
  const res = await fetch(`${TRAINER_BASE}/train`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (res.status === 409) throw new Error("A training job is already running");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Training failed: ${res.status}`);
  }
  return res.json();
}

export interface JobStatus {
  job_id: string;
  status: string;
  progress: number;
  current_stage_progress: number;
  message: string;
  created_at: string;
  updated_at: string;
  error: string | null;
}

export interface TrainingResult {
  job_id: string;
  status: string;
  classifier: string;
  dataset_path: string;
  total_molecules: number;
  valid_molecules: number;
  training_duration_seconds: number;
  output_path: string;
  metrics: {
    accuracy: number;
    precision: number;
    recall: number;
    f1_score: number;
    roc_auc: number;
    pr_auc: number;
    threshold: number;
  };
}

export async function getTrainingStatus(jobId: string): Promise<JobStatus> {
  const res = await fetch(`${TRAINER_BASE}/train/${jobId}/status`);
  if (!res.ok) throw new Error(`Failed to get status: ${res.status}`);
  return res.json();
}

export function subscribeToTraining(
  jobId: string,
  onProgress: (status: JobStatus) => void,
  onComplete: (result: TrainingResult) => void,
  onError: (error: string) => void,
): () => void {
  const eventSource = new EventSource(`${TRAINER_BASE}/train/${jobId}/stream`);

  eventSource.addEventListener("progress", (e) => {
    const status: JobStatus = JSON.parse(e.data);
    onProgress(status);
  });

  eventSource.addEventListener("complete", (e) => {
    const result: TrainingResult = JSON.parse(e.data);
    onComplete(result);
    eventSource.close();
  });

  eventSource.addEventListener("error", (e) => {
    // SSE error event - could be connection loss or training failure
    if (e instanceof MessageEvent && e.data) {
      const data = JSON.parse(e.data);
      onError(data.error || "Training failed");
    } else {
      onError("Connection to trainer lost");
    }
    eventSource.close();
  });

  // Return cleanup function
  return () => eventSource.close();
}

export async function getTrainingResult(jobId: string): Promise<TrainingResult> {
  const res = await fetch(`${TRAINER_BASE}/train/${jobId}/result`);
  if (!res.ok) throw new Error(`Failed to get result: ${res.status}`);
  return res.json();
}
