"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { MoleculePredict } from "@/components/molecule/MoleculePredict";
import { MoleculeResults } from "@/components/molecule/MoleculeResults";
import { ApiError, getAvailableModels, visualizeMolecule } from "@/lib/api";
import { EXAMPLE_COMPOUNDS, looksLikeSmiles, resolveCompoundName } from "@/lib/smiles";
import type { MoleculeData } from "@/types/molecule";
import type { ModelInfo } from "@/types/prediction";

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

  // Predict-mode models list (fetched here, handed down to MoleculePredict)
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsError, setModelsError] = useState("");

  useEffect(() => {
    getAvailableModels()
      .then((data) => {
        setModels(data.models);
      })
      .catch((err: unknown) => {
        setModelsError(friendlyErrorMessage(err, "Failed to load available models."));
      });
  }, []);

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
            <div className="space-y-2">
              <label htmlFor="smiles-input" className="sr-only">
                Compound name or SMILES notation
              </label>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <input
                    id="smiles-input"
                    type="text"
                    value={smiles}
                    onChange={(e) => handleSmilesChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleVisualize();
                    }}
                    placeholder="Enter a compound name or SMILES — e.g. aspirin, caffeine, CC(=O)O"
                    className="w-full rounded-md border border-surface-border bg-surface-card text-text-primary pl-4 pr-10 py-3.5 text-base font-mono placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2 focus:border-primary-500 transition-colors duration-150"
                    spellCheck={false}
                    autoComplete="off"
                  />
                  {smiles && (
                    <button
                      type="button"
                      onClick={handleClearSmiles}
                      title="Clear"
                      className="absolute right-3 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full text-text-muted hover:text-primary-600 hover:bg-primary-50 transition-colors duration-150"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      >
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleVisualize}
                  disabled={loading || resolving || !smiles.trim()}
                  className="shrink-0 inline-flex items-center gap-2 rounded-md bg-primary-500 px-8 py-3 text-sm font-semibold text-white hover:bg-primary-600 active:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
                >
                  <FlaskIcon />
                  {resolving ? "Looking up…" : loading ? "Analyzing…" : "Visualize"}
                </button>
              </div>

              {resolving && (
                <p className="text-sm text-text-secondary">
                  Looking up &ldquo;{resolvingTerm}&rdquo; on PubChem…
                </p>
              )}

              {resolvedInfo && (
                <p className="text-xs text-text-muted">
                  Resolved: {resolvedInfo.name} →{" "}
                  <span className="font-mono text-primary-500">{resolvedInfo.smiles}</span>{" "}
                  (
                  <a
                    href={`https://pubchem.ncbi.nlm.nih.gov/compound/${resolvedInfo.cid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-500 hover:underline"
                  >
                    PubChem CID: {resolvedInfo.cid}
                  </a>
                  )
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-text-muted self-center mr-1">Try:</span>
                {EXAMPLE_COMPOUNDS.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => handleSelectExample(name)}
                    className="rounded-full border border-surface-border px-3 py-1 text-xs text-text-secondary hover:border-primary-300 hover:bg-primary-50 hover:text-primary-500 transition-colors duration-150"
                  >
                    {name}
                  </button>
                ))}
              </div>
              <p className="text-xs text-text-muted">
                Accepts compound names, drug names, or SMILES notation
              </p>
            </div>

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
          <>
            {modelsError && (
              <div className="rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger-text">
                {modelsError}
              </div>
            )}
            <MoleculePredict
              modelId="reference"
              models={models}
              enableHeatmap
              showMoleculePreview
            />
          </>
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
