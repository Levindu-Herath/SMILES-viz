import type { MoleculeData } from "@/types/molecule";
import type { AvailableModelsResponse, HeatmapResult, PredictionResult } from "@/types/prediction";
import type { DatasetListResponse, DownloadUrlResponse, UploadResponse } from "@/types/dataset";
import { supabase } from "./supabase";

function getApiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
}

async function getAuthToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Not authenticated");
  }

  return session.access_token;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const token = await getAuthToken();
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  } catch {
    // No session — auth is optional, so proceed unauthenticated.
    return {
      "Content-Type": "application/json",
    };
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function visualizeMolecule(smiles: string): Promise<MoleculeData> {
  const headers = await getAuthHeaders();

  const res = await fetch(`${getApiBase()}/api/visualize`, {
    method: "POST",
    headers,
    body: JSON.stringify({ smiles }),
  });

  if (res.status === 401) {
    throw new ApiError("Sign in required for this feature.", 401);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.detail || `Server error: ${res.status}`, res.status);
  }

  return res.json();
}

export async function getAvailableModels(): Promise<AvailableModelsResponse> {
  const headers = await getAuthHeaders();

  const res = await fetch(`${getApiBase()}/api/predict/models`, {
    headers,
  });

  if (res.status === 401) {
    throw new ApiError("Sign in required for this feature.", 401);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.detail || `Server error: ${res.status}`, res.status);
  }

  return res.json();
}

export async function predictActivity(
  smiles: string,
  modelName: string,
): Promise<PredictionResult> {
  const headers = await getAuthHeaders();

  const res = await fetch(`${getApiBase()}/api/predict`, {
    method: "POST",
    headers,
    body: JSON.stringify({ smiles, model_name: modelName }),
  });

  if (res.status === 401) {
    throw new ApiError("Sign in required for this feature.", 401);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.detail || `Server error: ${res.status}`, res.status);
  }

  return res.json();
}

export async function getPredictionHeatmap(
  smiles: string,
  modelName: string,
): Promise<HeatmapResult> {
  const headers = await getAuthHeaders();

  const res = await fetch(`${getApiBase()}/api/predict/heatmap`, {
    method: "POST",
    headers,
    body: JSON.stringify({ smiles, model_name: modelName }),
  });

  if (res.status === 401) {
    throw new ApiError("Sign in required for this feature.", 401);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.detail || `Server error: ${res.status}`, res.status);
  }

  return res.json();
}

export async function uploadDataset(
  file: File,
  name: string,
  description: string,
): Promise<UploadResponse> {
  let authHeaders: Record<string, string> = {};
  try {
    const token = await getAuthToken();
    authHeaders = { Authorization: `Bearer ${token}` };
  } catch {
    // No session — auth is optional, so proceed unauthenticated.
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("name", name);
  formData.append("description", description);

  const res = await fetch(`${getApiBase()}/api/datasets/upload`, {
    method: "POST",
    headers: authHeaders,
    body: formData,
  });

  if (res.status === 401) {
    throw new ApiError("Sign in required for this feature.", 401);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.detail || `Server error: ${res.status}`, res.status);
  }

  return res.json();
}

export async function listDatasets(): Promise<DatasetListResponse> {
  const headers = await getAuthHeaders();

  const res = await fetch(`${getApiBase()}/api/datasets`, {
    headers,
  });

  if (res.status === 401) {
    throw new ApiError("Sign in required for this feature.", 401);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.detail || `Server error: ${res.status}`, res.status);
  }

  return res.json();
}

export async function getDownloadUrl(datasetId: string): Promise<DownloadUrlResponse> {
  const headers = await getAuthHeaders();

  const res = await fetch(`${getApiBase()}/api/datasets/${datasetId}/download`, {
    headers,
  });

  if (res.status === 401) {
    throw new ApiError("Sign in required for this feature.", 401);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.detail || `Server error: ${res.status}`, res.status);
  }

  return res.json();
}

export async function deleteDataset(datasetId: string): Promise<void> {
  const headers = await getAuthHeaders();

  const res = await fetch(`${getApiBase()}/api/datasets/${datasetId}`, {
    method: "DELETE",
    headers,
  });

  if (res.status === 401) {
    throw new ApiError("Sign in required for this feature.", 401);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.detail || `Server error: ${res.status}`, res.status);
  }
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${getApiBase()}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}
