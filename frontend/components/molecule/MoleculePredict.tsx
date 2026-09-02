"use client";

import { useState, type ReactNode } from "react";
import { CompoundInput } from "@/components/molecule/CompoundInput";
import { PropRow } from "@/components/ui/PropRow";
import { ApiError, getPredictionHeatmap, predictActivity, visualizeMolecule } from "@/lib/api";
import { EXAMPLE_COMPOUNDS, looksLikeSmiles, resolveCompoundName } from "@/lib/smiles";
import type { MoleculeData } from "@/types/molecule";
import type { DiseaseInfo, HeatmapResult, ModelInfo, PredictionResult } from "@/types/prediction";

// How far probability must sit from the decision threshold to call it "high confidence".
const CONFIDENCE_MARGIN = 0.15;

type ResolvedCompound = { name: string; smiles: string; cid: number };

interface MoleculePredictProps {
  modelId: string; // "reference" for Analyze, bundle.id for Predict
  models?: ModelInfo[]; // classifier list for the selector (Predict tab only)
  defaultModel?: string;
  fixedModel?: string; // when set: hide the selector, run this model on Predict
  diseases?: DiseaseInfo[]; // reference/Analyze only; enables the cancer-type selector
  defaultDisease?: string;
  enableHeatmap?: boolean; // true only in Analyze
  showMoleculePreview?: boolean; // Analyze shows the 2D structure; Predict optional
}

// The backend treats auth as optional, but some features may still require it —
// surface a friendly nudge instead of a raw "session expired" error.
function friendlyErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.status === 401) {
    return "Sign in for full access.";
  }
  return err instanceof Error ? err.message : fallback;
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

function InfoIcon() {
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
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function MicroscopeIcon() {
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
      <path d="M6 18h8" />
      <path d="M3 22h18" />
      <path d="M14 22a7 7 0 1 0 0-14h-1" />
      <path d="M9 14h2" />
      <path d="M9 12a2 2 0 0 1-2-2V6h4v4a2 2 0 0 1-2 2Z" />
      <path d="M12 6V3a1 1 0 0 0-1-1H9.5" />
    </svg>
  );
}

function DataIcon() {
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
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h10" />
    </svg>
  );
}

function ToggleIconButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`inline-flex items-center justify-center h-6 w-6 rounded-md border transition-colors duration-150 ${
        active
          ? "border-primary-500 bg-primary-50 text-primary-600"
          : "border-surface-border text-text-muted hover:text-text-primary hover:border-text-muted"
      }`}
    >
      {children}
    </button>
  );
}

