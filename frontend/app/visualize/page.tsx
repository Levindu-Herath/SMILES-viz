"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { MoleculeResults } from "@/components/molecule/MoleculeResults";
import { PropRow } from "@/components/ui/PropRow";
import {
  ApiError,
  getAvailableModels,
  getPredictionHeatmap,
  predictActivity,
  visualizeMolecule,
} from "@/lib/api";
import type { MoleculeData } from "@/types/molecule";
import type { HeatmapResult, ModelInfo, PredictionResult } from "@/types/prediction";

type Mode = "visualize" | "predict";

// How far probability must sit from the decision threshold to call it "high confidence".
const CONFIDENCE_MARGIN = 0.15;

// Common drug/compound names general users would recognize -- resolved to SMILES via
// PubChem on submit, rather than requiring users to already know the SMILES notation.
const EXAMPLE_COMPOUNDS = [
  "Aspirin",
  "Caffeine",
  "Ibuprofen",
  "Paracetamol",
  "Penicillin",
  "Glucose",
] as const;

type ResolvedCompound = { name: string; smiles: string; cid: number };

// The backend treats auth as optional, but some features may still require it —
// surface a friendly nudge instead of a raw "session expired" error.
function friendlyErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.status === 401) {
    return "Sign in for full access.";
  }
  return err instanceof Error ? err.message : fallback;
}

