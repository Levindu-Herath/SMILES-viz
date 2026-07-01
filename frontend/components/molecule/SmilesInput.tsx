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
        className="block text-sm font-medium text-slate-400 mb-2"
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
          className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-base font-mono placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-colors"
          spellCheck={false}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={loading}
          className="rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          {loading ? "Analyzing…" : "Visualize"}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="text-xs text-slate-500 self-center mr-1">Try:</span>
        {EXAMPLE_MOLECULES.map((m) => (
          <button
            key={m.smiles}
            type="button"
            onClick={() => onChange(m.smiles)}
            className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400 hover:border-emerald-600 hover:text-emerald-400 transition-colors"
          >
            {m.name}
          </button>
        ))}
      </div>
    </section>
  );
}
