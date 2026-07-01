"""
Pydantic schemas for molecule-related requests and responses.
"""

from typing import Optional

from pydantic import BaseModel, Field

from app.core.config import settings


# ---------------------------------------------------------------------------
# Request
# ---------------------------------------------------------------------------
class SmilesRequest(BaseModel):
    smiles: str = Field(..., min_length=1, max_length=settings.SMILES_MAX_LENGTH)


# ---------------------------------------------------------------------------
# Response sub-models
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


class RadarData(BaseModel):
    lipo: float
    size: float
    polar: float
    insolu: float
    insatu: float
    flex: float


# ---------------------------------------------------------------------------
# Top-level response
# ---------------------------------------------------------------------------
class MoleculeResponse(BaseModel):
    svg: str
    smiles: str
    physicochemical: Physicochemical
    lipophilicity: LipophilicityData
    solubility: SolubilityData
    druglikeness: DruglikenessData
    medicinal_chemistry: MedChemData
    radar: RadarData
