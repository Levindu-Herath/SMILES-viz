"use client";

import { useState } from "react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { EXAMPLE_MOLECULES } from "@/constants/molecules";

interface PredictionResult {
  prediction: "Active" | "Inactive";
  probability: number;
  threshold: number;
  model: string;
}

const MODELS = [
  {
    id: "logistic_regression",
    name: "Logistic Regression",
    rocAuc: "0.778",
  },
  {
    id: "gradient_boosting",
    name: "Gradient Boosting",
    rocAuc: "0.805",
  },
  {
    id: "linear_svm",
    name: "Linear SVM",
    rocAuc: "0.799",
  },
  {
    id: "random_forest",
    name: "Random Forest",
    rocAuc: "0.809",
  },
] as const;

function PredictPage() {
  const [smiles, setSmiles] = useState("");
  const [selectedModel, setSelectedModel] = useState<(typeof MODELS)[number]["id"]>(MODELS[0].id);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handlePredict() {
    const trimmed = smiles.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      // TODO: Replace with actual API call once backend endpoint is built
      throw new Error("Prediction endpoint not yet connected.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to connect to the backend.");
    } finally {
      setLoading(false);
    }
  }

  const selectedModelName = MODELS.find((m) => m.id === selectedModel)?.name ?? "";

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
          <div className="flex gap-3">
            <input
              id="smiles-input"
              type="text"
              value={smiles}
              onChange={(e) => setSmiles(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handlePredict();
              }}
              placeholder="e.g. CC(=O)Oc1ccccc1C(=O)O"
              className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-base font-mono placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-colors"
              spellCheck={false}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={handlePredict}
              disabled={loading}
              className="rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {loading ? "Predicting…" : "Predict"}
            </button>
          </div>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {MODELS.map((model) => (
              <label
                key={model.id}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                  selectedModel === model.id
                    ? "border-emerald-600 bg-emerald-500/10"
                    : "border-slate-700 hover:border-slate-600"
                }`}
              >
                <span className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="model"
                    value={model.id}
                    checked={selectedModel === model.id}
                    onChange={() => setSelectedModel(model.id)}
                    className="accent-emerald-500"
                  />
                  <span className="text-sm text-slate-200">{model.name}</span>
                </span>
                <span className="text-xs text-slate-500">AUC {model.rocAuc}</span>
              </label>
            ))}
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-5 py-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {result && (
          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-400">Prediction</h2>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  result.prediction === "Active"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-red-500/20 text-red-400"
                }`}
              >
                {result.prediction}
              </span>
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                <span>Probability</span>
                <span>{(result.probability * 100).toFixed(1)}%</span>
              </div>
              <div className="relative h-2 rounded-full bg-slate-800">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-emerald-500"
                  style={{ width: `${result.probability * 100}%` }}
                />
                <div
                  className="absolute inset-y-0 w-0.5 bg-slate-300"
                  style={{ left: `${result.threshold * 100}%` }}
                  title={`Threshold: ${result.threshold}`}
                />
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Threshold: {result.threshold.toFixed(2)}
              </div>
            </div>

            <p className="text-xs text-slate-500">Model: {result.model}</p>
          </section>
        )}

        {/* Pipeline info */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
          <h2 className="text-sm font-medium text-slate-400 mb-3">Pipeline</h2>
          <p className="text-xs font-mono text-slate-500 leading-relaxed">
            SMILES → Graph → WL kernel (3329-dim) → FDDL sparse coding (32-dim) → MaxAbsScaler → {selectedModelName || "Classifier"}
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
