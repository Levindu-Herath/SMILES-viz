"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MoleculeData } from "@/types/molecule";
import { visualizeMolecule } from "@/lib/api";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { SmilesInput } from "@/components/molecule/SmilesInput";
import { MoleculeResults } from "@/components/molecule/MoleculeResults";

function VisualizePage() {
  const router = useRouter();

  const [smiles, setSmiles] = useState("");
  const [result, setResult] = useState<MoleculeData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleVisualize() {
    const trimmed = smiles.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const data = await visualizeMolecule(trimmed);
      setResult(data);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("Session expired")) {
        router.push("/login");
        return;
      }
      setError(
        err instanceof Error ? err.message : "Failed to connect to the backend.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-8 space-y-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Molecular Analysis
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Enter a SMILES string to visualize its structure and compute druglikeness properties.
          </p>
        </div>

        <SmilesInput
          value={smiles}
          onChange={setSmiles}
          onSubmit={handleVisualize}
          loading={loading}
        />

        {error && (
          <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-5 py-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {result && <MoleculeResults data={result} />}
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <AuthGuard>
      <VisualizePage />
    </AuthGuard>
  );
}
