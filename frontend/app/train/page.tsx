"use client";

import { useEffect, useRef, useState } from "react";
import { FolderBrowserModal } from "@/components/FolderBrowserModal";
import {
  checkTrainerHealth,
  getTrainingResult,
  getTrainingStatus,
  startTraining,
  subscribeToTraining,
  uploadDatasetFile,
  validateDataset,
  type DatasetValidationResult,
  type JobStatus,
  type TrainingResult,
} from "@/lib/trainer-api";

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
      <path
        d="M6 3.5h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 3.5v4h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
      <path
        d="M3.5 6.5a1 1 0 0 1 1-1H9l2 2h8.5a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-12Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 animate-spin">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const CLASSIFIERS = [
  { value: "logistic_regression", label: "Logistic Regression" },
  { value: "gradient_boosting", label: "Gradient Boosting" },
  { value: "linear_svm", label: "Linear SVM" },
  { value: "random_forest", label: "Random Forest" },
] as const;

const JOB_ID_STORAGE_KEY = "smiles-viz-trainer-job-id";

type PageState = "checking" | "disconnected" | "form" | "training" | "complete" | "failed";

function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatMetricLabel(key: string): string {
  const labels: Record<string, string> = {
    accuracy: "Accuracy",
    precision: "Precision",
    recall: "Recall",
    f1_score: "F1-Score",
    roc_auc: "ROC-AUC",
    pr_auc: "PR-AUC",
    threshold: "Threshold",
  };
  return labels[key] ?? key;
}

