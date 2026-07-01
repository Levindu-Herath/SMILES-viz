import type { MoleculeData } from "@/types/molecule";
import { SectionCard } from "@/components/ui/SectionCard";
import { PropRow } from "@/components/ui/PropRow";
import { RuleBadge } from "@/components/ui/RuleBadge";
import { RadarChart } from "./RadarChart";

interface MoleculeResultsProps {
  data: MoleculeData;
}

export function MoleculeResults({ data }: MoleculeResultsProps) {
  const { physicochemical: phys, lipophilicity, solubility, druglikeness, medicinal_chemistry: medchem } = data;

  return (
    <div className="space-y-6">
      {/* Row 1: Structure + Radar + Canonical SMILES */}
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Molecule SVG */}
        <div className="rounded-xl border border-slate-800 bg-white p-6 flex items-center justify-center min-h-[350px]">
          <div dangerouslySetInnerHTML={{ __html: data.svg }} />
        </div>

        {/* Radar + SMILES */}
        <div className="space-y-4">
          <SectionCard title="Bioavailability radar">
            <div className="flex justify-center">
              <RadarChart data={data.radar} />
            </div>
          </SectionCard>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <span className="text-xs text-slate-500">Canonical SMILES</span>
            <p className="text-xs font-mono text-slate-200 mt-1 break-all">
              {data.smiles}
            </p>
          </div>
        </div>
      </div>

      {/* Row 2: Property sections grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Physicochemical */}
        <SectionCard title="Physicochemical properties">
          <PropRow label="Formula" value={phys.formula} />
          <PropRow label="Molecular weight" value={`${phys.mw} g/mol`} />
          <PropRow label="Heavy atoms" value={phys.heavy_atoms} />
          <PropRow label="Aromatic heavy atoms" value={phys.aromatic_heavy_atoms} />
          <PropRow label="Fraction Csp³" value={phys.fraction_csp3} />
          <PropRow label="Rotatable bonds" value={phys.rotatable_bonds} />
          <PropRow label="H-bond acceptors" value={phys.hba} />
          <PropRow label="H-bond donors" value={phys.hbd} />
          <PropRow label="Molar refractivity" value={phys.molar_refractivity} />
          <PropRow label="TPSA" value={`${phys.tpsa} Å²`} />
        </SectionCard>

        {/* Lipophilicity + Solubility */}
        <div className="space-y-6">
          <SectionCard title="Lipophilicity">
            <PropRow label="Log P (Crippen)" value={lipophilicity.crippen_logp} />
          </SectionCard>

          <SectionCard title="Water solubility (ESOL)">
            <PropRow label="Log S" value={solubility.esol_logs} />
            <PropRow label="Solubility (mg/mL)" value={solubility.esol_mg_ml.toExponential(2)} />
            <PropRow label="Solubility (mol/L)" value={solubility.esol_mol_l.toExponential(2)} />
            <PropRow label="Class" value={solubility.esol_class} />
          </SectionCard>
        </div>

        {/* Druglikeness */}
        <SectionCard title="Druglikeness">
          <RuleBadge name="Lipinski" rule={druglikeness.lipinski} />
          <RuleBadge name="Ghose" rule={druglikeness.ghose} />
          <RuleBadge name="Veber" rule={druglikeness.veber} />
          <RuleBadge name="Egan" rule={druglikeness.egan} />
          <RuleBadge name="Muegge" rule={druglikeness.muegge} />
          <div className="flex items-center justify-between pt-3 mt-1 border-t border-slate-700">
            <span className="text-xs text-slate-300">Bioavailability score</span>
            <span className="text-sm font-semibold text-emerald-400">
              {druglikeness.bioavailability_score}
            </span>
          </div>
        </SectionCard>

        {/* Medicinal Chemistry */}
        <SectionCard title="Medicinal chemistry">
          <div className="flex items-center justify-between py-2 border-b border-slate-800/50">
            <span className="text-xs text-slate-300">PAINS alerts</span>
            <span
              className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${
                medchem.pains_alerts === 0
                  ? "bg-emerald-900/50 text-emerald-400 border-emerald-700/50"
                  : "bg-red-900/50 text-red-400 border-red-700/50"
              }`}
            >
              {medchem.pains_alerts === 0
                ? "0 alert"
                : `${medchem.pains_alerts} alert${medchem.pains_alerts > 1 ? "s" : ""}`}
            </span>
          </div>
          {medchem.pains_descriptions.length > 0 && (
            <div className="py-1.5 text-xs text-red-300">
              {medchem.pains_descriptions.join(", ")}
            </div>
          )}
          <RuleBadge name="Leadlikeness" rule={medchem.leadlikeness} />
          <div className="flex items-center justify-between py-2 border-b border-slate-800/50">
            <span className="text-xs text-slate-300">Synthetic accessibility</span>
            <span className="text-sm font-mono text-slate-200">
              {medchem.sa_score !== null ? medchem.sa_score : "N/A"}
            </span>
          </div>
          {medchem.sa_score !== null && (
            <div className="mt-2">
              <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                <span>Easy (1)</span>
                <span>Hard (10)</span>
              </div>
              <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-red-500"
                  style={{ width: `${(medchem.sa_score / 10) * 100}%` }}
                />
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
