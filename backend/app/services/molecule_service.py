"""
Service layer for molecule analysis.
Orchestrates descriptor computation, rule checks, and SVG rendering.
"""

from typing import Optional

from rdkit import Chem
from rdkit.Chem import Descriptors, Draw, rdMolDescriptors

from app.core.chem import pains_catalog, sa_scorer_fn
from app.core.config import settings
from app.schemas.molecule import (
    DruglikenessData,
    LipophilicityData,
    MedChemData,
    MoleculeResponse,
    Physicochemical,
    RadarData,
    SolubilityData,
)
from app.utils.chemistry import (
    bioavailability_score,
    check_egan,
    check_ghose,
    check_leadlikeness,
    check_lipinski,
    check_muegge,
    check_veber,
    clamp_normalize,
    esol_log_s,
    solubility_class,
)


def _render_svg(mol) -> str:
    """Render a molecule as an SVG string."""
    drawer = Draw.MolDraw2DSVG(settings.SVG_WIDTH, settings.SVG_HEIGHT)
    drawer.drawOptions().addStereoAnnotation = True
    drawer.DrawMolecule(mol)
    drawer.FinishDrawing()
    return drawer.GetDrawingText()


def _calc_sa_score(mol) -> Optional[float]:
    """Calculate synthetic accessibility score if the scorer is available."""
    if sa_scorer_fn is None:
        return None
    try:
        return round(sa_scorer_fn(mol), 2)
    except Exception:
        return None


def _compute_descriptors(mol) -> dict:
    """Compute all base RDKit descriptors needed downstream."""
    heavy = mol.GetNumHeavyAtoms()
    return {
        "mw": round(Descriptors.MolWt(mol), 2),
        "logp": round(Descriptors.MolLogP(mol), 2),
        "hba": Descriptors.NumHAcceptors(mol),
        "hbd": Descriptors.NumHDonors(mol),
        "tpsa": round(Descriptors.TPSA(mol), 2),
        "rb": Descriptors.NumRotatableBonds(mol),
        "mr": round(Descriptors.MolMR(mol), 2),
        "heavy_atoms": heavy,
        "aromatic_heavy_atoms": sum(1 for a in mol.GetAtoms() if a.GetIsAromatic()),
        "fraction_csp3": round(rdMolDescriptors.CalcFractionCSP3(mol), 2),
        "formula": rdMolDescriptors.CalcMolFormula(mol),
        "total_atoms": mol.GetNumAtoms(),
    }


def analyze_molecule(smiles: str) -> MoleculeResponse:
    """
    Full molecule analysis pipeline.

    Takes a SMILES string, validates it, computes all properties,
    and returns a structured response.

    Raises:
        ValueError: If the SMILES string is invalid.
    """
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError(f"Invalid SMILES string: '{smiles}'")

    # SVG rendering
    svg = _render_svg(mol)

    # Base descriptors
    desc = _compute_descriptors(mol)
    mw, logp, hba, hbd = desc["mw"], desc["logp"], desc["hba"], desc["hbd"]
    tpsa, rb, mr = desc["tpsa"], desc["rb"], desc["mr"]
    heavy = desc["heavy_atoms"]
    aromatic_heavy = desc["aromatic_heavy_atoms"]

    # ESOL solubility
    aromatic_proportion = aromatic_heavy / heavy if heavy > 0 else 0
    logs = round(esol_log_s(logp, mw, rb, aromatic_proportion), 2)
    mol_l = round(10**logs, 6)
    mg_ml = round(mol_l * mw, 6)

    # Druglikeness
    lipinski = check_lipinski(mw, logp, hbd, hba)
    ghose = check_ghose(mw, logp, mr, desc["total_atoms"])
    veber = check_veber(rb, tpsa)
    egan = check_egan(logp, tpsa)
    muegge = check_muegge(mol, mw, logp, tpsa, rb, hba, hbd)
    ba_score = bioavailability_score(lipinski.violations)

    # Medicinal chemistry
    pains_entries = pains_catalog.GetMatches(mol)
    pains_alerts = len(pains_entries)
    pains_descs = [e.GetDescription() for e in pains_entries]
    sa = _calc_sa_score(mol)
    leadlike = check_leadlikeness(mw, logp, rb)

    # Radar (normalized 0–1, SwissADME-style)
    radar = RadarData(
        lipo=clamp_normalize(logp, -0.7, 5.0),
        size=clamp_normalize(mw, 150, 500),
        polar=clamp_normalize(tpsa, 20, 130),
        insolu=clamp_normalize(-logs, 0, 6),
        insatu=clamp_normalize(desc["fraction_csp3"], 0.25, 1.0),
        flex=clamp_normalize(rb, 0, 9),
    )

    return MoleculeResponse(
        svg=svg,
        smiles=Chem.MolToSmiles(mol),
        physicochemical=Physicochemical(
            formula=desc["formula"],
            mw=mw,
            heavy_atoms=heavy,
            aromatic_heavy_atoms=aromatic_heavy,
            fraction_csp3=desc["fraction_csp3"],
            rotatable_bonds=rb,
            hba=hba,
            hbd=hbd,
            molar_refractivity=mr,
            tpsa=tpsa,
        ),
        lipophilicity=LipophilicityData(crippen_logp=logp),
        solubility=SolubilityData(
            esol_logs=logs,
            esol_mg_ml=mg_ml,
            esol_mol_l=mol_l,
            esol_class=solubility_class(logs),
        ),
        druglikeness=DruglikenessData(
            lipinski=lipinski,
            ghose=ghose,
            veber=veber,
            egan=egan,
            muegge=muegge,
            bioavailability_score=ba_score,
        ),
        medicinal_chemistry=MedChemData(
            pains_alerts=pains_alerts,
            pains_descriptions=pains_descs,
            sa_score=sa,
            leadlikeness=leadlike,
        ),
        radar=radar,
    )
