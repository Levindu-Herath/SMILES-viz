"""
SMILES Molecule Visualizer — FastAPI Backend
Converts SMILES strings to SVG molecular structure images via RDKit.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from rdkit import Chem
from rdkit.Chem import Draw, Descriptors, rdMolDescriptors

app = FastAPI(title="SMILES Visualizer API", version="1.0.0")

# In development, allow any origin so LAN access works.
# For production, lock this down to your deployed frontend URL.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


class SmilesRequest(BaseModel):
    smiles: str = Field(..., min_length=1, max_length=500, examples=["CCO", "c1ccccc1"])


class MoleculeResponse(BaseModel):
    svg: str
    canonical_smiles: str
    molecular_formula: str
    molecular_weight: float
    num_atoms: int
    num_bonds: int
    logp: float
    hbd: int  # hydrogen bond donors
    hba: int  # hydrogen bond acceptors


@app.post("/api/visualize", response_model=MoleculeResponse)
def visualize_smiles(req: SmilesRequest):
    mol = Chem.MolFromSmiles(req.smiles)
    if mol is None:
        raise HTTPException(status_code=422, detail=f"Invalid SMILES string: '{req.smiles}'")

    # Generate SVG
    drawer = Draw.MolDraw2DSVG(450, 350)
    drawer.drawOptions().addStereoAnnotation = True
    drawer.DrawMolecule(mol)
    drawer.FinishDrawing()
    svg = drawer.GetDrawingText()

    # Compute descriptors
    return MoleculeResponse(
        svg=svg,
        canonical_smiles=Chem.MolToSmiles(mol),
        molecular_formula=rdMolDescriptors.CalcMolFormula(mol),
        molecular_weight=round(Descriptors.MolWt(mol), 2),
        num_atoms=mol.GetNumAtoms(),
        num_bonds=mol.GetNumBonds(),
        logp=round(Descriptors.MolLogP(mol), 2),
        hbd=Descriptors.NumHDonors(mol),
        hba=Descriptors.NumHAcceptors(mol),
    )


@app.get("/api/health")
def health():
    return {"status": "ok"}
