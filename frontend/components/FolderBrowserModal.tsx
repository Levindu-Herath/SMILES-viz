"use client";

import { useEffect, useState } from "react";
import {
  browseDirectories,
  createDirectory,
  listDrives,
  type DirectoryEntry,
} from "@/lib/trainer-api";

interface FolderBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (path: string) => void;
  title?: string;
}

export function FolderBrowserModal({
  isOpen,
  onClose,
  onSelect,
  title = "Select a folder",
}: FolderBrowserModalProps) {
  const [currentPath, setCurrentPath] = useState("");
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [directories, setDirectories] = useState<DirectoryEntry[]>([]);
  const [pathInput, setPathInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [drives, setDrives] = useState<string[]>([]);
  const [showDrives, setShowDrives] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  async function load(path?: string) {
    setLoading(true);
    setError("");
    try {
      const result = await browseDirectories(path);
      setCurrentPath(result.current_path);
      setParentPath(result.parent_path);
      setDirectories(result.directories);
      setPathInput(result.current_path);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to browse directory.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    setShowDrives(false);
    setCreatingFolder(false);
    setNewFolderName("");
    load();
    listDrives()
      .then(setDrives)
      .catch(() => setDrives([]));
  }, [isOpen]);

  if (!isOpen) return null;

  function handleGoUp() {
    if (parentPath) load(parentPath);
  }

  function handleGoToPath() {
    if (pathInput.trim()) load(pathInput.trim());
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    const separator = currentPath.includes("\\") ? "\\" : "/";
    const newPath = `${currentPath}${currentPath.endsWith(separator) ? "" : separator}${newFolderName.trim()}`;
    setError("");
    try {
      const created = await createDirectory(newPath);
      setCreatingFolder(false);
      setNewFolderName("");
      load(created);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create folder.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-lg border border-surface-border bg-surface-card p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowDrives((v) => !v)}
              className="rounded-md border border-surface-border px-3 py-1.5 text-xs text-text-secondary hover:border-primary-300 hover:bg-primary-50 hover:text-primary-500 transition-colors duration-150"
            >
              Drives
            </button>
            {showDrives && (
              <div className="absolute right-0 mt-1 w-32 rounded-lg border border-surface-border bg-surface-card shadow-lg z-10 overflow-hidden">
                {drives.map((drive) => (
                  <button
                    key={drive}
                    type="button"
                    onClick={() => {
                      setShowDrives(false);
                      load(drive);
                    }}
                    className="block w-full px-3 py-2 text-left text-xs text-text-secondary hover:bg-primary-50 hover:text-primary-500 transition-colors duration-150"
                  >
                    {drive}
                  </button>
                ))}
                {drives.length === 0 && (
                  <p className="px-3 py-2 text-xs text-text-muted">No drives found</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleGoUp}
            disabled={!parentPath}
            aria-label="Go up"
            className="shrink-0 rounded-md border border-surface-border px-3 py-2 text-xs text-text-secondary hover:border-primary-300 hover:bg-primary-50 hover:text-primary-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
          >
            ↑ Up
          </button>
          <p className="flex-1 truncate rounded-md border border-surface-border bg-surface-bg px-3 py-2 text-xs text-text-secondary font-mono">
            {currentPath || "…"}
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-danger-border bg-danger-bg px-4 py-2.5 text-xs text-danger-text">
            {error}
          </div>
        )}

        <div className="h-64 overflow-y-auto rounded-lg border border-surface-border bg-surface-bg">
          {loading && <p className="px-4 py-3 text-xs text-text-muted">Loading…</p>}
          {!loading && directories.length === 0 && (
            <p className="px-4 py-3 text-xs text-text-muted">No subfolders here.</p>
          )}
          {!loading &&
            directories.map((dir) => (
              <button
                key={dir.path}
                type="button"
                onClick={() => load(dir.path)}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-text-primary hover:bg-primary-50 transition-colors duration-150"
              >
                <span className="text-text-muted">📁</span>
                <span className="truncate">{dir.name}</span>
              </button>
            ))}
        </div>

        {creatingFolder ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="New folder name"
              autoFocus
              className="flex-1 rounded-md border border-surface-border bg-surface-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2 focus:border-primary-500 transition-colors duration-150"
            />
            <button
              type="button"
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim()}
              className="rounded-md border border-surface-border px-3 py-2 text-sm text-text-secondary hover:border-primary-300 hover:bg-primary-50 hover:text-primary-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => {
                setCreatingFolder(false);
                setNewFolderName("");
              }}
              className="rounded-md border border-surface-border px-3 py-2 text-sm text-text-secondary hover:border-surface-hover hover:bg-surface-bg transition-colors duration-150"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleGoToPath();
              }}
              placeholder="Type or paste a path"
              className="flex-1 rounded-md border border-surface-border bg-surface-card px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2 focus:border-primary-500 transition-colors duration-150 font-mono"
            />
            <button
              type="button"
              onClick={handleGoToPath}
              className="rounded-md border border-surface-border px-3 py-2 text-sm text-text-secondary hover:border-primary-300 hover:bg-primary-50 hover:text-primary-500 transition-colors duration-150"
            >
              Go
            </button>
            <button
              type="button"
              onClick={() => setCreatingFolder(true)}
              className="shrink-0 rounded-md border border-surface-border px-3 py-2 text-sm text-text-secondary hover:border-primary-300 hover:bg-primary-50 hover:text-primary-500 transition-colors duration-150 whitespace-nowrap"
            >
              New folder
            </button>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-md border border-surface-border py-2.5 text-sm text-text-secondary hover:border-surface-hover hover:bg-surface-bg transition-colors duration-150"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (currentPath) onSelect(currentPath);
            }}
            disabled={!currentPath}
            className="flex-1 rounded-md bg-primary-500 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 active:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
          >
            Select
          </button>
        </div>
      </div>
    </div>
  );
}
