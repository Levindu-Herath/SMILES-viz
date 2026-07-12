"""
Router for molecule visualization endpoints.
Thin HTTP layer — all logic lives in the service.
"""

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import get_current_user
from app.schemas.molecule import MoleculeResponse, SmilesRequest
from app.services.molecule_service import analyze_molecule

router = APIRouter(prefix="/api", tags=["molecule"])


@router.post("/visualize", response_model=MoleculeResponse)
def visualize_smiles(
    req: SmilesRequest,
    user: dict = Depends(get_current_user),
):
    """Protected endpoint — requires a valid Supabase JWT."""
    try:
        return analyze_molecule(req.smiles)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