// Heuristic only -- ambiguous input falls through to a PubChem lookup, and if that
// fails the raw input is still tried against the backend as a SMILES string, so a
// wrong guess here never blocks a valid input from working.
function looksLikeSmiles(input: string): boolean {
  const s = input.trim();
  if (!s) return false;
  // Structural characters that only appear in SMILES notation.
  if (/[()=[\]#@\\/]/.test(s)) return true;
  // Multi-word or hyphenated input reads as a name (e.g. "vitamin C", "beta-carotene").
  if (/[\s-]/.test(s)) return false;
  // Ring-closure digits (c1ccccc1) are a strong SMILES signal.
  if (/\d/.test(s)) return true;
  // An uppercase letter after the first position breaks normal English capitalization
  // (e.g. "CCO", "NCCc1ccc(O)c(O)c1") -- real compound names only capitalize the first letter.
  if (/[A-Z]/.test(s.slice(1))) return true;
  return false;
}

async function resolveCompoundName(name: string): Promise<{ smiles: string; cid: number }> {
  // PubChem's PUG REST deprecated `CanonicalSMILES` in favour of `SMILES` /
  // `ConnectivitySMILES` -- requesting the old name still returns HTTP 200, but the
  // property comes back under a different key, so ask for all three and read
  // whichever one is actually present instead of assuming the property name.
  const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(
    name,
  )}/property/SMILES,CanonicalSMILES,ConnectivitySMILES/JSON`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error("Could not connect to PubChem. Try entering a SMILES string instead.");
  }

  if (res.status === 404) {
    throw new Error(
      `Compound '${name}' not found on PubChem. Try a different name or enter a SMILES string directly.`,
    );
  }
  if (!res.ok) {
    throw new Error("Could not connect to PubChem. Try entering a SMILES string instead.");
  }

  const data = await res.json();
  const prop = data?.PropertyTable?.Properties?.[0];
  const smiles = prop?.SMILES ?? prop?.CanonicalSMILES ?? prop?.ConnectivitySMILES;
  if (!smiles) {
    throw new Error(
      `Compound '${name}' not found on PubChem. Try a different name or enter a SMILES string directly.`,
    );
  }
  return { smiles, cid: prop.CID };
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

function ActivityIcon() {
  return (
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
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
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

  // Predict-mode state + results
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [modelsError, setModelsError] = useState("");
  const [predictionResult, setPredictionResult] = useState<PredictionResult | null>(null);
  const [predictMoleculeData, setPredictMoleculeData] = useState<MoleculeData | null>(null);
  const [heatmapResult, setHeatmapResult] = useState<HeatmapResult | null>(null);
  const [heatmapError, setHeatmapError] = useState("");

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
    setPredictionResult(null);
    setPredictMoleculeData(null);
    setHeatmapResult(null);
    setHeatmapError("");
    setSelectedModel("");
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

  async function runPrediction(modelName: string) {
    const trimmed = smiles.trim();
    if (!trimmed || loading || resolving) return;

    setSelectedModel(modelName);
    setError("");
    setPredictionResult(null);
    setPredictMoleculeData(null);
    setHeatmapResult(null);
    setHeatmapError("");

    const resolvedSmiles = await resolveSmiles(trimmed);
    if (!resolvedSmiles) return;

    setLoading(true);

    // Run all three endpoints concurrently, independently — one failing shouldn't block the others.
    const [predictOutcome, visualizeOutcome, heatmapOutcome] = await Promise.all([
      predictActivity(resolvedSmiles, modelName)
        .then((value) => ({ ok: true as const, value }))
        .catch((err: unknown) => ({ ok: false as const, err })),
      visualizeMolecule(resolvedSmiles)
        .then((value) => ({ ok: true as const, value }))
        .catch((err: unknown) => ({ ok: false as const, err })),
      getPredictionHeatmap(resolvedSmiles, modelName)
        .then((value) => ({ ok: true as const, value }))
        .catch((err: unknown) => ({ ok: false as const, err })),
    ]);

    if (predictOutcome.ok) {
      setPredictionResult(predictOutcome.value);
    } else {
      const err = predictOutcome.err;
      setError(friendlyErrorMessage(err, "Failed to connect to the backend."));
    }

    if (visualizeOutcome.ok) {
      setPredictMoleculeData(visualizeOutcome.value);
    }

    if (heatmapOutcome.ok) {
      setHeatmapResult(heatmapOutcome.value);
    } else {
      setHeatmapError(friendlyErrorMessage(heatmapOutcome.err, "Heatmap unavailable."));
    }

    setLoading(false);
  }

  function handleSubmit() {
    if (mode === "visualize") {
      handleVisualize();
    } else if (selectedModel) {
      runPrediction(selectedModel);
    }
  }

  function handleClearSmiles() {
    setSmiles("");
    setError("");
    setVisualizeResult(null);
    setPredictionResult(null);
    setPredictMoleculeData(null);
    setHeatmapResult(null);
    setHeatmapError("");
    setSelectedModel("");
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
    setPredictionResult(null);
    setPredictMoleculeData(null);
    setHeatmapResult(null);
    setHeatmapError("");
    setSelectedModel("");
    setResolvedInfo(null);
  }

  const confidence =
    predictionResult &&
    (Math.abs(predictionResult.probability - predictionResult.threshold) >= CONFIDENCE_MARGIN
      ? "High confidence"
      : "Low confidence");

  const hasResults = loading || Boolean(visualizeResult) || Boolean(predictionResult);

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
                  if (e.key === "Enter") handleSubmit();
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
            {mode === "visualize" && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || resolving || !smiles.trim()}
                className="shrink-0 inline-flex items-center gap-2 rounded-md bg-primary-500 px-8 py-3 text-sm font-semibold text-white hover:bg-primary-600 active:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
              >
                <FlaskIcon />
                {resolving ? "Looking up…" : loading ? "Analyzing…" : "Visualize"}
              </button>
            )}
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

        {/* Model selector (predict mode only) — clicking a model runs the prediction */}
        {mode === "predict" && (
          <div className="space-y-2">
            <h2 className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-primary-500 font-medium">
              <ActivityIcon />
              Choose a model
            </h2>
            {modelsError && (
              <div className="rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger-text">
                {modelsError}
              </div>
            )}
            {!modelsError && models.length === 0 && (
              <p className="text-sm text-text-muted">Loading models…</p>
            )}
            {models.length > 0 && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {models.map((model) => {
                  const isEmpty = !smiles.trim();
                  const disabled = isEmpty || loading || resolving;
                  const isSelected = selectedModel === model.name && !isEmpty;
                  return (
                    <div
                      key={model.name}
                      role="button"
                      tabIndex={disabled ? -1 : 0}
                      onClick={() => runPrediction(model.name)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          runPrediction(model.name);
                        }
                      }}
                      className={`rounded-lg border py-2.5 px-3 transition-all duration-150 ${
                        isSelected
                          ? "border-primary-300 bg-primary-50 ring-1 ring-primary-200"
                          : "border-surface-border bg-surface-card hover:border-primary-200 hover:bg-primary-50/50"
                      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`h-2.5 w-2.5 rounded-full border shrink-0 ${
                              isSelected
                                ? "border-primary-500 bg-primary-500"
                                : "border-surface-border"
                            }`}
                          />
                          <span className="text-xs font-medium text-text-primary truncate">
                            {loading && isSelected ? "Predicting…" : model.name}
                          </span>
                        </div>
                        <span className="text-[10px] text-text-muted font-mono shrink-0">
                          {model.roc_auc.toFixed(3)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-danger-border bg-danger-bg px-5 py-4 text-sm text-danger-text">
            {error}
          </div>
        )}

        {hasResults && <div className="border-t border-surface-border" />}

        {loading && mode === "visualize" && (
          <div className="animate-fade-in rounded-lg border border-surface-border bg-primary-50/40 min-h-[300px] flex items-center justify-center">
            <p className="text-sm text-text-secondary">Analyzing…</p>
          </div>
        )}

        {loading && mode === "predict" && (
          <div className="animate-fade-in grid gap-6 lg:grid-cols-[1fr_1fr]">
            <div className="rounded-lg border border-surface-border bg-primary-50/40 min-h-[300px] flex items-center justify-center">
              <p className="text-sm text-text-secondary">Rendering molecule…</p>
            </div>
            <div className="rounded-lg border border-surface-border bg-primary-50/40 min-h-[300px] flex items-center justify-center">
              <p className="text-sm text-text-secondary">Running prediction…</p>
            </div>
          </div>
        )}

        {!loading && mode === "visualize" && visualizeResult && (
          <div className="animate-fade-in">
            <MoleculeResults data={visualizeResult} />
          </div>
        )}

        {!loading && mode === "predict" && predictionResult && (
          <div className="animate-fade-in space-y-6">
            {/* 1. Prediction result */}
            <div className="rounded-lg border border-surface-border bg-surface-card p-5 space-y-3">
              <div>
                <div className="flex items-baseline gap-3">
                  <p
                    className={`text-2xl font-bold ${
                      predictionResult.prediction === "Active"
                        ? "text-success-text"
                        : "text-danger-text"
                    }`}
                  >
                    {predictionResult.prediction}
                  </p>
                  <p className="text-3xl font-bold text-text-primary">
                    {(predictionResult.probability * 100).toFixed(1)}%
                  </p>
                  <p className="text-xs text-text-muted">probability</p>
                </div>
                <p className="mt-1.5 text-sm text-text-secondary">
                  {predictionResult.prediction === "Active"
                    ? "This molecule is predicted to inhibit cancer cell growth — a candidate anti-cancer compound."
                    : "This molecule is predicted to show no significant anti-cancer activity in this screen."}
                </p>
              </div>

              <div className="relative h-2 rounded-full bg-primary-50 w-full">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-primary-500"
                  style={{ width: `${predictionResult.probability * 100}%` }}
                />
                <div
                  className="absolute inset-y-0 w-0.5 bg-primary-700"
                  style={{ left: `${predictionResult.threshold * 100}%` }}
                  title={`Threshold: ${predictionResult.threshold}`}
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-surface-border p-2 text-center">
                  <p className="text-[10px] text-text-muted mb-0.5">Model</p>
                  <p className="text-xs text-text-primary truncate">{predictionResult.model_name}</p>
                </div>
                <div className="rounded-lg border border-surface-border p-2 text-center">
                  <p className="text-[10px] text-text-muted mb-0.5">Threshold</p>
                  <p className="text-xs text-text-primary">
                    {predictionResult.threshold.toFixed(2)}
                  </p>
                </div>
                <div className="rounded-lg border border-surface-border p-2 text-center">
                  <p className="text-[10px] text-text-muted mb-0.5">Confidence</p>
                  <span
                    className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full border ${
                      confidence === "High confidence"
                        ? "bg-success-bg text-success-text border-success-border"
                        : "bg-warning-bg text-warning-text border-warning-border"
                    }`}
                  >
                    {confidence}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Heatmaps — which atoms / substructures drove this prediction */}
            <div className="rounded-lg border border-surface-border bg-surface-card p-5 space-y-4">
              <div>
                <h2 className="text-sm font-medium text-text-primary">Why this prediction?</h2>
                <p className="text-xs text-text-secondary mt-0.5">
                  Colored by contribution — red supports the prediction, blue opposes it; darker
                  means stronger influence.
                </p>
              </div>

              {heatmapResult ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  {/* Score A: atom_contribution x dict_weight */}
                  <div className="space-y-2">
                    <div className="rounded-lg bg-white border border-surface-border p-2 flex items-center justify-center overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={heatmapResult.score_a_heatmap_png}
                        alt="Score A substructure heatmap"
                        className="max-w-full h-auto"
                      />
                    </div>
                    <div className="space-y-1">
                      {heatmapResult.top_substructures_a.slice(0, 5).map((sub, i) => (
                        <div key={`${sub.token}-${i}`} className="flex items-center justify-between gap-2 text-xs">
                          <span className="flex items-center gap-1.5 text-text-secondary min-w-0">
                            <span
                              className={`h-2 w-2 rounded-full shrink-0 ${
                                sub.direction === "supporting" ? "bg-danger-text" : "bg-primary-500"
                              }`}
                            />
                            <span className="truncate" title={sub.description}>
                              {sub.description}
                            </span>
                            <span className="text-text-muted shrink-0">×{sub.occurrences}</span>
                          </span>
                          <span className="text-text-primary font-mono shrink-0">{sub.percentage.toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Score B: Score A x wl_feature_count */}
                  <div className="space-y-2">
                    <div className="rounded-lg bg-white border border-surface-border p-2 flex items-center justify-center overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={heatmapResult.score_b_heatmap_png}
                        alt="Score B substructure heatmap"
                        className="max-w-full h-auto"
                      />
                    </div>
                    <div className="space-y-1">
                      {heatmapResult.top_substructures_b.slice(0, 5).map((sub, i) => (
                        <div key={`${sub.token}-${i}`} className="flex items-center justify-between gap-2 text-xs">
                          <span className="flex items-center gap-1.5 text-text-secondary min-w-0">
                            <span
                              className={`h-2 w-2 rounded-full shrink-0 ${
                                sub.direction === "supporting" ? "bg-danger-text" : "bg-primary-500"
                              }`}
                            />
                            <span className="truncate" title={sub.description}>
                              {sub.description}
                            </span>
                            <span className="text-text-muted shrink-0">×{sub.occurrences}</span>
                          </span>
                          <span className="text-text-primary font-mono shrink-0">{sub.percentage.toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-text-muted">
                  {heatmapError || "Generating heatmaps…"}
                </p>
              )}
            </div>

            {/* 3. RDKit molecule details */}
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <div className="space-y-3">
                {predictMoleculeData ? (
                  <div className="rounded-lg bg-surface-card border border-surface-border p-4 flex items-center justify-center max-h-[280px] overflow-hidden">
                    <div
                      className="w-full h-full flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-[240px] [&>svg]:h-auto [&>svg]:object-contain"
                      dangerouslySetInnerHTML={{ __html: predictMoleculeData.svg }}
                    />
                  </div>
                ) : (
                  <div className="rounded-lg border border-surface-border bg-surface-card p-6 max-h-[280px] flex items-center justify-center">
                    <p className="text-sm text-text-muted text-center">
                      Molecule visualization unavailable.
                    </p>
                  </div>
                )}
              </div>

              {predictMoleculeData && (
                <div className="rounded-lg border border-surface-border bg-surface-card p-4 grid grid-cols-2 gap-x-4 content-start">
                  <PropRow
                    label="Formula"
                    value={predictMoleculeData.physicochemical.formula}
                  />
                  <PropRow
                    label="Molecular weight"
                    value={`${predictMoleculeData.physicochemical.mw} g/mol`}
                  />
                  <PropRow
                    label="LogP"
                    value={predictMoleculeData.lipophilicity.crippen_logp}
                  />
                  <PropRow
                    label="TPSA"
                    value={`${predictMoleculeData.physicochemical.tpsa} Å²`}
                  />
                  <PropRow
                    label="H-bond donors"
                    value={predictMoleculeData.physicochemical.hbd}
                  />
                  <PropRow
                    label="H-bond acceptors"
                    value={predictMoleculeData.physicochemical.hba}
                  />
                </div>
              )}
            </div>

            {/* Pipeline info */}
            <div className="rounded-lg border border-surface-border bg-surface-card p-4">
              <h2 className="text-sm font-medium text-text-secondary mb-2">Pipeline</h2>
              <p className="text-xs font-mono text-text-muted leading-relaxed">
                SMILES → Graph → WL kernel (3329-dim) → FDDL sparse coding (32-dim) →
                MaxAbsScaler → {predictionResult.model_name}
              </p>
            </div>
          </div>
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
