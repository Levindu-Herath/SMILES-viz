"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { RadarChart } from "@/components/molecule/RadarChart";
import { PropRow } from "@/components/ui/PropRow";
import { SectionCard } from "@/components/ui/SectionCard";
import { EXAMPLE_MOLECULES } from "@/constants/molecules";
import { getAvailableModels, predictActivity, visualizeMolecule } from "@/lib/api";
import type { MoleculeData } from "@/types/molecule";
import type { ModelInfo, PredictionResult } from "@/types/prediction";

// How far probability must sit from the decision threshold to call it "high confidence".
const CONFIDENCE_MARGIN = 0.15;

function PredictPage() {
  const router = useRouter();

  const [smiles, setSmiles] = useState("");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [modelsError, setModelsError] = useState("");
  const [predictionResult, setPredictionResult] = useState<PredictionResult | null>(null);
  const [moleculeData, setMoleculeData] = useState<MoleculeData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getAvailableModels()
      .then((data) => {
        setModels(data.models);
        setSelectedModel(data.default_model);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.message.includes("Session expired")) {
          router.push("/login");
          return;
        }
        setModelsError(
          err instanceof Error ? err.message : "Failed to load available models.",
        );
      });
  }, [router]);

  async function handlePredict() {
    const trimmed = smiles.trim();
    if (!trimmed || loading || !selectedModel) return;

    setLoading(true);
    setError("");
    setPredictionResult(null);
    setMoleculeData(null);

    const [predictOutcome, visualizeOutcome] = await Promise.all([
      predictActivity(trimmed, selectedModel)
        .then((value) => ({ ok: true as const, value }))
        .catch((err: unknown) => ({ ok: false as const, err })),
      visualizeMolecule(trimmed)
        .then((value) => ({ ok: true as const, value }))
        .catch((err: unknown) => ({ ok: false as const, err })),
    ]);

    if (predictOutcome.ok) {
      setPredictionResult(predictOutcome.value);
    } else {
      const err = predictOutcome.err;
      if (err instanceof Error && err.message.includes("Session expired")) {
        router.push("/login");
        setLoading(false);
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to connect to the backend.");
    }

    if (visualizeOutcome.ok) {
      setMoleculeData(visualizeOutcome.value);
    }

    setLoading(false);
  }

  const confidence =
    predictionResult &&
    (Math.abs(predictionResult.probability - predictionResult.threshold) >= CONFIDENCE_MARGIN
      ? "High confidence"
      : "Low confidence");

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-8 space-y-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Activity Prediction
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Enter a SMILES string and choose a model to predict biological activity.
          </p>
        </div>

        {/* SMILES input */}
        <section>
          <label
            htmlFor="smiles-input"
            className="block text-sm font-medium text-slate-400 mb-2"
          >
            Enter a SMILES string
          </label>
          <input
            id="smiles-input"
            type="text"
            value={smiles}
            onChange={(e) => setSmiles(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handlePredict();
            }}
            placeholder="e.g. CC(=O)Oc1ccccc1C(=O)O"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-base font-mono placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-colors"
            spellCheck={false}
            autoComplete="off"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="text-xs text-slate-500 self-center mr-1">Try:</span>
            {EXAMPLE_MOLECULES.map((m) => (
              <button
                key={m.smiles}
                type="button"
                onClick={() => setSmiles(m.smiles)}
                className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400 hover:border-emerald-600 hover:text-emerald-400 transition-colors"
              >
                {m.name}
              </button>
            ))}
          </div>
        </section>

        {/* Model selector */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-sm font-medium text-slate-400 mb-4">Model</h2>
          {modelsError && (
            <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              {modelsError}
            </div>
          )}
          {!modelsError && models.length === 0 && (
            <p className="text-sm text-slate-500">Loading models…</p>
          )}
          {models.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {models.map((model) => (
                <label
                  key={model.name}
                  className={`flex items-center justify-between rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                    selectedModel === model.name
                      ? "border-emerald-600 bg-emerald-500/10"
                      : "border-slate-700 hover:border-slate-600"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="model"
                      value={model.name}
                      checked={selectedModel === model.name}
                      onChange={() => setSelectedModel(model.name)}
                      className="accent-emerald-500"
                    />
                    <span className="text-sm text-slate-200">{model.name}</span>
                  </span>
                  <span className="text-xs text-slate-500">
                    AUC {model.roc_auc.toFixed(3)}
                  </span>
                </label>
              ))}
            </div>
          )}
        </section>

        {/* Predict button */}
        <button
          type="button"
          onClick={handlePredict}
          disabled={loading || !selectedModel || !smiles.trim()}
          className="w-full rounded-lg bg-emerald-600 py-3.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Predicting…" : "Predict"}
        </button>

        {error && (
          <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-5 py-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading && (
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/40 min-h-[300px] flex items-center justify-center">
              <p className="text-sm text-slate-500">Rendering molecule…</p>
            </div>
            <div className="lg:col-span-3 rounded-xl border border-slate-800 bg-slate-900/40 min-h-[300px] flex items-center justify-center">
              <p className="text-sm text-slate-500">Running prediction…</p>
            </div>
          </div>
        )}

        {!loading && predictionResult && (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-5">
              {/* Left: molecule structure */}
              <div className="lg:col-span-2 flex justify-center">
                {moleculeData ? (
                  <div className="w-full max-w-[400px] rounded-xl border border-slate-800 bg-white p-6 flex items-center justify-center min-h-[300px] overflow-hidden">
                    <div
                      className="w-full [&>svg]:max-w-full [&>svg]:h-auto"
                      dangerouslySetInnerHTML={{ __html: moleculeData.svg }}
                    />
                  </div>
                ) : (
                  <div className="w-full max-w-[400px] rounded-xl border border-slate-800 bg-slate-900/40 p-6 min-h-[300px] flex items-center justify-center">
                    <p className="text-sm text-slate-500 text-center">
                      Molecule visualization unavailable.
                    </p>
                  </div>
                )}
              </div>

              {/* Right: prediction results */}
              <div className="lg:col-span-3 rounded-xl border border-slate-800 bg-slate-900/60 p-8 space-y-6">
                <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-6 text-center sm:text-left">
                  <div>
                    <p className="text-xs text-slate-500 mb-1.5">Prediction</p>
                    <span
                      className={`inline-block rounded-full px-5 py-2 text-2xl font-bold ${
                        predictionResult.prediction === "Active"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-red-500/20 text-red-400"
                      }`}
                    >
                      {predictionResult.prediction}
                    </span>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-xs text-slate-500 mb-1.5">Probability</p>
                    <span className="text-5xl font-bold text-slate-100">
                      {(predictionResult.probability * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>

                <div>
                  <div className="relative h-2.5 rounded-full bg-slate-800 w-full">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-emerald-500"
                      style={{ width: `${predictionResult.probability * 100}%` }}
                    />
                    <div
                      className="absolute inset-y-0 w-0.5 bg-slate-300"
                      style={{ left: `${predictionResult.threshold * 100}%` }}
                      title={`Threshold: ${predictionResult.threshold}`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-800">
                  <div className="text-center">
                    <p className="text-xs text-slate-500 mb-1.5">Model</p>
                    <p className="text-sm text-slate-200">{predictionResult.model_name}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-500 mb-1.5">Threshold</p>
                    <p className="text-sm text-slate-200">
                      {predictionResult.threshold.toFixed(2)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-500 mb-1.5">Confidence</p>
                    <span
                      className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded-full border ${
                        confidence === "High confidence"
                          ? "bg-emerald-900/50 text-emerald-400 border-emerald-700/50"
                          : "bg-amber-900/50 text-amber-400 border-amber-700/50"
                      }`}
                    >
                      {confidence}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Molecular properties + bioavailability radar */}
            {moleculeData && (
              <div className="grid gap-6 lg:grid-cols-2">
                <SectionCard title="Molecular properties">
                  <PropRow label="Formula" value={moleculeData.physicochemical.formula} />
                  <PropRow
                    label="Molecular weight"
                    value={`${moleculeData.physicochemical.mw} g/mol`}
                  />
                  <PropRow label="LogP" value={moleculeData.lipophilicity.crippen_logp} />
                  <PropRow label="TPSA" value={`${moleculeData.physicochemical.tpsa} Å²`} />
                  <PropRow label="H-bond donors" value={moleculeData.physicochemical.hbd} />
                  <PropRow label="H-bond acceptors" value={moleculeData.physicochemical.hba} />
                </SectionCard>

                <SectionCard title="Bioavailability radar">
                  <div className="flex justify-center">
                    <RadarChart data={moleculeData.radar} />
                  </div>
                </SectionCard>
              </div>
            )}
          </div>
        )}

        {/* Pipeline info */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
          <h2 className="text-sm font-medium text-slate-400 mb-3">Pipeline</h2>
          <p className="text-xs font-mono text-slate-500 leading-relaxed">
            SMILES → Graph → WL kernel (3329-dim) → FDDL sparse coding (32-dim) → MaxAbsScaler → {selectedModel || "Classifier"}
          </p>
        </section>
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <AuthGuard>
      <PredictPage />
    </AuthGuard>
  );
}
