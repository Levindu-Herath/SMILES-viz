"""
SMILES Molecule Visualizer — FastAPI Backend v2
Comprehensive molecular property computation via RDKit.
Covers: physicochemical, lipophilicity, ESOL solubility,
druglikeness (Lipinski/Ghose/Veber/Egan/Muegge), medicinal chemistry
(PAINS, SA score, leadlikeness), and bioavailability radar data.
"""

import math
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from rdkit import Chem
from rdkit.Chem import Draw, Descriptors, rdMolDescriptors, Lipinski
from rdkit.Chem.FilterCatalog import FilterCatalog, FilterCatalogParams

# ---------------------------------------------------------------------------
# SA Score loader (Contrib location varies across installs)
# ---------------------------------------------------------------------------
_sa_scorer_fn = None
try:
    from rdkit.Contrib.SA_Score import sascorer as _sa_mod
    _sa_scorer_fn = _sa_mod.calculateScore
except Exception:
    try:
        import os, importlib.util
        from rdkit.Chem import RDConfig
        _p = os.path.join(RDConfig.RDContribDir, "SA_Score", "sascorer.py")
        _spec = importlib.util.spec_from_file_location("sascorer", _p)
        _m = importlib.util.module_from_spec(_spec)
        _spec.loader.exec_module(_m)
        _sa_scorer_fn = _m.calculateScore
    except Exception:
        pass


def calc_sa_score(mol) -> Optional[float]:
    if _sa_scorer_fn is None:
        return None
    try:
        return round(_sa_scorer_fn(mol), 2)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# PAINS catalog (initialised once)
