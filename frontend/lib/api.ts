import type { MoleculeData } from "@/types/molecule";

function getApiBase(): string {
  if (typeof window === "undefined") return "http://localhost:8000";
  return process.env.NEXT_PUBLIC_API_URL ?? `http://${window.location.hostname}:8000`;
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
  const res = await fetch(`${getApiBase()}/api/visualize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ smiles }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      body.detail || `Server error: ${res.status}`,
      res.status,
    );
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
