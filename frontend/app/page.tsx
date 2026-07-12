"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { MoleculeData } from "@/types/molecule";
import { visualizeMolecule } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { SmilesInput } from "@/components/molecule/SmilesInput";
import { MoleculeResults } from "@/components/molecule/MoleculeResults";

export default function Home() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  const [smiles, setSmiles] = useState("");
  const [result, setResult] = useState<MoleculeData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

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

  // Show nothing while checking auth
  if (authLoading || !user) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 px-6 py-5">
        <div className="mx-auto max-w-5xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-lg font-bold">
              ⌬
            </div>
            <h1 className="text-xl font-semibold tracking-tight">
              SMILES Visualizer
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-500">{user.email}</span>
            <button
              onClick={signOut}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:border-slate-600 hover:text-slate-300 transition-colors"
            >
              Sign out
            </button>
          </div>
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
