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
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 animate-spin text-primary-500">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
      <path
        d="M4 5.5a1.5 1.5 0 0 1 1.5-1.5H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5v-13Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-3.5 w-3.5">
      <rect x="7" y="6" width="12" height="15" rx="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.5 6V4.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1V6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 9v11.5a1 1 0 0 0 1 1H15" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access unavailable — ignore.
    }
  }

  return (
    <div className="relative rounded-lg border border-surface-border bg-surface-bg px-4 py-3">
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy to clipboard"
        title="Copy to clipboard"
        className="absolute top-2 right-2 flex items-center justify-center rounded p-1 text-text-muted hover:text-primary-500 hover:bg-primary-50 transition-colors duration-150"
      >
        {copied ? <span className="px-0.5 text-[10px] font-medium">Copied!</span> : <ClipboardIcon />}
      </button>
      <pre className="pr-16 text-xs text-text-secondary font-mono whitespace-pre-wrap">{code}</pre>
    </div>
  );
}

function SetupStep({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2.5">
        <span className="h-6 w-6 shrink-0 rounded-full bg-primary-500 text-white text-xs font-semibold flex items-center justify-center">
          {number}
        </span>
        <p className="text-sm font-medium text-text-primary">{title}</p>
      </div>
      <div className="pl-8 space-y-1.5">{children}</div>
    </div>
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
  const [setupExpanded, setSetupExpanded] = useState(false);

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
  const [showDatasetBrowserModal, setShowDatasetBrowserModal] = useState(false);
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

  const isSdfDataset = validation?.file_format === "sdf";

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

    // Clear the previously selected dataset so the user picks fresh for the next run.
    setFilePath("");
    setValidation(null);
    setValidationError("");
    setUploadError("");
    setShowInvalidRows(false);
    setSmilesColumn("");
    setTargetColumn("");
    setClassifier(CLASSIFIERS[0].value);
    setOutputDir("");
    if (fileInputRef.current) fileInputRef.current.value = "";

    setPageState("form");
  }

  return (
    <main className="min-h-screen bg-surface-bg text-text-primary">
      <div className="mx-auto max-w-3xl px-6 py-8 space-y-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Train</h1>
            <p className="mt-1 text-sm text-text-secondary">
              Train a molecular activity classifier using your local trainer server.
            </p>
          </div>
          {pageState !== "checking" && pageState !== "disconnected" && (
            <div className="flex items-center gap-2 shrink-0">
              <span className="h-2 w-2 rounded-full bg-primary-400" />
              <span className="text-xs text-text-secondary">Trainer Connected</span>
            </div>
          )}
        </div>

        {pageState === "checking" && (
          <div className="rounded-lg border border-surface-border bg-surface-card p-10 text-center">
            <p className="text-sm text-text-muted">Checking for local trainer…</p>
          </div>
        )}

        {pageState === "disconnected" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-info-border bg-info-bg p-8 space-y-5">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-info-text" />
                <h2 className="text-base font-semibold text-info-text">Local trainer not detected</h2>
              </div>
              <p className="text-sm text-info-text">
                The Train page connects to a local training server running on your machine at{" "}
                <code className="rounded bg-white px-1.5 py-0.5 text-xs text-info-text">
                  http://localhost:5000
                </code>
                .
              </p>
              <button
                type="button"
                onClick={checkConnection}
                className="rounded-md bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 active:bg-primary-700 transition-colors duration-150"
              >
                Retry connection
              </button>
            </div>

            <div className="rounded-lg border border-surface-border bg-surface-card overflow-hidden">
              <button
                type="button"
                onClick={() => setSetupExpanded((v) => !v)}
                className="w-full flex items-center gap-2.5 px-5 py-3.5 text-left hover:bg-primary-50 cursor-pointer transition-colors duration-150"
              >
                <BookIcon />
                <span className="text-sm font-medium text-text-primary">Setup guide</span>
                <span
                  className={`ml-auto text-text-muted transition-transform duration-200 ${
                    setupExpanded ? "rotate-180" : ""
                  }`}
                >
                  ▼
                </span>
              </button>

              {setupExpanded && (
                <div className="border-t border-surface-border px-5 py-5 space-y-5">
                  <SetupStep number={1} title="Create conda environment">
                    <CodeBlock code={`conda create -n smiles-trainer python=3.11 -y\nconda activate smiles-trainer`} />
                  </SetupStep>

                  <SetupStep number={2} title="Install RDKit via conda">
                    <CodeBlock code="conda install -c conda-forge rdkit -y" />
                    <p className="text-xs text-text-muted italic">RDKit must be installed via conda, not pip</p>
                  </SetupStep>

                  <SetupStep number={3} title="Install the trainer package">
                    <CodeBlock code="pip install smiles-viz-trainer" />
                  </SetupStep>

                  <SetupStep number={4} title="Start the trainer server">
                    <CodeBlock code="python -m smiles_viz_trainer.cli" />
                    <p className="text-xs text-text-muted italic">
                      On Windows, use this instead of the smiles-train command
                    </p>
                  </SetupStep>

                  <div className="border-t border-surface-border pt-4 space-y-2">
                    <p className="text-sm font-medium text-text-primary">Alternative: Docker</p>
                    <CodeBlock code={`docker pull smiles-viz-trainer\ndocker run -p 5000:5000 smiles-viz-trainer`} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {pageState === "form" && (
          <div className="space-y-6">
            <div className="rounded-lg border border-surface-border bg-surface-card p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">
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
                      placeholder="C:\path\to\dataset.csv or .sdf"
                      className="w-full rounded-md border border-surface-border bg-surface-card pl-4 pr-9 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2 focus:border-primary-500 transition-colors duration-150 font-mono"
                    />
                    {filePath && (
                      <button
                        type="button"
                        onClick={clearFilePath}
                        aria-label="Clear file path"
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-full text-text-muted hover:text-primary-600 hover:bg-primary-50 transition-colors duration-150"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.tsv,.sdf"
                    onChange={handleFileSelected}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={handleBrowseClick}
                    disabled={uploading}
                    aria-label="Upload a dataset file"
                    title="Upload a dataset file"
                    className="shrink-0 flex items-center justify-center rounded-md border border-surface-border px-3.5 py-2.5 text-text-secondary hover:border-primary-300 hover:bg-primary-50 hover:text-primary-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
                  >
                    {uploading ? <SpinnerIcon /> : <FileIcon />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDatasetBrowserModal(true)}
                    aria-label="Browse for a dataset file on the server"
                    title="Browse for a dataset file on the server"
                    className="shrink-0 flex items-center justify-center rounded-md border border-surface-border px-3.5 py-2.5 text-text-secondary hover:border-primary-300 hover:bg-primary-50 hover:text-primary-500 transition-colors duration-150"
                  >
                    <FolderIcon />
                  </button>
                  <button
                    type="button"
                    onClick={handleValidate}
                    disabled={!filePath.trim() || validating}
                    className="rounded-md border border-surface-border px-4 py-2.5 text-sm text-text-secondary hover:border-primary-300 hover:bg-primary-50 hover:text-primary-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150 whitespace-nowrap"
                  >
                    {validating ? "Validating…" : "Validate"}
                  </button>
                </div>
              </div>

              {uploadError && (
                <div className="rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger-text">
                  {uploadError}
                </div>
              )}

              {validationError && (
                <div className="rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger-text">
                  {validationError}
                </div>
              )}

              {validation && (
                <div className="space-y-3">
                  {validation.errors.length > 0 && (
                    <div className="rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger-text space-y-1">
                      {validation.errors.map((e, i) => (
                        <p key={i}>{e}</p>
                      ))}
                    </div>
                  )}

                  {validation.warnings.length > 0 && (
                    <div className="rounded-lg border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning-text space-y-1">
                      {validation.warnings.map((w, i) => (
                        <p key={i}>{w}</p>
                      ))}
                    </div>
                  )}

                  <div className="rounded-lg border border-surface-border bg-surface-bg p-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-text-muted">Total rows</p>
                      <p className="text-text-primary font-medium">{validation.total_rows}</p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted">Valid SMILES</p>
                      <p className="text-text-primary font-medium">{validation.valid_smiles}</p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted">Invalid SMILES</p>
                      <p className="text-text-primary font-medium">{validation.invalid_smiles}</p>
                    </div>
                    {Object.keys(validation.target_value_counts).length > 0 && (
                      <div className="col-span-2 sm:col-span-3">
                        <p className="text-xs text-text-muted mb-1">Target distribution</p>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(validation.target_value_counts).map(([label, count]) => (
                            <span
                              key={label}
                              className="rounded-full border border-surface-border px-2.5 py-1 text-xs text-text-secondary"
                            >
                              {label}: {count}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {validation.invalid_rows.length > 0 && (
                    <div className="rounded-lg border border-surface-border bg-surface-bg">
                      <button
                        type="button"
                        onClick={() => setShowInvalidRows((v) => !v)}
                        className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-text-secondary hover:text-text-primary transition-colors duration-150"
                      >
                        <span>
                          {showInvalidRows ? "Hide" : "Show"} {validation.invalid_rows.length} invalid row(s)
                        </span>
                        <span>{showInvalidRows ? "▲" : "▼"}</span>
                      </button>
                      {showInvalidRows && (
                        <div className="border-t border-surface-border px-4 py-3 space-y-1.5 max-h-48 overflow-y-auto">
                          {validation.invalid_rows.map((row) => (
                            <p key={row.row} className="text-xs text-text-muted font-mono">
                              Row {row.row}: <span className="text-text-secondary">{row.smiles}</span> —{" "}
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
              <div className="rounded-lg border border-surface-border bg-surface-card p-6 space-y-5">
                <div className={`grid gap-4 ${isSdfDataset ? "" : "sm:grid-cols-2"}`}>
                  {!isSdfDataset && (
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1.5">
                        SMILES column
                      </label>
                      <select
                        value={smilesColumn}
                        onChange={(e) => setSmilesColumn(e.target.value)}
                        className="w-full rounded-md border border-surface-border bg-surface-card px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2 focus:border-primary-500 transition-colors duration-150"
                      >
                        {validation.columns.map((col) => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1.5">
                      Target column
                    </label>
                    {isSdfDataset ? (
                      <p className="w-full rounded-md border border-surface-border bg-surface-bg px-4 py-2.5 text-sm text-text-primary">
                        {targetColumn || "—"}
                      </p>
                    ) : (
                      <select
                        value={targetColumn}
                        onChange={(e) => setTargetColumn(e.target.value)}
                        className="w-full rounded-md border border-surface-border bg-surface-card px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2 focus:border-primary-500 transition-colors duration-150"
                      >
                        {validation.columns.map((col) => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    Classifier
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {CLASSIFIERS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setClassifier(c.value)}
                        className={`rounded-md border px-4 py-2.5 text-sm transition-colors duration-150 ${
                          classifier === c.value
                            ? "border-primary-500 bg-primary-50 text-primary-600 font-medium"
                            : "border-surface-border text-text-secondary hover:border-primary-200"
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    Output directory <span className="text-text-muted">(optional)</span>
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={outputDir}
                        onChange={(e) => setOutputDir(e.target.value)}
                        placeholder="~/smiles-viz-models/"
                        className="w-full rounded-md border border-surface-border bg-surface-card pl-4 pr-9 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2 focus:border-primary-500 transition-colors duration-150 font-mono"
                      />
                      {outputDir && (
                        <button
                          type="button"
                          onClick={clearOutputDir}
                          aria-label="Clear output directory"
                          className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-full text-text-muted hover:text-primary-600 hover:bg-primary-50 transition-colors duration-150"
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
                      className="shrink-0 flex items-center justify-center rounded-md border border-surface-border px-3.5 py-2.5 text-text-secondary hover:border-primary-300 hover:bg-primary-50 hover:text-primary-500 transition-colors duration-150"
                    >
                      <FolderIcon />
                    </button>
                  </div>
                </div>

                {startError && (
                  <div className="rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger-text">
                    {startError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleStartTraining}
                  disabled={!validation.is_valid || starting}
                  className="w-full rounded-md bg-primary-500 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 active:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
                >
                  {starting ? "Starting…" : "Start Training"}
                </button>
              </div>
            )}
          </div>
        )}

        {pageState === "training" && (
          <div className="rounded-lg border border-surface-border bg-surface-card p-8 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-text-primary">Training in progress</h2>
              <span className="text-sm text-text-secondary font-mono">{formatElapsed(elapsed)}</span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span className="uppercase tracking-wide">{jobStatus?.status ?? "Starting"}</span>
                <span>{Math.round((jobStatus?.progress ?? 0) * 100)}%</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-primary-50 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary-500 transition-all duration-500 animate-pulse"
                  style={{ width: `${Math.round((jobStatus?.progress ?? 0) * 100)}%` }}
                />
              </div>
            </div>

            <p className="text-sm text-text-secondary">
              {jobStatus?.message ?? "Waiting for the trainer to report progress…"}
            </p>
          </div>
        )}

        {pageState === "complete" && result && (
          <div className="space-y-6">
            <div className="rounded-lg border border-success-border bg-success-bg p-6 space-y-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-success-text" />
                <h2 className="text-base font-semibold text-success-text">Training complete</h2>
              </div>

              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <dt className="text-xs text-text-secondary">Classifier</dt>
                  <dd className="text-text-primary font-medium">
                    {CLASSIFIERS.find((c) => c.value === result.classifier)?.label ??
                      result.classifier}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-text-secondary">Total molecules</dt>
                  <dd className="text-text-primary font-medium">{result.total_molecules}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-secondary">Valid molecules</dt>
                  <dd className="text-text-primary font-medium">{result.valid_molecules}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-secondary">Duration</dt>
                  <dd className="text-text-primary font-medium">
                    {formatElapsed(result.training_duration_seconds)}
                  </dd>
                </div>
              </dl>

              <div>
                <p className="text-xs text-text-secondary mb-2">Metrics</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {Object.entries(result.metrics).map(([key, value]) => (
                    <div
                      key={key}
                      className="rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-center"
                    >
                      <p className="text-xs text-text-muted">{formatMetricLabel(key)}</p>
                      <p className="text-sm font-semibold text-primary-500">
                        {value.toFixed(3)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs text-text-secondary">Model saved to</p>
                <p className="mt-1 text-xs text-text-primary font-mono break-all rounded-lg border border-surface-border bg-surface-card px-3 py-2">
                  {result.output_path}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={resetToForm}
              className="w-full rounded-md border border-surface-border py-2.5 text-sm text-text-secondary hover:border-primary-300 hover:bg-primary-50 hover:text-primary-500 transition-colors duration-150"
            >
              Train Another Model
            </button>
          </div>
        )}

        {pageState === "failed" && (
          <div className="space-y-6">
            <div className="rounded-lg border border-danger-border bg-danger-bg p-6 space-y-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-danger-text" />
                <h2 className="text-base font-semibold text-danger-text">Training failed</h2>
              </div>
              <p className="text-sm text-danger-text">{failureError}</p>
            </div>

            <button
              type="button"
              onClick={resetToForm}
              className="w-full rounded-md bg-primary-500 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 active:bg-primary-700 transition-colors duration-150"
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

      <FolderBrowserModal
        isOpen={showDatasetBrowserModal}
        onClose={() => setShowDatasetBrowserModal(false)}
        onSelect={(path) => {
          setFilePath(path);
          setValidation(null);
          setValidationError("");
          setShowDatasetBrowserModal(false);
        }}
        title="Select dataset"
        mode="file"
        fileExtensions=".csv,.sdf"
      />
    </main>
  );
}
