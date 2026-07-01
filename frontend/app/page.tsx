"use client";

import { useState } from "react";
import type { MoleculeData } from "@/types/molecule";
import { visualizeMolecule } from "@/lib/api";
import { SmilesInput } from "@/components/molecule/SmilesInput";
import { MoleculeResults } from "@/components/molecule/MoleculeResults";

export default function Home() {
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
      setError(
        err instanceof Error ? err.message : "Failed to connect to the backend.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 px-6 py-5">
        <div className="mx-auto max-w-5xl flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-lg font-bold">
            ⌬
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            SMILES Visualizer
          </h1>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8 space-y-8">
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
