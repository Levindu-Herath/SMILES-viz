# SMILES Molecule Visualizer

A Next.js + FastAPI application that renders chemical SMILES strings as 2D molecular structure diagrams using RDKit.

## Architecture

```
┌──────────────────┐        POST /api/visualize       ┌──────────────────┐
│   Next.js (3000) │  ──────────────────────────────▶  │  FastAPI (8000)  │
│   React Frontend │  ◀──────────────────────────────  │  RDKit + Python  │
└──────────────────┘        JSON { svg, props }        └──────────────────┘
```

## Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.11 or 3.12 (NOT 3.1 — that's from 2009)
- A virtual environment tool (venv, conda, etc.)

---

## 1. Backend Setup (FastAPI + RDKit)

```bash
cd backend

# Create and activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate    # macOS/Linux
# .venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt

# Run the server
uvicorn main:app --reload --port 8000
```

Verify it works:
```bash
curl -X POST http://localhost:8000/api/visualize \
  -H "Content-Type: application/json" \
  -d '{"smiles": "CCO"}'
```

You should get a JSON response with an `svg` field and molecular properties.

---

## 2. Frontend Setup (Next.js)

```bash
# From the project root
npx create-next-app@latest frontend --typescript --tailwind --app --eslint --src-dir=false --import-alias="@/*" --use-npm

# Replace the generated page with the provided one
cp frontend/page.tsx frontend/app/page.tsx
```

> **Note:** After scaffolding, replace `frontend/app/page.tsx` with the `page.tsx` file from this repo.

```bash
cd frontend
npm run dev
```

Open http://localhost:3000. Type a SMILES string (e.g. `CCO`) and click **Visualize**.

---

## 3. Project Structure

```
smiles-viz/
├── backend/
│   ├── main.py               # FastAPI app — SMILES → SVG + descriptors
│   └── requirements.txt
└── frontend/
    └── app/
        └── page.tsx           # Next.js page — input + rendering UI
```

---

## How It Works

1. User enters a SMILES string in the frontend.
2. Frontend `POST`s `{ "smiles": "..." }` to `http://localhost:8000/api/visualize`.
3. Backend parses the SMILES with `rdkit.Chem.MolFromSmiles()`.
4. If valid, RDKit draws the molecule as SVG and computes descriptors (MW, LogP, formula, etc.).
5. Frontend renders the SVG inline and shows the property panel.

---

## Common SMILES Examples

| Molecule     | SMILES                                        |
|-------------|-----------------------------------------------|
| Ethanol     | `CCO`                                          |
| Benzene     | `c1ccccc1`                                     |
| Aspirin     | `CC(=O)Oc1ccccc1C(=O)O`                       |
| Caffeine    | `Cn1c(=O)c2c(ncn2C)n(C)c1=O`                 |
| Ibuprofen   | `CC(C)Cc1ccc(cc1)C(C)C(=O)O`                  |
| Dopamine    | `NCCc1ccc(O)c(O)c1`                           |

---

## Troubleshooting

**`rdkit-pypi` fails to install:**
Use conda instead: `conda install -c conda-forge rdkit`

**CORS errors in browser console:**
Make sure the FastAPI backend is running on port 8000. The CORS middleware is configured for `http://localhost:3000`.

**"Invalid SMILES string" error:**
Double-check your SMILES syntax. Use canonical SMILES from PubChem or ChEMBL if unsure.
