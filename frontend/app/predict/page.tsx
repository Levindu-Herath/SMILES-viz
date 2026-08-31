"use client";

import { useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { useAuth } from "@/components/auth/AuthProvider";
import { MoleculePredict } from "@/components/molecule/MoleculePredict";
import { listMyModels } from "@/lib/api";
import type { ModelBundle } from "@/types/model";
import type { ModelInfo } from "@/types/prediction";

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-7 w-7">
      <rect x="5" y="11" width="14" height="9" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function bestRocAuc(metrics: ModelBundle["metrics"]): string {
  const values = Object.values(metrics)
    .map((m) => m.roc_auc)
    .filter((v): v is number => typeof v === "number");
  if (values.length === 0) return "—";
  return Math.max(...values).toFixed(3);
}

function bundleToModelInfos(bundle: ModelBundle): ModelInfo[] {
  return bundle.available_models.map((name) => ({
    name,
    accuracy: bundle.metrics[name]?.accuracy ?? 0,
    roc_auc: bundle.metrics[name]?.roc_auc ?? 0,
    threshold: 0.5,
  }));
}

function PredictPage() {
  const { user, loading: authLoading } = useAuth();

  const [models, setModels] = useState<ModelBundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<ModelBundle | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    listMyModels()
      .then((data) => setModels(data.models))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load your models.");
      })
      .finally(() => setLoading(false));
  }, [user]);

  if (authLoading) {
    return (
      <main className="min-h-screen bg-surface-bg text-text-primary">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <p className="text-sm text-text-muted">Loading…</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-surface-bg text-text-primary">
        <div className="mx-auto max-w-4xl px-6 py-16">
          <div className="flex flex-col items-center justify-center rounded-xl border border-surface-border bg-surface-card p-12 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-bg text-text-muted">
              <LockIcon />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-text-primary">Sign in required</h2>
            <p className="mb-6 text-sm text-text-secondary">
              Sign in to predict with your published models.
            </p>
            <a
              href="/login"
              className="rounded-lg bg-primary-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 active:bg-primary-700 transition-colors duration-150"
            >
              Sign in
            </a>
          </div>
        </div>
      </main>
    );
  }

  if (selected) {
    return (
      <main className="min-h-screen bg-surface-bg text-text-primary">
        <div className="mx-auto max-w-6xl px-6 py-8 space-y-4">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-primary-500 transition-colors duration-150"
          >
            <BackIcon />
            Back to models
          </button>

          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{selected.name}</h1>
            {selected.dataset && (
              <p className="mt-1 text-sm text-text-secondary">Trained on {selected.dataset}</p>
            )}
          </div>

          <MoleculePredict
            modelId={selected.id}
            models={bundleToModelInfos(selected)}
            defaultModel={selected.default_model}
            enableHeatmap={false}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface-bg text-text-primary">
      <div className="mx-auto max-w-6xl px-6 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Predict</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Run predictions against models you&apos;ve trained and published.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-danger-border bg-danger-bg px-5 py-4 text-sm text-danger-text">
            {error}
          </div>
        )}

        {loading && <p className="text-sm text-text-muted">Loading your models…</p>}

        {!loading && !error && models.length === 0 && (
          <div className="rounded-lg border border-surface-border bg-surface-card p-10 text-center space-y-2">
            <p className="text-sm text-text-muted">No published models yet.</p>
            <p className="text-sm text-text-muted">
              <a href="/train" className="text-primary-500 hover:underline">
                Train a model
              </a>
              , then publish it to predict with it here.
            </p>
          </div>
        )}

        {!loading && models.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {models.map((bundle) => (
              <button
                key={bundle.id}
                type="button"
                onClick={() => setSelected(bundle)}
                className="text-left rounded-lg border border-surface-border bg-surface-card p-5 space-y-3 hover:border-primary-200 transition-colors duration-150"
              >
                <div>
                  <h3 className="text-sm font-medium text-text-primary truncate">{bundle.name}</h3>
                  {bundle.dataset && (
                    <p className="mt-0.5 text-xs text-text-muted truncate">{bundle.dataset}</p>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-text-secondary">
                  <span>
                    {bundle.available_models.length} classifier
                    {bundle.available_models.length === 1 ? "" : "s"}
                  </span>
                  <span>ROC-AUC {bestRocAuc(bundle.metrics)}</span>
                </div>
                <p className="text-xs text-text-muted">{formatDate(bundle.created_at)}</p>
              </button>
            ))}
          </div>
        )}
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