export default function TrainPage() {
  const [pageState, setPageState] = useState<PageState>("checking");

  // Dataset / form state
  const [filePath, setFilePath] = useState("");
  const [validating, setValidating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [validation, setValidation] = useState<DatasetValidationResult | null>(null);
  const [validationError, setValidationError] = useState("");
  const [showInvalidRows, setShowInvalidRows] = useState(false);
  const [smilesColumn, setSmilesColumn] = useState("");
  const [targetColumn, setTargetColumn] = useState("");
  const [classifier, setClassifier] = useState<string>(CLASSIFIERS[0].value);
  const [outputDir, setOutputDir] = useState("");
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [startError, setStartError] = useState("");
  const [starting, setStarting] = useState(false);

  // Training progress state
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [trainingStartedAt, setTrainingStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<TrainingResult | null>(null);
  const [failureError, setFailureError] = useState("");

  const unsubscribeRef = useRef<(() => void) | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function clearFilePath() {
    setFilePath("");
    setValidation(null);
    setValidationError("");
    setUploadError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleBrowseClick() {
    fileInputRef.current?.click();
  }

  function clearOutputDir() {
    setOutputDir("");
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError("");
    setValidation(null);
    setValidationError("");
    try {
      const path = await uploadDatasetFile(file);
      setFilePath(path);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Failed to upload file.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function cleanupSubscription() {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
  }

  function beginStreaming(id: string) {
    cleanupSubscription();
    unsubscribeRef.current = subscribeToTraining(
      id,
      (status) => {
        setJobStatus(status);
      },
      (finalResult) => {
        setResult(finalResult);
        setPageState("complete");
        sessionStorage.removeItem(JOB_ID_STORAGE_KEY);
        cleanupSubscription();
      },
      (error) => {
        setFailureError(error);
        setPageState("failed");
        sessionStorage.removeItem(JOB_ID_STORAGE_KEY);
        cleanupSubscription();
      },
    );
  }

  async function checkConnection() {
    setPageState("checking");
    const connected = await checkTrainerHealth();
    if (!connected) {
      setPageState("disconnected");
      return;
    }

    // If there's an in-flight job from before a navigation/refresh, resume it.
    const storedJobId = sessionStorage.getItem(JOB_ID_STORAGE_KEY);
    if (storedJobId) {
      try {
        const status = await getTrainingStatus(storedJobId);
        if (status.status === "COMPLETED") {
          const finalResult = await getTrainingResult(storedJobId);
          setResult(finalResult);
          setPageState("complete");
          sessionStorage.removeItem(JOB_ID_STORAGE_KEY);
          return;
        }
        if (status.status === "FAILED") {
          setFailureError(status.error ?? "Training failed");
          setPageState("failed");
          sessionStorage.removeItem(JOB_ID_STORAGE_KEY);
          return;
        }
        // Still running — resume the stream.
        setJobStatus(status);
        setTrainingStartedAt(Date.parse(status.created_at));
        setPageState("training");
        beginStreaming(storedJobId);
        return;
      } catch {
        sessionStorage.removeItem(JOB_ID_STORAGE_KEY);
      }
    }

    setPageState("form");
  }

  useEffect(() => {
    checkConnection();
    return () => cleanupSubscription();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Elapsed time ticker while training.
  useEffect(() => {
    if (pageState !== "training" || trainingStartedAt === null) return;
    const tick = () => setElapsed((Date.now() - trainingStartedAt) / 1000);
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [pageState, trainingStartedAt]);

  async function handleValidate() {
    if (!filePath.trim() || validating) return;
    setValidating(true);
    setValidationError("");
    setValidation(null);
    try {
      const data = await validateDataset(filePath.trim());
      setValidation(data);
      setSmilesColumn(data.detected_smiles_column ?? "");
      setTargetColumn(data.detected_target_column ?? "");
    } catch (err: unknown) {
      setValidationError(err instanceof Error ? err.message : "Failed to validate dataset.");
    } finally {
      setValidating(false);
    }
  }

  async function handleStartTraining() {
    if (!validation?.is_valid || starting) return;
    setStarting(true);
    setStartError("");
    try {
      const res = await startTraining({
        file_path: filePath.trim(),
        smiles_column: smilesColumn || undefined,
        target_column: targetColumn || undefined,
        classifier,
        output_dir: outputDir.trim() || undefined,
      });
      sessionStorage.setItem(JOB_ID_STORAGE_KEY, res.job_id);
      setJobStatus(null);
      setTrainingStartedAt(Date.now());
      setElapsed(0);
      setPageState("training");
      beginStreaming(res.job_id);
    } catch (err: unknown) {
      setStartError(err instanceof Error ? err.message : "Failed to start training.");
    } finally {
      setStarting(false);
    }
  }

  function resetToForm() {
    cleanupSubscription();
    sessionStorage.removeItem(JOB_ID_STORAGE_KEY);
    setJobStatus(null);
    setResult(null);
    setFailureError("");
    setTrainingStartedAt(null);
    setElapsed(0);
    setStartError("");
    setPageState("form");
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-3xl px-6 py-8 space-y-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Train</h1>
            <p className="mt-1 text-sm text-slate-400">
              Train a molecular activity classifier using your local trainer server.
            </p>
          </div>
          {pageState !== "checking" && pageState !== "disconnected" && (
            <div className="flex items-center gap-2 shrink-0">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-xs text-slate-400">Trainer Connected</span>
            </div>
          )}
        </div>

        {pageState === "checking" && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-10 text-center">
            <p className="text-sm text-slate-500">Checking for local trainer…</p>
          </div>
        )}

        {pageState === "disconnected" && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-8 space-y-5">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              <h2 className="text-base font-semibold text-slate-100">Local Trainer Not Detected</h2>
            </div>
            <p className="text-sm text-slate-400">
              The Train page talks to a local training server running on your machine at{" "}
              <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-300">
                http://localhost:5000
              </code>
              . Install and start it, then retry the connection.
            </p>
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Setup</p>
              <pre className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 text-xs text-slate-300 overflow-x-auto">
                pip install smiles-viz-trainer{"\n"}smiles-train
              </pre>
            </div>
            <button
              type="button"
              onClick={checkConnection}
              className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors"
            >
              Retry Connection
            </button>
          </div>
        )}

        {pageState === "form" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1.5">
                  Dataset file path
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={filePath}
                      onChange={(e) => {
                        setFilePath(e.target.value);
                        setValidation(null);
                        setValidationError("");
                      }}
                      placeholder="C:\path\to\dataset.csv"
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 pl-4 pr-9 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-colors font-mono"
                    />
                    {filePath && (
                      <button
                        type="button"
                        onClick={clearFilePath}
                        aria-label="Clear file path"
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-full text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.tsv"
                    onChange={handleFileSelected}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={handleBrowseClick}
                    disabled={uploading}
                    aria-label="Browse for a dataset file"
                    title="Browse for a dataset file"
                    className="shrink-0 flex items-center justify-center rounded-lg border border-slate-700 px-3.5 py-2.5 text-slate-200 hover:border-emerald-600 hover:text-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {uploading ? <SpinnerIcon /> : <FileIcon />}
                  </button>
                  <button
                    type="button"
                    onClick={handleValidate}
                    disabled={!filePath.trim() || validating}
                    className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-200 hover:border-emerald-600 hover:text-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                  >
                    {validating ? "Validating…" : "Validate"}
                  </button>
                </div>
              </div>

              {uploadError && (
                <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
                  {uploadError}
                </div>
              )}

              {validationError && (
                <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
                  {validationError}
                </div>
              )}

              {validation && (
                <div className="space-y-3">
                  {validation.errors.length > 0 && (
                    <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-4 py-3 text-sm text-red-300 space-y-1">
                      {validation.errors.map((e, i) => (
                        <p key={i}>{e}</p>
                      ))}
                    </div>
                  )}

                  {validation.warnings.length > 0 && (
                    <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-300 space-y-1">
                      {validation.warnings.map((w, i) => (
                        <p key={i}>{w}</p>
                      ))}
                    </div>
                  )}

                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-slate-500">Total rows</p>
                      <p className="text-slate-200 font-medium">{validation.total_rows}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Valid SMILES</p>
                      <p className="text-slate-200 font-medium">{validation.valid_smiles}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Invalid SMILES</p>
                      <p className="text-slate-200 font-medium">{validation.invalid_smiles}</p>
                    </div>
                    {Object.keys(validation.target_value_counts).length > 0 && (
                      <div className="col-span-2 sm:col-span-3">
                        <p className="text-xs text-slate-500 mb-1">Target distribution</p>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(validation.target_value_counts).map(([label, count]) => (
                            <span
                              key={label}
                              className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-300"
                            >
                              {label}: {count}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {validation.invalid_rows.length > 0 && (
                    <div className="rounded-lg border border-slate-800 bg-slate-950/60">
                      <button
                        type="button"
                        onClick={() => setShowInvalidRows((v) => !v)}
                        className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        <span>
                          {showInvalidRows ? "Hide" : "Show"} {validation.invalid_rows.length} invalid row(s)
                        </span>
                        <span>{showInvalidRows ? "▲" : "▼"}</span>
                      </button>
                      {showInvalidRows && (
                        <div className="border-t border-slate-800 px-4 py-3 space-y-1.5 max-h-48 overflow-y-auto">
                          {validation.invalid_rows.map((row) => (
                            <p key={row.row} className="text-xs text-slate-500 font-mono">
                              Row {row.row}: <span className="text-slate-400">{row.smiles}</span> —{" "}
                              {row.error}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {validation?.is_valid && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-5">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1.5">
                      SMILES column
                    </label>
                    <select
                      value={smilesColumn}
                      onChange={(e) => setSmilesColumn(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-colors"
                    >
                      {validation.columns.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1.5">
                      Target column
                    </label>
                    <select
                      value={targetColumn}
                      onChange={(e) => setTargetColumn(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-colors"
                    >
                      {validation.columns.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">
                    Classifier
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {CLASSIFIERS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setClassifier(c.value)}
                        className={`rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                          classifier === c.value
                            ? "border-emerald-500 bg-emerald-500/10 text-emerald-400 font-medium"
                            : "border-slate-700 text-slate-300 hover:border-slate-600"
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1.5">
                    Output directory <span className="text-slate-600">(optional)</span>
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={outputDir}
                        onChange={(e) => setOutputDir(e.target.value)}
                        placeholder="~/smiles-viz-models/"
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 pl-4 pr-9 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-colors font-mono"
                      />
                      {outputDir && (
                        <button
                          type="button"
                          onClick={clearOutputDir}
                          aria-label="Clear output directory"
                          className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-full text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowFolderModal(true)}
                      aria-label="Browse for an output directory"
                      title="Browse for an output directory"
                      className="shrink-0 flex items-center justify-center rounded-lg border border-slate-700 px-3.5 py-2.5 text-slate-200 hover:border-emerald-600 hover:text-emerald-400 transition-colors"
                    >
                      <FolderIcon />
                    </button>
                  </div>
                </div>

                {startError && (
                  <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
                    {startError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleStartTraining}
                  disabled={!validation.is_valid || starting}
                  className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {starting ? "Starting…" : "Start Training"}
                </button>
              </div>
            )}
          </div>
        )}

        {pageState === "training" && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-8 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-100">Training in progress</h2>
              <span className="text-sm text-slate-400 font-mono">{formatElapsed(elapsed)}</span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="uppercase tracking-wide">{jobStatus?.status ?? "Starting"}</span>
                <span>{Math.round((jobStatus?.progress ?? 0) * 100)}%</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500 animate-pulse"
                  style={{ width: `${Math.round((jobStatus?.progress ?? 0) * 100)}%` }}
                />
              </div>
            </div>

            <p className="text-sm text-slate-400">
              {jobStatus?.message ?? "Waiting for the trainer to report progress…"}
            </p>
          </div>
        )}

        {pageState === "complete" && result && (
          <div className="space-y-6">
            <div className="rounded-xl border border-emerald-800/60 bg-emerald-950/20 p-6 space-y-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <h2 className="text-base font-semibold text-slate-100">Training complete</h2>
              </div>

              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Classifier</dt>
                  <dd className="text-slate-200 font-medium">
                    {CLASSIFIERS.find((c) => c.value === result.classifier)?.label ??
                      result.classifier}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Total molecules</dt>
                  <dd className="text-slate-200 font-medium">{result.total_molecules}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Valid molecules</dt>
                  <dd className="text-slate-200 font-medium">{result.valid_molecules}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Duration</dt>
                  <dd className="text-slate-200 font-medium">
                    {formatElapsed(result.training_duration_seconds)}
                  </dd>
                </div>
              </dl>

              <div>
                <p className="text-xs text-slate-500 mb-2">Metrics</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {Object.entries(result.metrics).map(([key, value]) => (
                    <div
                      key={key}
                      className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-center"
                    >
                      <p className="text-xs text-slate-500">{formatMetricLabel(key)}</p>
                      <p className="text-sm font-semibold text-emerald-400">
                        {value.toFixed(3)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs text-slate-500">Model saved to</p>
                <p className="mt-1 text-xs text-slate-300 font-mono break-all rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
                  {result.output_path}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={resetToForm}
              className="w-full rounded-lg border border-slate-700 py-2.5 text-sm text-slate-200 hover:border-slate-600 transition-colors"
            >
              Train Another Model
            </button>
          </div>
        )}

        {pageState === "failed" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-red-800/60 bg-red-950/30 p-6 space-y-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                <h2 className="text-base font-semibold text-slate-100">Training failed</h2>
              </div>
              <p className="text-sm text-red-300">{failureError}</p>
            </div>

            <button
              type="button"
              onClick={resetToForm}
              className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}
      </div>

      <FolderBrowserModal
        isOpen={showFolderModal}
        onClose={() => setShowFolderModal(false)}
        onSelect={(path) => {
          setOutputDir(path);
          setShowFolderModal(false);
        }}
        title="Select output directory"
      />
    </main>
  );
}
