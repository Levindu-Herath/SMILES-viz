"""
Pure computational helpers for molecular property evaluation.
These functions are stateless and depend only on their arguments.
"""

from rdkit.Chem import Descriptors

from app.schemas.molecule import RuleResult


# ---------------------------------------------------------------------------
# Solubility (ESOL)
# ---------------------------------------------------------------------------
def esol_log_s(logp: float, mw: float, rb: int, aromatic_proportion: float) -> float:
    """Delaney ESOL: estimated aqueous solubility (log S)."""
    return 0.16 - 0.63 * logp - 0.0062 * mw + 0.066 * rb - 0.74 * aromatic_proportion


def solubility_class(logs: float) -> str:
    if logs >= 0:
        return "Highly soluble"
    if logs > -2:
        return "Soluble"
    if logs > -4:
        return "Moderately soluble"
    if logs > -6:
        return "Poorly soluble"
    return "Insoluble"


# ---------------------------------------------------------------------------
# Druglikeness rules
# ---------------------------------------------------------------------------
def check_lipinski(mw: float, logp: float, hbd: int, hba: int) -> RuleResult:
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


def check_ghose(mw: float, logp: float, mr: float, total_atoms: int) -> RuleResult:
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


def check_veber(rb: int, tpsa: float) -> RuleResult:
    violations = []
    if rb > 10:
        violations.append(f"Rotatable bonds {rb} > 10")
    if tpsa > 140:
        violations.append(f"TPSA {tpsa:.2f} > 140")
    return RuleResult(passes=len(violations) == 0, violations=len(violations), details=violations)


def check_egan(logp: float, tpsa: float) -> RuleResult:
    violations = []
    if logp > 5.88:
        violations.append(f"LogP {logp:.2f} > 5.88")
    if tpsa > 131.6:
        violations.append(f"TPSA {tpsa:.2f} > 131.6")
    return RuleResult(passes=len(violations) == 0, violations=len(violations), details=violations)


def check_muegge(mol, mw: float, logp: float, tpsa: float, rb: int, hba: int, hbd: int) -> RuleResult:
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


def check_leadlikeness(mw: float, logp: float, rb: int) -> RuleResult:
    violations = []
    if mw > 350:
        violations.append(f"MW {mw:.1f} > 350")
    if logp > 3.5:
        violations.append(f"LogP {logp:.2f} > 3.5")
    if rb > 7:
        violations.append(f"Rotatable bonds {rb} > 7")
    return RuleResult(passes=len(violations) == 0, violations=len(violations), details=violations)


# ---------------------------------------------------------------------------
# Bioavailability
# ---------------------------------------------------------------------------
def bioavailability_score(lipinski_violations: int) -> float:
    """Abbott bioavailability score (simplified)."""
    return 0.55 if lipinski_violations <= 1 else 0.11


# ---------------------------------------------------------------------------
# Normalization
# ---------------------------------------------------------------------------
def clamp_normalize(val: float, lo: float, hi: float) -> float:
    """Normalize val from [lo, hi] to [0, 1], clamped."""
    if hi == lo:
        return 0.5
    return max(0.0, min(1.0, (val - lo) / (hi - lo)))
