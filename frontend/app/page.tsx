"use client";

import { useState, useEffect } from "react";

// ---------------------------------------------------------------------------
// Types matching the backend response
// ---------------------------------------------------------------------------
interface Physicochemical {
  formula: string;
  mw: number;
  heavy_atoms: number;
  aromatic_heavy_atoms: number;
  fraction_csp3: number;
  rotatable_bonds: number;
  hba: number;
  hbd: number;
  molar_refractivity: number;
  tpsa: number;
}

interface RuleResult {
  passes: boolean;
  violations: number;
  details: string[];
}

interface MoleculeData {
  svg: string;
  smiles: string;
  physicochemical: Physicochemical;
  lipophilicity: { crippen_logp: number };
  solubility: {
    esol_logs: number;
    esol_mg_ml: number;
    esol_mol_l: number;
    esol_class: string;
  };
  druglikeness: {
    lipinski: RuleResult;
    ghose: RuleResult;
    veber: RuleResult;
    egan: RuleResult;
    muegge: RuleResult;
    bioavailability_score: number;
  };
  medicinal_chemistry: {
    pains_alerts: number;
    pains_descriptions: string[];
    sa_score: number | null;
    leadlikeness: RuleResult;
  };
  radar: {
    lipo: number;
    size: number;
    polar: number;
    insolu: number;
    insatu: number;
    flex: number;
  };
}

const EXAMPLES = [
  { name: "Ethanol", smiles: "CCO" },
  { name: "Aspirin", smiles: "CC(=O)Oc1ccccc1C(=O)O" },
  { name: "Caffeine", smiles: "Cn1c(=O)c2c(ncn2C)n(C)c1=O" },
  { name: "Benzene", smiles: "c1ccccc1" },
  { name: "Ibuprofen", smiles: "CC(C)Cc1ccc(cc1)C(C)C(=O)O" },
  { name: "Penicillin G", smiles: "CC1([C@@H](N2[C@H](S1)[C@@H](C2=O)NC(=O)Cc3ccccc3)C(=O)O)C" },
];

