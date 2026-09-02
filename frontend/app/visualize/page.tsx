"use client";

import { useState } from "react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { CompoundInput } from "@/components/molecule/CompoundInput";
import { MoleculePredict } from "@/components/molecule/MoleculePredict";
import { MoleculeResults } from "@/components/molecule/MoleculeResults";
import { REFERENCE_PREDICT_MODEL } from "@/constants/models";
import { ApiError, visualizeMolecule } from "@/lib/api";
import { EXAMPLE_COMPOUNDS, looksLikeSmiles, resolveCompoundName } from "@/lib/smiles";
import type { MoleculeData } from "@/types/molecule";

type Mode = "visualize" | "predict";

type ResolvedCompound = { name: string; smiles: string; cid: number };

// The backend treats auth as optional, but some features may still require it —
// surface a friendly nudge instead of a raw "session expired" error.
function friendlyErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.status === 401) {
    return "Sign in for full access.";
  }
  return err instanceof Error ? err.message : fallback;
}

function FlaskIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M9 2v6.3L4.2 17.5A2 2 0 0 0 6 20.5h12a2 2 0 0 0 1.8-3L15 8.3V2" />
      <path d="M9 2h6" />
      <path d="M7.5 15h9" />
    </svg>
  );
}

function AnalysisPage() {
  const [mode, setMode] = useState<Mode>("visualize");
  const [smiles, setSmiles] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Compound-name resolution (PubChem name -> SMILES), independent of the backend calls.
  const [resolving, setResolving] = useState(false);
  const [resolvingTerm, setResolvingTerm] = useState("");
  const [resolvedInfo, setResolvedInfo] = useState<ResolvedCompound | null>(null);

  // Visualize-mode results
  const [visualizeResult, setVisualizeResult] = useState<MoleculeData | null>(null);

  function handleModeChange(newMode: Mode) {
    if (newMode === mode) return;
    setMode(newMode);
    setError("");
    setVisualizeResult(null);
    setResolvedInfo(null);
  }

  // Turns whatever the user typed into a SMILES string, transparently resolving
  // compound/drug names through PubChem first. Returns null (with `error` already
  // set) if resolution failed, so callers can bail out before touching the backend.
  async function resolveSmiles(rawInput: string): Promise<string | null> {
    setResolvedInfo(null);

    if (looksLikeSmiles(rawInput)) {
      return rawInput;
    }

    setResolvingTerm(rawInput);
    setResolving(true);
    try {
      const { smiles: resolvedSmiles, cid } = await resolveCompoundName(rawInput);
      setResolvedInfo({ name: rawInput, smiles: resolvedSmiles, cid });
      return resolvedSmiles;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resolve compound name.");
      return null;
    } finally {
      setResolving(false);
    }
  }

  async function handleVisualize() {
    const trimmed = smiles.trim();
    if (!trimmed || loading || resolving) return;

    setError("");
    setVisualizeResult(null);

    const resolvedSmiles = await resolveSmiles(trimmed);
    if (!resolvedSmiles) return;

    setLoading(true);
    try {
      const data = await visualizeMolecule(resolvedSmiles);
      setVisualizeResult(data);
    } catch (err: unknown) {
      setError(friendlyErrorMessage(err, "Failed to connect to the backend."));
    } finally {
      setLoading(false);
    }
  }

  function handleClearSmiles() {
    setSmiles("");
    setError("");
    setVisualizeResult(null);
    setResolvedInfo(null);
  }

  function handleSmilesChange(value: string) {
    setSmiles(value);
    setResolvedInfo(null);
  }

  function handleSelectExample(exampleName: string) {
    setSmiles(exampleName);
    setError("");
    setVisualizeResult(null);
    setResolvedInfo(null);
  }

  return (
    <main className="min-h-screen bg-surface-bg text-text-primary">
      <div className="mx-auto max-w-6xl px-6 py-8 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Molecular analysis</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Explore a molecule&apos;s structure and properties, or predict its potential to fight cancer.
          </p>
        </div>

        {/* Mode toggle + description */}
        <div>
          <div className="inline-flex items-center gap-1 bg-primary-50 rounded-lg p-1">
            <button
              type="button"
              onClick={() => handleModeChange("visualize")}
              className={
                mode === "visualize"
                  ? "bg-primary-500 text-white rounded-md px-5 py-2 text-sm font-medium shadow-sm transition-all duration-150"
                  : "text-text-secondary rounded-md px-5 py-2 text-sm font-medium hover:text-text-primary transition-all duration-150"
              }
            >
              Visualize
            </button>
            <button
              type="button"
              onClick={() => handleModeChange("predict")}
              className={
                mode === "predict"
                  ? "bg-primary-500 text-white rounded-md px-5 py-2 text-sm font-medium shadow-sm transition-all duration-150"
                  : "text-text-secondary rounded-md px-5 py-2 text-sm font-medium hover:text-text-primary transition-all duration-150"
              }
            >
              Predict
            </button>
          </div>
          <p className="text-sm text-text-secondary mt-2">
            {mode === "visualize"
              ? "View molecular structure, druglikeness, and absorption properties."
              : "Predict anti-cancer activity using an AI model trained on NCI compound data."}
          </p>
        </div>

        {mode === "visualize" ? (
          <>
            {/* Compound name / SMILES input */}
            <CompoundInput
              value={smiles}
              onChange={handleSmilesChange}
              onSubmit={handleVisualize}
              onClear={handleClearSmiles}
              onSelectExample={handleSelectExample}
              examples={EXAMPLE_COMPOUNDS}
              resolving={resolving}
              resolvingTerm={resolvingTerm}
              resolved={resolvedInfo}
              submitSlot={
                <button
                  type="button"
                  onClick={handleVisualize}
                  disabled={loading || resolving || !smiles.trim()}
                  className="shrink-0 inline-flex items-center gap-2 rounded-md bg-primary-500 px-8 py-3 text-sm font-semibold text-white hover:bg-primary-600 active:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
                >
                  <FlaskIcon />
                  {resolving ? "Looking up…" : loading ? "Analyzing…" : "Visualize"}
                </button>
              }
            />

            {error && (
              <div className="rounded-lg border border-danger-border bg-danger-bg px-5 py-4 text-sm text-danger-text">
                {error}
              </div>
            )}

            {(loading || visualizeResult) && <div className="border-t border-surface-border" />}

            {loading && (
              <div className="animate-fade-in rounded-lg border border-surface-border bg-primary-50/40 min-h-[300px] flex items-center justify-center">
                <p className="text-sm text-text-secondary">Analyzing…</p>
              </div>
            )}

            {!loading && visualizeResult && (
              <div className="animate-fade-in">
                <MoleculeResults data={visualizeResult} />
              </div>
            )}
          </>
        ) : (
          <MoleculePredict
            modelId="reference"
            fixedModel={REFERENCE_PREDICT_MODEL}
            enableHeatmap
            showMoleculePreview
          />
        )}
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <AuthGuard>
      <AnalysisPage />
    </AuthGuard>
  );
}
