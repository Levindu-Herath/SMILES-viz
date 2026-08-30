# Molytica

A cheminformatics web app for molecular visualisation, bioactivity prediction, and local model
training. Paste a SMILES string (or a compound name, resolved via PubChem), and Molytica renders
the 2D structure, computes physicochemical/druglikeness properties, and — if you pick a trained
model — predicts bioactivity with an atom/substructure-level explainability heatmap.

## Architecture

```
┌───────────────────┐   /api/*             ┌──────────────────────┐
│  Next.js frontend  │ ───────────────────▶ │  FastAPI cloud       │
│  (visualize/train/ │ ◀─────────────────── │  backend             │
│   datasets pages)  │   JSON                │  (RDKit + inference) │
└─────────┬──────────┘                      └───────────┬──────────┘
          │ localhost:5000                              │ Supabase
          ▼                                              ▼
┌───────────────────┐                        Auth (optional JWT) +
│  molytica-trainer  │                        "datasets" storage bucket
│  (local, user's    │
│   own machine)     │
└────────────────────┘
```

- **Frontend** — Next.js (App Router) app with pages for visualising molecules, running
  predictions, browsing/uploading shared datasets, and driving local model training.
- **Backend** — FastAPI service that renders SMILES to SVG with RDKit, serves bioactivity
  predictions and explainability heatmaps, and manages shared datasets in Supabase Storage/Postgres.
  The prediction pipeline is WL graph kernel → FDDL sparse dictionary coding → scaler → sklearn
  classifier. The backend deliberately avoids PyTorch at inference time: sparse coding is
  re-implemented as a pure-NumPy ISTA solver, so predictions run torch-free. Trained artifacts and
  the ML library itself come from `backend/sparsegraphs`, a git submodule (read-only from this
  repo's perspective).
- **`molytica-trainer`** — a separate, locally-run FastAPI server ("bring your own compute") for
  training new models on your own dataset. It runs on the user's machine, not in the cloud, so
  training never needs GPU capacity on the hosted backend.

## API endpoints (backend, default `http://localhost:8000`)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/health` | GET | Liveness check |
| `/api/visualize` | POST | SMILES → SVG structure + physicochemical/druglikeness properties |
| `/api/predict` | POST | SMILES + model name → bioactivity prediction |
| `/api/predict/heatmap` | POST | SMILES + model name → atom/substructure importance heatmap |
| `/api/predict/models` | GET | List available trained models and their metrics |
| `/api/datasets` | GET | List shared datasets |
| `/api/datasets/upload` | POST | Upload a dataset (multipart) |
| `/api/datasets/{id}/download` | GET | Get a signed download URL |
| `/api/datasets/{id}` | DELETE | Delete a dataset (owner-only) |

Auth (Supabase JWT, sent as a bearer token) is **optional** on every route — it attributes uploads
and identifies the requesting user when present, but no feature is gated behind signing in.

## Backend setup (FastAPI + RDKit)

RDKit is installed via conda, not pip.

```bash
cd backend
conda create -n smiles-viz python=3.11 rdkit -c conda-forge -y
conda activate smiles-viz
pip install -r requirements.txt

cp .env.example .env   # fill in Supabase URL / JWT secret / service-role key
uvicorn main:app --reload --port 8000
```

Relevant env vars (see `backend/.env.example`): `APP_NAME`, `DEBUG`, `CORS_ORIGINS`, `HOST`,
`PORT`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `ARTIFACT_DIR` (path to
the trained model bundle inside the `sparsegraphs` submodule).

Verify it works:

```bash
curl -X POST http://localhost:8000/api/visualize \
  -H "Content-Type: application/json" \
  -d '{"smiles": "CCO"}'
```

A Docker image is also provided (`backend/Dockerfile`, conda-based, RDKit from conda-forge).

## Frontend setup (Next.js)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. Set `NEXT_PUBLIC_API_URL` to point at the backend if it isn't running
on `http://localhost:8000`.

## Local trainer (`molytica-trainer`)

Trains new models on your own dataset, entirely on your own machine — no GPU access on the hosted
backend is required.

```bash
cd molytica-trainer
pip install -e .
molytica-train              # binds to 127.0.0.1:5000 by default
molytica-train --port 5001  # or a custom port
```

The `/train` page in the frontend talks to this server directly (`http://localhost:5000`) once
it's running. Additional CORS origins can be set via the `ALLOWED_ORIGINS` env var.

## External integrations

- **Supabase** — optional auth (JWT), plus the `datasets` storage bucket and Postgres table backing
  the shared dataset library.
- **PubChem PUG REST API** — called directly from the browser to resolve a typed compound name to
  a canonical SMILES string before visualisation/prediction.

## Common SMILES examples

| Molecule     | SMILES                                        |
|-------------|-----------------------------------------------|
| Ethanol     | `CCO`                                          |
| Benzene     | `c1ccccc1`                                     |
| Aspirin     | `CC(=O)Oc1ccccc1C(=O)O`                       |
| Caffeine    | `Cn1c(=O)c2c(ncn2C)n(C)c1=O`                 |
| Ibuprofen   | `CC(C)Cc1ccc(cc1)C(C)C(=O)O`                  |
| Dopamine    | `NCCc1ccc(O)c(O)c1`                           |

## Troubleshooting

**`rdkit` fails to install:** use conda (`conda install -c conda-forge rdkit`), not `pip install
rdkit-pypi`.

**CORS errors in the browser console:** make sure the FastAPI backend is running and that its
`CORS_ORIGINS` includes your frontend's origin (defaults to `http://localhost:3000`).

**"Invalid SMILES string" error:** double-check your SMILES syntax. Use canonical SMILES from
PubChem or ChEMBL if unsure.
