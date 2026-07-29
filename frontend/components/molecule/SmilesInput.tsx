"use client";

import { EXAMPLE_MOLECULES } from "@/constants/molecules";

interface SmilesInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
}

export function SmilesInput({ value, onChange, onSubmit, loading }: SmilesInputProps) {
  return (
    <section>
      <label
        htmlFor="smiles-input"
        className="block text-sm font-medium text-text-secondary mb-2"
      >
        Enter a SMILES string
      </label>
      <div className="flex gap-3">
        <input
          id="smiles-input"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit();
          }}
          placeholder="e.g. CC(=O)Oc1ccccc1C(=O)O"
          className="flex-1 rounded-md border border-surface-border bg-surface-card text-text-primary px-4 py-3 text-base font-mono placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2 focus:border-primary-500 transition-colors duration-150"
          spellCheck={false}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={loading}
          className="rounded-md bg-primary-500 px-6 py-3 text-sm font-semibold text-white hover:bg-primary-600 active:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150 whitespace-nowrap"
        >
          {loading ? "Analyzing…" : "Visualize"}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="text-xs text-text-muted self-center mr-1">Try:</span>
        {EXAMPLE_MOLECULES.map((m) => (
          <button
            key={m.smiles}
            type="button"
            onClick={() => onChange(m.smiles)}
            className="rounded-full border border-surface-border px-3 py-1 text-xs text-text-secondary hover:border-primary-300 hover:bg-primary-50 hover:text-primary-500 transition-colors duration-150"
          >
            {m.name}
          </button>
        ))}
      </div>
    </section>
  );
}
