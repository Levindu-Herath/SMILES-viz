"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { useAuth } from "@/components/auth/AuthProvider";
import { deleteDataset, getDownloadUrl, listDatasets, uploadDataset } from "@/lib/api";
import type { Dataset } from "@/types/dataset";

const ACCEPTED_EXTENSIONS = ".csv,.txt,.zip,.tsv";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

function formatFullDate(iso: string): string {
  const date = new Date(iso);
  const datePart = date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timePart = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${datePart} at ${timePart}`;
}

function UploadModal({
  onClose,
  onUploaded,
}: {
  onClose: () => void;
  onUploaded: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  async function handleSubmit() {
    if (!name.trim() || !file || uploading) return;

    setUploading(true);
    setError("");

    try {
      const data = await uploadDataset(file, name.trim(), description.trim());
      onUploaded(data.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to upload dataset.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-lg border border-surface-border bg-surface-card p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Upload Dataset</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Share a CSV, TSV, TXT, or ZIP file with other users.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger-text">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-md border border-surface-border bg-surface-card px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2 focus:border-primary-500 transition-colors duration-150"
              placeholder="e.g. NCI Screening Subset"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Description <span className="text-text-muted">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-surface-border bg-surface-card px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2 focus:border-primary-500 transition-colors duration-150 resize-none"
              placeholder="What's in this dataset?"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              File
            </label>
            <div className="rounded-lg border border-dashed border-primary-300 bg-primary-50/30 hover:bg-primary-50 transition-colors duration-150 p-4">
              <input
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-text-secondary file:mr-3 file:rounded-md file:border file:border-primary-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:text-primary-600 file:cursor-pointer hover:file:border-primary-400"
              />
              {file && (
                <p className="mt-1.5 text-xs text-text-muted">
                  {file.name} — {formatFileSize(file.size)}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="flex-1 rounded-md border border-surface-border py-2.5 text-sm text-text-secondary hover:border-surface-hover hover:bg-surface-bg disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={uploading || !name.trim() || !file}
            className="flex-1 rounded-md bg-primary-500 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 active:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DatasetDetailModal({
  dataset,
  isOwner,
  onClose,
  onDownload,
  onDeleteRequest,
}: {
  dataset: Dataset;
  isOwner: boolean;
  onClose: () => void;
  onDownload: (dataset: Dataset) => void;
  onDeleteRequest: (datasetId: string) => void;
}) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-lg border border-surface-border bg-surface-card p-6 space-y-5 animate-scale-in">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-text-primary break-words">{dataset.name}</h2>
          <span className="rounded-full border border-surface-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-text-secondary shrink-0">
            {dataset.file_type}
          </span>
        </div>

        {dataset.description && (
          <p className="text-sm text-text-secondary whitespace-pre-wrap">{dataset.description}</p>
        )}

        <dl className="space-y-2.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-text-secondary">File name</dt>
            <dd className="text-text-primary font-medium font-mono text-right break-all">{dataset.file_name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-secondary">File size</dt>
            <dd className="text-text-primary font-medium">{formatFileSize(dataset.file_size)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-secondary">Uploaded by</dt>
            <dd className="text-text-primary font-medium text-right break-all">{dataset.uploaded_by_email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-secondary">Upload date</dt>
            <dd className="text-text-primary font-medium text-right">{formatFullDate(dataset.created_at)}</dd>
          </div>
        </dl>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-md border border-surface-border py-2.5 text-sm text-text-secondary hover:border-surface-hover hover:bg-surface-bg transition-colors duration-150"
          >
            Close
          </button>
          {isOwner && (
            <button
              type="button"
              onClick={() => onDeleteRequest(dataset.id)}
              className="flex-1 rounded-md border border-danger-border py-2.5 text-sm font-semibold text-danger-text hover:bg-danger-bg transition-colors duration-150"
            >
              Delete
            </button>
          )}
          <button
            type="button"
            onClick={() => onDownload(dataset)}
            className="flex-1 rounded-md bg-primary-500 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 active:bg-primary-700 transition-colors duration-150"
          >
            Download
          </button>
        </div>

        <p className="text-[11px] text-text-muted text-center pt-1">{dataset.id}</p>
      </div>
    </div>
  );
}

function DatasetsPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const data = await listDatasets();
      setDatasets(data.datasets);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("Session expired")) {
        router.push("/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load datasets.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(""), 4000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  function handleUploaded(message: string) {
    setShowUploadModal(false);
    setSuccessMessage(message);
    refresh();
  }

  async function handleDownload(dataset: Dataset) {
    setError("");
    try {
      const { url } = await getDownloadUrl(dataset.id);
      window.open(url, "_blank");
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("Session expired")) {
        router.push("/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to get download link.");
    }
  }

  async function handleDelete(datasetId: string) {
    setError("");
    try {
      await deleteDataset(datasetId);
      setPendingDeleteId(null);
      setSelectedDataset(null);
      refresh();
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("Session expired")) {
        router.push("/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to delete dataset.");
    }
  }

  return (
    <main className="min-h-screen bg-surface-bg text-text-primary">
      <div className="mx-auto max-w-6xl px-6 py-8 space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Datasets</h1>
            <p className="mt-1 text-sm text-text-secondary">
              Upload and share CSV, TSV, TXT, or ZIP datasets with other users.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowUploadModal(true)}
            className="rounded-md bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 active:bg-primary-700 transition-colors duration-150 whitespace-nowrap"
          >
            Upload Dataset
          </button>
        </div>

        {successMessage && (
          <div className="rounded-lg border border-success-border bg-success-bg px-5 py-4 text-sm text-success-text">
            {successMessage}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-danger-border bg-danger-bg px-5 py-4 text-sm text-danger-text">
            {error}
          </div>
        )}

        {loading && (
          <p className="text-sm text-text-muted">Loading datasets…</p>
        )}

        {!loading && datasets.length === 0 && (
          <div className="rounded-lg border border-surface-border bg-surface-card p-10 text-center">
            <p className="text-sm text-text-muted">
              No datasets uploaded yet. Upload your first dataset to get started.
            </p>
          </div>
        )}

        {!loading && datasets.length > 0 && (
          <div className="space-y-3">
            {datasets.map((dataset) => (
              <div
                key={dataset.id}
                onClick={() => setSelectedDataset(dataset)}
                className="rounded-lg border border-surface-border bg-surface-card p-5 flex flex-col sm:flex-row sm:items-center gap-4 cursor-pointer hover:border-primary-200 transition-colors duration-150"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-medium text-text-primary">{dataset.name}</h3>
                    <span className="rounded-full border border-surface-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-text-secondary">
                      {dataset.file_type}
                    </span>
                  </div>
                  {dataset.description && (
                    <p className="mt-1 text-xs text-text-muted truncate max-w-xl">
                      {dataset.description}
                    </p>
                  )}
                  <p className="mt-1.5 text-xs text-text-muted font-mono">
                    {dataset.file_name} · {formatFileSize(dataset.file_size)}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    Uploaded by {dataset.uploaded_by_email} · {formatDate(dataset.created_at)}
                  </p>
                </div>

                <div
                  className="flex items-center gap-2 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => handleDownload(dataset)}
                    className="rounded-md border border-surface-border px-3 py-1.5 text-xs text-text-secondary hover:border-primary-300 hover:bg-primary-50 hover:text-primary-500 transition-colors duration-150"
                  >
                    Download
                  </button>
                  {user?.id && dataset.uploaded_by_email === user.email && (
                    <button
                      type="button"
                      onClick={() => setPendingDeleteId(dataset.id)}
                      className="rounded-md border border-surface-border px-3 py-1.5 text-xs text-text-secondary hover:border-danger-border hover:bg-danger-bg hover:text-danger-text transition-colors duration-150"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showUploadModal && (
        <UploadModal onClose={() => setShowUploadModal(false)} onUploaded={handleUploaded} />
      )}

      {selectedDataset && (
        <DatasetDetailModal
          dataset={selectedDataset}
          isOwner={Boolean(user?.id && selectedDataset.uploaded_by_email === user.email)}
          onClose={() => setSelectedDataset(null)}
          onDownload={handleDownload}
          onDeleteRequest={(datasetId) => {
            setSelectedDataset(null);
            setPendingDeleteId(datasetId);
          }}
        />
      )}

      {pendingDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-lg border border-surface-border bg-surface-card p-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Delete dataset?</h2>
              <p className="mt-1 text-sm text-text-secondary">
                This will permanently remove the file and its metadata. This can&apos;t be undone.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPendingDeleteId(null)}
                className="flex-1 rounded-md border border-surface-border py-2.5 text-sm text-text-secondary hover:border-surface-hover hover:bg-surface-bg transition-colors duration-150"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(pendingDeleteId)}
                className="flex-1 rounded-md bg-danger-bg py-2.5 text-sm font-semibold text-danger-text hover:bg-danger-border transition-colors duration-150"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function Page() {
  return (
    <AuthGuard>
      <DatasetsPage />
    </AuthGuard>
  );
}