// ---------------------------------------------------------------------------
// Radar chart component (SVG hexagonal)
// ---------------------------------------------------------------------------
function RadarChart({ data }: { data: MoleculeData["radar"] }) {
  const cx = 140, cy = 140, r = 110;
  const labels = ["LIPO", "SIZE", "POLAR", "INSOLU", "INSATU", "FLEX"];
  const values = [data.lipo, data.size, data.polar, data.insolu, data.insatu, data.flex];

  // Drug-like zone boundaries (normalised)
  const zoneMin = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
  const zoneMax = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0];

  function polarToXY(angle: number, radius: number) {
    const a = angle - Math.PI / 2;
    return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
  }

  function polygon(vals: number[]) {
    return vals
      .map((v, i) => {
        const angle = (2 * Math.PI * i) / 6;
        const [x, y] = polarToXY(angle, v * r);
        return `${x},${y}`;
      })
      .join(" ");
  }

  // Grid rings
  const rings = [0.2, 0.4, 0.6, 0.8, 1.0];

  return (
    <svg viewBox="0 0 280 280" className="w-full max-w-[280px]">
      {/* Grid rings */}
      {rings.map((s) => (
        <polygon
          key={s}
          points={polygon(Array(6).fill(s))}
          fill="none"
          stroke="rgb(100,116,139)"
          strokeWidth="0.5"
          opacity={0.3}
        />
      ))}

      {/* Axis lines */}
      {labels.map((_, i) => {
        const angle = (2 * Math.PI * i) / 6;
        const [x, y] = polarToXY(angle, r);
        return (
          <line
            key={i}
            x1={cx} y1={cy} x2={x} y2={y}
            stroke="rgb(100,116,139)" strokeWidth="0.5" opacity={0.3}
          />
        );
      })}

      {/* Drug-like zone (pink shaded area) */}
      <polygon
        points={polygon(zoneMax)}
        fill="rgb(248,113,113)"
        fillOpacity={0.1}
        stroke="rgb(248,113,113)"
        strokeWidth="1"
        strokeDasharray="4 2"
        opacity={0.5}
      />

      {/* Molecule values */}
      <polygon
        points={polygon(values)}
        fill="rgb(52,211,153)"
        fillOpacity={0.25}
        stroke="rgb(16,185,129)"
        strokeWidth="2"
      />

      {/* Value dots */}
      {values.map((v, i) => {
        const angle = (2 * Math.PI * i) / 6;
        const [x, y] = polarToXY(angle, v * r);
        return <circle key={i} cx={x} cy={y} r="3.5" fill="rgb(16,185,129)" />;
      })}

      {/* Labels */}
      {labels.map((label, i) => {
        const angle = (2 * Math.PI * i) / 6;
        const [x, y] = polarToXY(angle, r + 18);
        return (
          <text
            key={label}
            x={x} y={y}
            textAnchor="middle"
            dominantBaseline="central"
            fill="rgb(148,163,184)"
            fontSize="11"
            fontWeight="500"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------
function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
        {title}
      </h3>
      {children}
    </div>
  );
}

function PropRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-baseline py-1.5 border-b border-slate-800/50 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-sm text-slate-200 font-mono">{value}</span>
    </div>
  );
}

function RuleBadge({ name, rule }: { name: string; rule: RuleResult }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-800/50 last:border-0">
      <span className="text-xs text-slate-300">{name}</span>
      <div className="flex items-center gap-2">
        {rule.passes ? (
          <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-emerald-900/50 text-emerald-400 border border-emerald-700/50">
            Yes{rule.violations > 0 ? `; ${rule.violations} violation` : ""}
          </span>
        ) : (
          <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-red-900/50 text-red-400 border border-red-700/50">
            No; {rule.violations} violation{rule.violations !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function Home() {
  const [smiles, setSmiles] = useState("");
  const [result, setResult] = useState<MoleculeData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiBase, setApiBase] = useState("http://localhost:8000");

  useEffect(() => {
    setApiBase(`http://${window.location.hostname}:8000`);
  }, []);

  async function handleVisualize() {
    const trimmed = smiles.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch(`${apiBase}/api/visualize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smiles: trimmed }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.detail || "Server error: " + res.status);
      }
      const data: MoleculeData = await res.json();
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to connect to the backend.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 px-6 py-5">
        <div className="mx-auto max-w-5xl flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-lg font-bold">
            ⌬
          </div>
          <h1 className="text-xl font-semibold tracking-tight">SMILES Visualizer</h1>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8 space-y-8">
        {/* Input */}
        <section>
          <label htmlFor="smiles-input" className="block text-sm font-medium text-slate-400 mb-2">
            Enter a SMILES string
          </label>
          <div className="flex gap-3">
            <input
              id="smiles-input"
              type="text"
              value={smiles}
              onChange={(e) => setSmiles(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleVisualize(); }}
              placeholder="e.g. CC(=O)Oc1ccccc1C(=O)O"
              className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-base font-mono placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-colors"
              spellCheck={false}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => handleVisualize()}
              disabled={loading}
              className="rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {loading ? "Analyzing…" : "Visualize"}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="text-xs text-slate-500 self-center mr-1">Try:</span>
            {EXAMPLES.map((m) => (
              <button
                key={m.smiles}
                type="button"
                onClick={() => { setSmiles(m.smiles); setError(""); }}
                className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400 hover:border-emerald-600 hover:text-emerald-400 transition-colors"
              >
                {m.name}
              </button>
            ))}
          </div>
        </section>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-5 py-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* Row 1: Structure + Radar + Canonical SMILES */}
            <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
              {/* Molecule SVG */}
              <div className="rounded-xl border border-slate-800 bg-white p-6 flex items-center justify-center min-h-[350px]">
                <div dangerouslySetInnerHTML={{ __html: result.svg }} />
              </div>

              {/* Radar + SMILES */}
              <div className="space-y-4">
                <SectionCard title="Bioavailability radar">
                  <div className="flex justify-center">
                    <RadarChart data={result.radar} />
                  </div>
                </SectionCard>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  <span className="text-xs text-slate-500">Canonical SMILES</span>
                  <p className="text-xs font-mono text-slate-200 mt-1 break-all">
                    {result.smiles}
                  </p>
                </div>
              </div>
            </div>

            {/* Row 2: Property sections grid */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Physicochemical */}
              <SectionCard title="Physicochemical properties">
                <PropRow label="Formula" value={result.physicochemical.formula} />
                <PropRow label="Molecular weight" value={`${result.physicochemical.mw} g/mol`} />
                <PropRow label="Heavy atoms" value={result.physicochemical.heavy_atoms} />
                <PropRow label="Aromatic heavy atoms" value={result.physicochemical.aromatic_heavy_atoms} />
                <PropRow label="Fraction Csp³" value={result.physicochemical.fraction_csp3} />
                <PropRow label="Rotatable bonds" value={result.physicochemical.rotatable_bonds} />
                <PropRow label="H-bond acceptors" value={result.physicochemical.hba} />
                <PropRow label="H-bond donors" value={result.physicochemical.hbd} />
                <PropRow label="Molar refractivity" value={result.physicochemical.molar_refractivity} />
                <PropRow label="TPSA" value={`${result.physicochemical.tpsa} Å²`} />
              </SectionCard>

              {/* Lipophilicity + Solubility */}
              <div className="space-y-6">
                <SectionCard title="Lipophilicity">
                  <PropRow label="Log P (Crippen)" value={result.lipophilicity.crippen_logp} />
                </SectionCard>

                <SectionCard title="Water solubility (ESOL)">
                  <PropRow label="Log S" value={result.solubility.esol_logs} />
                  <PropRow label="Solubility (mg/mL)" value={result.solubility.esol_mg_ml.toExponential(2)} />
                  <PropRow label="Solubility (mol/L)" value={result.solubility.esol_mol_l.toExponential(2)} />
                  <PropRow label="Class" value={result.solubility.esol_class} />
                </SectionCard>
              </div>

              {/* Druglikeness */}
              <SectionCard title="Druglikeness">
                <RuleBadge name="Lipinski" rule={result.druglikeness.lipinski} />
                <RuleBadge name="Ghose" rule={result.druglikeness.ghose} />
                <RuleBadge name="Veber" rule={result.druglikeness.veber} />
                <RuleBadge name="Egan" rule={result.druglikeness.egan} />
                <RuleBadge name="Muegge" rule={result.druglikeness.muegge} />
                <div className="flex items-center justify-between pt-3 mt-1 border-t border-slate-700">
                  <span className="text-xs text-slate-300">Bioavailability score</span>
                  <span className="text-sm font-semibold text-emerald-400">
                    {result.druglikeness.bioavailability_score}
                  </span>
                </div>
              </SectionCard>

              {/* Medicinal Chemistry */}
              <SectionCard title="Medicinal chemistry">
                <div className="flex items-center justify-between py-2 border-b border-slate-800/50">
                  <span className="text-xs text-slate-300">PAINS alerts</span>
                  <span
                    className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${
                      result.medicinal_chemistry.pains_alerts === 0
                        ? "bg-emerald-900/50 text-emerald-400 border-emerald-700/50"
                        : "bg-red-900/50 text-red-400 border-red-700/50"
                    }`}
                  >
                    {result.medicinal_chemistry.pains_alerts === 0
                      ? "0 alert"
                      : `${result.medicinal_chemistry.pains_alerts} alert${result.medicinal_chemistry.pains_alerts > 1 ? "s" : ""}`}
                  </span>
                </div>
                {result.medicinal_chemistry.pains_descriptions.length > 0 && (
                  <div className="py-1.5 text-xs text-red-300">
                    {result.medicinal_chemistry.pains_descriptions.join(", ")}
                  </div>
                )}
                <RuleBadge name="Leadlikeness" rule={result.medicinal_chemistry.leadlikeness} />
                <div className="flex items-center justify-between py-2 border-b border-slate-800/50">
                  <span className="text-xs text-slate-300">Synthetic accessibility</span>
                  <span className="text-sm font-mono text-slate-200">
                    {result.medicinal_chemistry.sa_score !== null
                      ? result.medicinal_chemistry.sa_score
                      : "N/A"}
                  </span>
                </div>
                {result.medicinal_chemistry.sa_score !== null && (
                  <div className="mt-2">
                    <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                      <span>Easy (1)</span>
                      <span>Hard (10)</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-red-500"
                        style={{
                          width: `${((result.medicinal_chemistry.sa_score) / 10) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </SectionCard>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