# ---------------------------------------------------------------------------
_pains_params = FilterCatalogParams()
_pains_params.AddCatalog(FilterCatalogParams.FilterCatalogs.PAINS)
_pains_catalog = FilterCatalog(_pains_params)

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(title="SMILES Visualizer API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------
class Physicochemical(BaseModel):
    formula: str
    mw: float
    heavy_atoms: int
    aromatic_heavy_atoms: int
    fraction_csp3: float
    rotatable_bonds: int
    hba: int
    hbd: int
    molar_refractivity: float
    tpsa: float


class LipophilicityData(BaseModel):
    crippen_logp: float


class SolubilityData(BaseModel):
    esol_logs: float
    esol_mg_ml: float
    esol_mol_l: float
    esol_class: str


class RuleResult(BaseModel):
    passes: bool
    violations: int
    details: list[str]


class DruglikenessData(BaseModel):
    lipinski: RuleResult
    ghose: RuleResult
    veber: RuleResult
    egan: RuleResult
    muegge: RuleResult
    bioavailability_score: float


class MedChemData(BaseModel):
    pains_alerts: int
    pains_descriptions: list[str]
    sa_score: Optional[float]
    leadlikeness: RuleResult
    # Brenk not in RDKit FilterCatalog by default — omitted


class RadarData(BaseModel):
    lipo: float
    size: float
    polar: float
    insolu: float
    insatu: float
    flex: float


class MoleculeResponse(BaseModel):
    svg: str
    smiles: str
    physicochemical: Physicochemical
    lipophilicity: LipophilicityData
    solubility: SolubilityData
    druglikeness: DruglikenessData
    medicinal_chemistry: MedChemData
    radar: RadarData


class SmilesRequest(BaseModel):
    smiles: str = Field(..., min_length=1, max_length=500)


# ---------------------------------------------------------------------------
# Computation helpers
# ---------------------------------------------------------------------------
def _esol(logp: float, mw: float, rb: int, ap: float) -> float:
    """Delaney ESOL: estimated aqueous solubility (log S)."""
    return 0.16 - 0.63 * logp - 0.0062 * mw + 0.066 * rb - 0.74 * ap


def _solubility_class(logs: float) -> str:
    if logs >= 0:
        return "Highly soluble"
    elif logs > -2:
        return "Soluble"
    elif logs > -4:
        return "Moderately soluble"
    elif logs > -6:
        return "Poorly soluble"
    else:
        return "Insoluble"


def _check_lipinski(mw, logp, hbd, hba) -> RuleResult:
    violations = []
    if mw > 500:
        violations.append(f"MW {mw:.1f} > 500")
    if logp > 5:
        violations.append(f"LogP {logp:.2f} > 5")
    if hbd > 5:
        violations.append(f"HBD {hbd} > 5")
    if hba > 10:
        violations.append(f"HBA {hba} > 10")
    return RuleResult(
        passes=len(violations) <= 1,
        violations=len(violations),
        details=violations,
    )


def _check_ghose(mw, logp, mr, total_atoms) -> RuleResult:
    violations = []
    if not (160 <= mw <= 480):
        violations.append(f"MW {mw:.1f} not in [160, 480]")
    if not (-0.4 <= logp <= 5.6):
        violations.append(f"LogP {logp:.2f} not in [-0.4, 5.6]")
    if not (40 <= mr <= 130):
        violations.append(f"MR {mr:.2f} not in [40, 130]")
    if not (20 <= total_atoms <= 70):
        violations.append(f"Atoms {total_atoms} not in [20, 70]")
    return RuleResult(passes=len(violations) == 0, violations=len(violations), details=violations)


def _check_veber(rb, tpsa) -> RuleResult:
    violations = []
    if rb > 10:
        violations.append(f"Rotatable bonds {rb} > 10")
    if tpsa > 140:
        violations.append(f"TPSA {tpsa:.2f} > 140")
    return RuleResult(passes=len(violations) == 0, violations=len(violations), details=violations)


def _check_egan(logp, tpsa) -> RuleResult:
    violations = []
    if logp > 5.88:
        violations.append(f"LogP {logp:.2f} > 5.88")
    if tpsa > 131.6:
        violations.append(f"TPSA {tpsa:.2f} > 131.6")
    return RuleResult(passes=len(violations) == 0, violations=len(violations), details=violations)


def _check_muegge(mol, mw, logp, tpsa, rb, hba, hbd) -> RuleResult:
    violations = []
    ring_count = Descriptors.RingCount(mol)
    num_carbons = sum(1 for a in mol.GetAtoms() if a.GetAtomicNum() == 6)
    num_hetero = sum(1 for a in mol.GetAtoms() if a.GetAtomicNum() not in (1, 6))

    if not (200 <= mw <= 600):
        violations.append(f"MW {mw:.1f} not in [200, 600]")
    if not (-2 <= logp <= 5):
        violations.append(f"LogP {logp:.2f} not in [-2, 5]")
    if tpsa > 150:
        violations.append(f"TPSA {tpsa:.2f} > 150")
    if ring_count > 7:
        violations.append(f"Rings {ring_count} > 7")
    if num_carbons <= 4:
        violations.append(f"Carbons {num_carbons} <= 4")
    if num_hetero <= 1:
        violations.append(f"Heteroatoms {num_hetero} <= 1")
    if rb > 15:
        violations.append(f"Rotatable bonds {rb} > 15")
    if hba > 10:
        violations.append(f"HBA {hba} > 10")
    if hbd > 5:
        violations.append(f"HBD {hbd} > 5")
    return RuleResult(passes=len(violations) == 0, violations=len(violations), details=violations)


def _check_leadlikeness(mw, logp, rb) -> RuleResult:
    violations = []
    if mw > 350:
        violations.append(f"MW {mw:.1f} > 350")
    if logp > 3.5:
        violations.append(f"LogP {logp:.2f} > 3.5")
    if rb > 7:
        violations.append(f"Rotatable bonds {rb} > 7")
    return RuleResult(passes=len(violations) == 0, violations=len(violations), details=violations)


def _bioavailability_score(lipinski_violations: int) -> float:
    """Abbott bioavailability score (simplified)."""
    return 0.55 if lipinski_violations <= 1 else 0.11


def _clamp01(val: float, lo: float, hi: float) -> float:
    """Normalise val from [lo, hi] to [0, 1], clamped."""
    if hi == lo:
        return 0.5
    return max(0.0, min(1.0, (val - lo) / (hi - lo)))


# ---------------------------------------------------------------------------
# Main endpoint
# ---------------------------------------------------------------------------
@app.post("/api/visualize", response_model=MoleculeResponse)
def visualize_smiles(req: SmilesRequest):
    mol = Chem.MolFromSmiles(req.smiles)
    if mol is None:
        raise HTTPException(status_code=422, detail=f"Invalid SMILES string: '{req.smiles}'")

    # --- SVG ---
    drawer = Draw.MolDraw2DSVG(450, 350)
    drawer.drawOptions().addStereoAnnotation = True
    drawer.DrawMolecule(mol)
    drawer.FinishDrawing()
    svg = drawer.GetDrawingText()

    # --- Base descriptors ---
    mw = round(Descriptors.MolWt(mol), 2)
    logp = round(Descriptors.MolLogP(mol), 2)
    hba = Descriptors.NumHAcceptors(mol)
    hbd = Descriptors.NumHDonors(mol)
    tpsa = round(Descriptors.TPSA(mol), 2)
    rb = Descriptors.NumRotatableBonds(mol)
    mr = round(Descriptors.MolMR(mol), 2)
    heavy = mol.GetNumHeavyAtoms()
    aromatic_heavy = sum(1 for a in mol.GetAtoms() if a.GetIsAromatic())
    fraction_csp3 = round(rdMolDescriptors.CalcFractionCSP3(mol), 2)
    formula = rdMolDescriptors.CalcMolFormula(mol)
    total_atoms = mol.GetNumAtoms()

    # --- ESOL ---
    ap = aromatic_heavy / heavy if heavy > 0 else 0
    esol_logs = round(_esol(logp, mw, rb, ap), 2)
    esol_mol_l = round(10 ** esol_logs, 6)
    esol_mg_ml = round(esol_mol_l * mw, 6)

    # --- Druglikeness ---
    lipinski = _check_lipinski(mw, logp, hbd, hba)
    ghose = _check_ghose(mw, logp, mr, total_atoms)
    veber = _check_veber(rb, tpsa)
    egan = _check_egan(logp, tpsa)
    muegge = _check_muegge(mol, mw, logp, tpsa, rb, hba, hbd)
    ba_score = _bioavailability_score(lipinski.violations)

    # --- PAINS ---
    pains_entries = _pains_catalog.GetMatches(mol)
    pains_alerts = len(pains_entries)
    pains_descs = [e.GetDescription() for e in pains_entries]

    # --- SA Score ---
    sa = calc_sa_score(mol)

    # --- Leadlikeness ---
    leadlike = _check_leadlikeness(mw, logp, rb)

    # --- Radar (normalised 0-1) ---
    # SwissADME-style optimal ranges
    radar = RadarData(
        lipo=_clamp01(logp, -0.7, 5.0),
        size=_clamp01(mw, 150, 500),
        polar=_clamp01(tpsa, 20, 130),
        insolu=_clamp01(-esol_logs, 0, 6),
        insatu=_clamp01(fraction_csp3, 0.25, 1.0),
        flex=_clamp01(rb, 0, 9),
    )

    return MoleculeResponse(
        svg=svg,
        smiles=Chem.MolToSmiles(mol),
        physicochemical=Physicochemical(
            formula=formula, mw=mw, heavy_atoms=heavy,
            aromatic_heavy_atoms=aromatic_heavy, fraction_csp3=fraction_csp3,
            rotatable_bonds=rb, hba=hba, hbd=hbd,
            molar_refractivity=mr, tpsa=tpsa,
        ),
        lipophilicity=LipophilicityData(crippen_logp=logp),
        solubility=SolubilityData(
            esol_logs=esol_logs, esol_mg_ml=esol_mg_ml,
            esol_mol_l=esol_mol_l, esol_class=_solubility_class(esol_logs),
        ),
        druglikeness=DruglikenessData(
            lipinski=lipinski, ghose=ghose, veber=veber,
            egan=egan, muegge=muegge, bioavailability_score=ba_score,
        ),
        medicinal_chemistry=MedChemData(
            pains_alerts=pains_alerts, pains_descriptions=pains_descs,
            sa_score=sa, leadlikeness=leadlike,
        ),
        radar=radar,
    )


@app.get("/api/health")
def health():
    return {"status": "ok"}
