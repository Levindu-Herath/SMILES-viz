import type { MoleculeData } from "@/types/molecule";
import { supabase } from "./supabase";

function getApiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Not authenticated");
  }

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };
}

class ApiError extends Error {
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
    throw new ApiError("Session expired. Please log in again.", 401);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.detail || `Server error: ${res.status}`, res.status);
  }

  return res.json();
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${getApiBase()}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}
