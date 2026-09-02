"use client";

import type { ReactNode } from "react";
import type { ExampleMolecule } from "@/lib/smiles";

type ResolvedCompound = { name: string; smiles: string; cid: number };

interface CompoundInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  onSelectExample: (smiles: string) => void;
  examples: readonly ExampleMolecule[];
  resolving: boolean;
  resolvingTerm: string;
  resolved: ResolvedCompound | null;
  /** Optional submit affordance (e.g. Visualize's "Visualize" button). Predict has none. */
  submitSlot?: ReactNode;
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3 w-3 shrink-0"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function CompoundInput({
  value,
  onChange,
  onSubmit,
  onClear,
  onSelectExample,
  examples,
  resolving,
  resolvingTerm,
  resolved,
  submitSlot,
}: CompoundInputProps) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-bg p-4 space-y-3">
      <label htmlFor="smiles-input" className="sr-only">
        Compound name or SMILES notation
      </label>
      <div className="flex gap-3">
        <div className="relative flex-1">
          <input
            id="smiles-input"
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit();
            }}
            placeholder="Enter a compound name or SMILES — e.g. aspirin, caffeine, CC(=O)O"
            className="w-full rounded-md border border-surface-border bg-surface-card text-text-primary pl-4 pr-10 py-3.5 text-base font-mono placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-500 transition-colors duration-150"
            spellCheck={false}
            autoComplete="off"
          />
          {value && (
            <button
              type="button"
              onClick={onClear}
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
        {submitSlot}
      </div>

      {resolving && (
        <p className="text-sm text-text-secondary">
          Looking up &ldquo;{resolvingTerm}&rdquo; on PubChem…
        </p>
      )}

      {resolved && (
        <p className="flex items-center gap-1.5 rounded-md border border-success-border bg-success-bg px-3 py-1.5 text-xs text-success-text">
          <CheckIcon />
          <span className="truncate">
            Resolved {resolved.name} →{" "}
            <span className="font-mono">{resolved.smiles}</span>
          </span>
          <a
            href={`https://pubchem.ncbi.nlm.nih.gov/compound/${resolved.cid}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 underline hover:no-underline"
          >
            PubChem CID: {resolved.cid}
          </a>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-text-muted mr-1">Try:</span>
        {examples.map((example) => (
          <button
            key={example.label}
            type="button"
            onClick={() => onSelectExample(example.smiles)}
            className="rounded-full border border-surface-border bg-surface-card px-3 py-1 text-xs text-text-secondary hover:border-primary-300 hover:bg-primary-50 hover:text-primary-500 transition-colors duration-150"
          >
            {example.label}
          </button>
        ))}
        <span className="text-xs text-text-muted ml-auto">
          Accepts compound names, drug names, or SMILES notation
        </span>
      </div>
    </div>
  );
}