export function MoleculePredict({
  modelId,
  models = [],
  defaultModel,
  fixedModel,
  diseases = [],
  defaultDisease,
  enableHeatmap = false,
  showMoleculePreview = false,
}: MoleculePredictProps) {
  const [smiles, setSmiles] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [resolving, setResolving] = useState(false);
  const [resolvingTerm, setResolvingTerm] = useState("");
  const [resolvedInfo, setResolvedInfo] = useState<ResolvedCompound | null>(null);

  const [selectedModel, setSelectedModel] = useState(fixedModel ?? defaultModel ?? "");
  const [selectedDisease, setSelectedDisease] = useState<string>("");
  const effectiveDisease = selectedDisease || defaultDisease || "";
  const [predictionResult, setPredictionResult] = useState<PredictionResult | null>(null);
  const [predictMoleculeData, setPredictMoleculeData] = useState<MoleculeData | null>(null);
  const [heatmapResult, setHeatmapResult] = useState<HeatmapResult | null>(null);
  const [heatmapError, setHeatmapError] = useState("");
  // Within a single heatmap, only one of "info" / "data" can be expanded at a time.
  const [scoreAPanel, setScoreAPanel] = useState<"info" | "data" | null>(null);
  const [scoreBPanel, setScoreBPanel] = useState<"info" | "data" | null>(null);

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

    const tasks: Promise<{ ok: true; kind: "predict" | "visualize" | "heatmap"; value: unknown } | { ok: false; kind: "predict" | "visualize" | "heatmap"; err: unknown }>[] = [
      predictActivity(resolvedSmiles, modelName, modelId, effectiveDisease || undefined)
        .then((value) => ({ ok: true as const, kind: "predict" as const, value }))
        .catch((err: unknown) => ({ ok: false as const, kind: "predict" as const, err })),
    ];

    if (showMoleculePreview) {
      tasks.push(
        visualizeMolecule(resolvedSmiles)
          .then((value) => ({ ok: true as const, kind: "visualize" as const, value }))
          .catch((err: unknown) => ({ ok: false as const, kind: "visualize" as const, err })),
      );
    }

    if (enableHeatmap) {
      tasks.push(
        getPredictionHeatmap(resolvedSmiles, modelName, modelId, effectiveDisease || undefined)
          .then((value) => ({ ok: true as const, kind: "heatmap" as const, value }))
          .catch((err: unknown) => ({ ok: false as const, kind: "heatmap" as const, err })),
      );
    }

    // Run all endpoints concurrently, independently — one failing shouldn't block the others.
    const outcomes = await Promise.all(tasks);

    for (const outcome of outcomes) {
      if (outcome.kind === "predict") {
        if (outcome.ok) {
          setPredictionResult(outcome.value as PredictionResult);
        } else {
          setError(friendlyErrorMessage(outcome.err, "Failed to connect to the backend."));
        }
      } else if (outcome.kind === "visualize") {
        if (outcome.ok) setPredictMoleculeData(outcome.value as MoleculeData);
      } else if (outcome.kind === "heatmap") {
        if (outcome.ok) {
          setHeatmapResult(outcome.value as HeatmapResult);
        } else {
          setHeatmapError(friendlyErrorMessage(outcome.err, "Heatmap unavailable."));
        }
      }
    }

    setLoading(false);
  }

  function handleSubmit() {
    const model = fixedModel ?? selectedModel;
    if (model) runPrediction(model);
  }

  function handleClearSmiles() {
    setSmiles("");
    setError("");
    setPredictionResult(null);
    setPredictMoleculeData(null);
    setHeatmapResult(null);
    setHeatmapError("");
    setSelectedModel(fixedModel ?? "");
    setResolvedInfo(null);
  }

  function handleSmilesChange(value: string) {
    setSmiles(value);
    setResolvedInfo(null);
  }

  function handleSelectExample(exampleSmiles: string) {
    setSmiles(exampleSmiles);
    setError("");
    setPredictionResult(null);
    setPredictMoleculeData(null);
    setHeatmapResult(null);
    setHeatmapError("");
    setSelectedModel(fixedModel ?? "");
    setResolvedInfo(null);
  }

  function handleSelectDisease(id: string) {
    setSelectedDisease(id);
    setPredictionResult(null);
    setPredictMoleculeData(null);
    setHeatmapResult(null);
    setHeatmapError("");
    setError("");
  }

  const confidence =
    predictionResult &&
    (Math.abs(predictionResult.probability - predictionResult.threshold) >= CONFIDENCE_MARGIN
      ? "High confidence"
      : "Low confidence");

  const hasResults = loading || Boolean(predictionResult);

  return (
    <div className="space-y-6">
      {/* Cancer-type selector — reference/Analyze only */}
      {diseases.length > 0 && (
        <div className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-primary-500 font-medium">
            <MicroscopeIcon />
            Cancer type
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {diseases.map((d) => {
              const isSelected = effectiveDisease === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => handleSelectDisease(d.id)}
                  aria-pressed={isSelected}
                  className={`text-left rounded-lg border py-2.5 px-3 transition-all duration-150 ${
                    isSelected
                      ? "border-primary-500 bg-primary-50 ring-1 ring-primary-200"
                      : "border-surface-border bg-surface-card hover:border-primary-200 hover:bg-primary-50/50"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`h-2.5 w-2.5 rounded-full border shrink-0 ${
                        isSelected ? "border-primary-500 bg-primary-500" : "border-surface-border"
                      }`}
                    />
                    <span className="text-xs font-medium text-text-primary truncate">{d.label}</span>
                  </div>
                  <p className="mt-1 text-[10px] text-text-muted">NCI-{d.nci_id}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Compound name / SMILES input */}
      <CompoundInput
        value={smiles}
        onChange={handleSmilesChange}
        onSubmit={handleSubmit}
        onClear={handleClearSmiles}
        onSelectExample={handleSelectExample}
        examples={EXAMPLE_COMPOUNDS}
        resolving={resolving}
        resolvingTerm={resolvingTerm}
        resolved={resolvedInfo}
        submitSlot={
          fixedModel ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || resolving || !smiles.trim()}
              className="shrink-0 inline-flex items-center gap-2 rounded-md bg-primary-500 px-8 py-3 text-sm font-semibold text-white hover:bg-primary-600 active:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
            >
              <ActivityIcon />
              {resolving ? "Looking up…" : loading ? "Predicting…" : "Predict"}
            </button>
          ) : undefined
        }
      />

      {/* Classifier selector — clicking a model runs the prediction */}
      {!fixedModel && (
        <div className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-primary-500 font-medium">
            <ActivityIcon />
            Choose a model
          </h2>
          {models.length === 0 && <p className="text-sm text-text-muted">Loading models…</p>}
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
                            isSelected ? "border-primary-500 bg-primary-500" : "border-surface-border"
                          }`}
                        />
                        <span className="text-xs font-medium text-text-primary truncate">
                          {loading && isSelected ? "Predicting…" : model.name}
                        </span>
                      </div>
                      <span
                        className="flex flex-col items-end shrink-0"
                        title="ROC-AUC — higher is better"
                      >
                        <span className="text-[9px] uppercase tracking-wide text-text-muted">
                          ROC-AUC
                        </span>
                        <span className="text-[10px] text-text-secondary font-mono">
                          {model.roc_auc.toFixed(3)}
                        </span>
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

      {loading && (
        <div className="animate-fade-in grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-lg border border-surface-border bg-primary-50/40 min-h-[300px] flex items-center justify-center">
            <p className="text-sm text-text-secondary">Rendering molecule…</p>
          </div>
          <div className="rounded-lg border border-surface-border bg-primary-50/40 min-h-[300px] flex items-center justify-center">
            <p className="text-sm text-text-secondary">Running prediction…</p>
          </div>
        </div>
      )}

      {!loading && predictionResult && (
        <div className="animate-fade-in space-y-6">
          {/* 1. Prediction result */}
          <div className="rounded-lg border border-surface-border bg-surface-card p-5 space-y-4">
            <div>
              <div className="flex items-baseline gap-3">
                <p
                  className={`text-3xl font-bold ${
                    predictionResult.prediction === "Active" ? "text-success-text" : "text-danger-text"
                  }`}
                >
                  {predictionResult.prediction}
                </p>
                <p className="text-3xl font-bold text-text-primary">
                  {(predictionResult.probability * 100).toFixed(1)}%
                </p>
                <p className="text-xs text-text-muted">probability</p>
              </div>
              <p className="mt-2 text-sm text-text-secondary">
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
                title="Decision threshold"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-surface-border p-2 text-center">
                <p className="text-[10px] text-text-muted mb-0.5">Model</p>
                <p className="text-xs text-text-primary truncate">{predictionResult.model_name}</p>
              </div>
              <div
                className="rounded-lg border border-surface-border p-2 text-center"
                title="A molecule is called Active when its predicted probability is at or above this cutoff."
              >
                <p className="text-[10px] text-text-muted mb-0.5">Threshold</p>
                <p className="text-xs text-text-primary">{predictionResult.threshold.toFixed(2)}</p>
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

          {/* 2. Heatmaps — which atoms / substructures drove this prediction (reference model only) */}
          {enableHeatmap && (
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

                    <div className="flex items-center gap-1.5">
                      <ToggleIconButton
                        label="What does this show?"
                        active={scoreAPanel === "info"}
                        onClick={() => setScoreAPanel((v) => (v === "info" ? null : "info"))}
                      >
                        <InfoIcon />
                      </ToggleIconButton>
                      <ToggleIconButton
                        label="View underlying data"
                        active={scoreAPanel === "data"}
                        onClick={() => setScoreAPanel((v) => (v === "data" ? null : "data"))}
                      >
                        <DataIcon />
                      </ToggleIconButton>
                    </div>

                    {scoreAPanel === "info" && (
                      <p className="text-xs text-text-secondary bg-surface-bg rounded-md p-2.5">
                        Score A multiplies each atom&apos;s raw contribution by its weight in the
                        trained sparse dictionary. It highlights atoms whose learned features drove
                        the prediction most strongly, on their own.
                      </p>
                    )}

                    {scoreAPanel === "data" && (
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
                    )}
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

                    <div className="flex items-center gap-1.5">
                      <ToggleIconButton
                        label="What does this show?"
                        active={scoreBPanel === "info"}
                        onClick={() => setScoreBPanel((v) => (v === "info" ? null : "info"))}
                      >
                        <InfoIcon />
                      </ToggleIconButton>
                      <ToggleIconButton
                        label="View underlying data"
                        active={scoreBPanel === "data"}
                        onClick={() => setScoreBPanel((v) => (v === "data" ? null : "data"))}
                      >
                        <DataIcon />
                      </ToggleIconButton>
                    </div>

                    {scoreBPanel === "info" && (
                      <p className="text-xs text-text-secondary bg-surface-bg rounded-md p-2.5">
                        Score B refines Score A by scaling it with how often that atom&apos;s
                        structural pattern (WL feature) recurs in the molecule. It highlights atoms
                        whose influence is reinforced by a repeated structural motif, not just an
                        isolated one.
                      </p>
                    )}

                    {scoreBPanel === "data" && (
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
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-text-muted">{heatmapError || "Generating heatmaps…"}</p>
              )}
            </div>
          )}

          {/* 3. RDKit molecule details */}
          {showMoleculePreview && (
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
                  <PropRow label="Formula" value={predictMoleculeData.physicochemical.formula} />
                  <PropRow
                    label="Molecular weight"
                    value={`${predictMoleculeData.physicochemical.mw} g/mol`}
                  />
                  <PropRow label="LogP" value={predictMoleculeData.lipophilicity.crippen_logp} />
                  <PropRow label="TPSA" value={`${predictMoleculeData.physicochemical.tpsa} Å²`} />
                  <PropRow label="H-bond donors" value={predictMoleculeData.physicochemical.hbd} />
                  <PropRow label="H-bond acceptors" value={predictMoleculeData.physicochemical.hba} />
                </div>
              )}
            </div>
          )}

          {/* Pipeline info */}
          <div className="rounded-lg border border-surface-border bg-surface-card p-4">
            <h2 className="text-sm font-medium text-text-secondary mb-2">Pipeline</h2>
            <p className="text-xs font-mono text-text-muted leading-relaxed">
              SMILES → Graph → WL kernel → FDDL sparse coding → MaxAbsScaler →{" "}
              {predictionResult.model_name}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
