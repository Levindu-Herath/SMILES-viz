export interface Physicochemical {
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

export interface RuleResult {
  passes: boolean;
  violations: number;
  details: string[];
}

export interface RadarValues {
  lipo: number;
  size: number;
  polar: number;
  insolu: number;
  insatu: number;
  flex: number;
}

export interface MoleculeData {
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
  radar: RadarValues;
}
