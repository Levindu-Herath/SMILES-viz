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
      <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowDrives((v) => !v)}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-600 transition-colors"
            >
              Drives
            </button>
            {showDrives && (
              <div className="absolute right-0 mt-1 w-32 rounded-lg border border-slate-700 bg-slate-900 shadow-lg z-10 overflow-hidden">
                {drives.map((drive) => (
                  <button
                    key={drive}
                    type="button"
                    onClick={() => {
                      setShowDrives(false);
                      load(drive);
                    }}
                    className="block w-full px-3 py-2 text-left text-xs text-slate-300 hover:bg-slate-800 transition-colors"
                  >
                    {drive}
                  </button>
                ))}
                {drives.length === 0 && (
                  <p className="px-3 py-2 text-xs text-slate-500">No drives found</p>
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
            className="shrink-0 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ↑ Up
          </button>
          <p className="flex-1 truncate rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-400 font-mono">
            {currentPath || "…"}
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-4 py-2.5 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="h-64 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/40">
          {loading && <p className="px-4 py-3 text-xs text-slate-500">Loading…</p>}
          {!loading && directories.length === 0 && (
            <p className="px-4 py-3 text-xs text-slate-500">No subfolders here.</p>
          )}
          {!loading &&
            directories.map((dir) => (
              <button
                key={dir.path}
                type="button"
                onClick={() => load(dir.path)}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-800/60 transition-colors"
              >
                <span className="text-slate-500">📁</span>
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
              className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-colors"
            />
            <button
              type="button"
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim()}
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-emerald-600 hover:text-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => {
                setCreatingFolder(false);
                setNewFolderName("");
              }}
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-400 hover:border-slate-600 transition-colors"
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
              className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-colors font-mono"
            />
            <button
              type="button"
              onClick={handleGoToPath}
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-emerald-600 hover:text-emerald-400 transition-colors"
            >
              Go
            </button>
            <button
              type="button"
              onClick={() => setCreatingFolder(true)}
              className="shrink-0 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-slate-600 transition-colors whitespace-nowrap"
            >
              New folder
            </button>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-700 py-2.5 text-sm text-slate-300 hover:border-slate-600 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (currentPath) onSelect(currentPath);
            }}
            disabled={!currentPath}
            className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Select
          </button>
        </div>
      </div>
    </div>
  );
}
