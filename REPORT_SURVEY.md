# Codebase Survey — smiles-viz (Molytica)

Prepared as raw material for an FYP report chapter. All findings are drawn directly from the repository at `f:/Academic/7th sem/FYP/smiles-viz` on 2026-08-05, branch `interpretability`. Where something could not be confirmed in the code, it is explicitly marked **not found** / **unclear** rather than inferred.

---

## 1. Repository structure

### Top-level layout

```
smiles-viz/
├── backend/                  FastAPI cloud backend
│   ├── app/                  routers, schemas, services, core, utils
│   ├── ml_pipeline/          production inference wrapper (inference.py)
│   ├── interpretability/     WL-AKSVD interpreter + research notebook
│   ├── sparsegraphs/         GIT SUBMODULE — WL/FDDL ML library + trained artifacts
│   ├── main.py                app entry point (create_app factory)
│   ├── main.py.bak           stale pre-refactor monolithic version (dead)
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                 Next.js app (App Router)
│   ├── app/                  routes: /, /login, /register, /auth/callback,
│   │                         /datasets, /train, /visualize
│   ├── components/           molecule/, ui/, auth/, FolderBrowserModal.tsx
│   ├── lib/                  api.ts (cloud backend), trainer-api.ts (localhost:5000),
│   │                         supabase.ts
│   ├── constants/            theme.ts ("Clinical Teal"), molecules.ts
│   ├── types/                dataset.ts, molecule.ts, prediction.ts
│   └── package.json
├── smiles-viz-trainer/       Local Python package, pip-installed, NOT a submodule
│   ├── src/smiles_viz_trainer/
│   │   ├── pipeline/         graph encoding, WL, FDDL-GPU, evaluator, runner
│   │   ├── server/           FastAPI app (localhost:5000), routers, schemas
│   │   ├── services/         job_manager.py (single in-memory job slot)
│   │   └── utils/            dataset.py (CSV/SDF validation)
│   ├── pyproject.toml
│   ├── dist/                 pre-built wheel/sdist (0.2.0)
│   └── tests/test_data/      only fixture CSVs, no actual test scripts
└── README.md                 STALE — describes an old pre-auth, pre-ML, 2-endpoint version
```

`backend/sparsegraphs` is a **real git submodule** (`.gitmodules`: url `https://github.com/nimendra-ag/sparsegraphs_results.git`, branch `kanishka`, currently checked out at commit `b01d453456d3fc5c24ceb3ad9f6af5d7a52bf1b9`). `smiles-viz-trainer` is a sibling package in the same repo, not a submodule — it is meant to be installed and run locally by the end user, separately from the cloud backend.

Git branches present: `auth`, `auth-change`, `interpretability` (current), `main`, `prediction`, `theme`, `ui-changes` — naming suggests feature-branch-per-concern development.

### Tech stack per component (exact versions)

**Backend (`backend/requirements.txt`):**
```
fastapi>=0.115.0
uvicorn>=0.30.0
Pillow>=10.0.0
pydantic-settings>=2.0.0
python-jose[cryptography]>=3.3.0
supabase>=2.0.0
python-multipart>=0.0.9
gensim==4.4.0
networkx==3.6.1
scikit-learn==1.9.0
scipy>=1.13.0
joblib==1.5.3
numpy                      # unpinned
```
`rdkit` is **not** in this file — installed via conda in the Dockerfile instead of pip. `torch` is deliberately absent (see §3/§5). Python 3.11 (from Dockerfile).

**Frontend (`frontend/package.json`):**
```
next               16.2.9
react               19.2.4
react-dom            19.2.4
@supabase/supabase-js  ^2.110.2
tailwindcss           ^4        (dev)
@tailwindcss/postcss  ^4        (dev)
typescript            ^5        (dev)
eslint                ^9        (dev)
eslint-config-next   16.2.9     (dev)
```
No state-management library (no Redux/Zustand/SWR/React Query), no UI kit (no Radix/shadcn/MUI), no chart library, no 3D library, no client-side RDKit/cheminformatics package. Package manager: npm.

**smiles-viz-trainer (`smiles-viz-trainer/pyproject.toml`):**
```
fastapi>=0.110
uvicorn[standard]>=0.29
click>=8.0
scikit-learn>=1.3
numpy
pandas
sse-starlette>=1.6
torch>=2.0
gensim>=4.0
networkx>=3.0
```
Python `>=3.10`, build backend `setuptools>=68.0`. `rdkit` is not a declared dependency — README states it must come from a pre-existing conda environment. Package `version = "0.2.0"` in `pyproject.toml`, but `__init__.py` hardcodes `__version__ = "0.1.0"` — **version mismatch**, and `/health` reports the stale `0.1.0`.

**sparsegraphs submodule:** has its own `requirements.txt` (not read in full detail by this survey) — used only at training time; the production backend deliberately avoids most of its heavier dependencies (notably `torch`) at inference time.

### Deployment targets and configs

- **No `vercel.json`** anywhere in the repo.
- **No `render.yaml`** or any Render-specific config file anywhere in the repo.
- A **repo-wide grep for `render.com`, `onrender`, `vercel.app`** across `.md/.ts/.tsx/.py/.toml/.json` files returned **zero matches** — no hardcoded deployment hostnames anywhere in source.
- The only concrete deployment artifact is **`backend/Dockerfile`**:
  ```dockerfile
  FROM continuumio/miniconda3:latest
  WORKDIR /app
  RUN conda create -n smiles-viz python=3.11 rdkit -c conda-forge -y && conda clean -afy
  SHELL ["conda", "run", "-n", "smiles-viz", "/bin/bash", "-c"]
  COPY requirements.txt .
  RUN pip install --no-cache-dir -r requirements.txt
  COPY . .                       # includes sparsegraphs submodule with artifacts
  EXPOSE 8000
  CMD ["conda", "run", "--no-capture-output", "-n", "smiles-viz", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
  ```
  Single-stage build, no non-root user, RDKit version unpinned (conda-forge latest at build time).
- `smiles-viz-trainer` README documents `smiles-train` console script binding to `127.0.0.1:5000` by default — explicitly meant to run **on the end user's own machine**, not deployed.
- **Conclusion: the "Vercel + Render + Supabase" architecture named in the report brief is not documented or configured anywhere in the codebase itself.** It is only *inferable* from: (a) the presence of `NEXT_PUBLIC_*` env vars and standard Next.js structure (consistent with Vercel hosting), (b) the backend's Dockerfile (consistent with a container host such as Render), and (c) real Supabase project credentials in `frontend/.env.local` and `backend/.env`. Treat any diagram naming Vercel/Render explicitly as an *inferred* deployment topology, not a confirmed one — call this out in the report.
- `backend/.env.example` shows the expected runtime configuration surface: `APP_NAME`, `DEBUG`, `CORS_ORIGINS=["http://localhost:3000"]`, `HOST`, `PORT`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `ARTIFACT_DIR` (defaults to `sparsegraphs/artifacts/wl_fddl_gpu_nci_full_atoms32_20260708_202033_20260708_202100`).
- `frontend/.env.local` contains a live Supabase project URL and anon key plus `NEXT_PUBLIC_API_URL=http://localhost:8000` — i.e. the frontend's own env file, as committed/present locally, still points at a **local** backend, not a deployed one. No production API URL is present in the repo.

---

## 2. Frontend (Next.js, App Router)

### Route list

| Route | File | Purpose |
|---|---|---|
| `/` | `app/page.tsx` | Server-side redirect only, to `/visualize` |
| `/login` | `app/login/page.tsx` | Email/password sign-in via Supabase; redirects to `/visualize` if already authenticated |
| `/register` | `app/register/page.tsx` | Sign-up (`supabase.auth.signUp`), shows "check your email" state |
| `/auth/callback` | `app/auth/callback/page.tsx` | Listens for Supabase `SIGNED_IN` event (email-confirmation callback), then routes to `/visualize` |
| `/datasets` | `app/datasets/page.tsx` | Shared dataset library: list/upload/download/delete CSV/TSV/TXT/ZIP files |
| `/train` | `app/train/page.tsx` | Connects to the **local** trainer server (`localhost:5000`); validate → configure → train (SSE progress) |
| `/visualize` | `app/visualize/page.tsx` | Main page: "Visualize" (2D structure + properties) and "Predict" (activity prediction + explainability heatmap) modes; resolves compound names via PubChem before calling the backend |
| (layout) | `app/layout.tsx` | Root layout: `AuthProvider` + `Navbar`, Inter font, title "Molytica" |

Note: `app/layout/` also exists as an **empty directory** — stray artifact, not a functioning route (Next.js needs `page.tsx`/`layout.tsx` inside to register a route).

### Key components

- **`/visualize`**: page-local logic (no dedicated container component); renders `components/molecule/MoleculeResults.tsx` (pure presentational — SVG structure, radar chart, physicochemical/lipophilicity/solubility/druglikeness/medchem `SectionCard`s) and `components/ui/PropRow.tsx`. Calls (via `lib/api.ts`): `getAvailableModels`, `visualizeMolecule`, `predictActivity`, `getPredictionHeatmap`; also calls the public PubChem PUG REST API directly (only `fetch()` call outside `lib/api.ts`/`lib/trainer-api.ts`) to resolve a typed compound name to a canonical SMILES before hitting the backend.
- **`components/molecule/RadarChart.tsx`**: SVG hexagonal bioavailability radar (LIPO/SIZE/POLAR/INSOLU/INSATU/FLEX, SwissADME-style axes), pulls colors from `constants/theme.ts`.
- **`components/molecule/SmilesInput.tsx`**: reusable SMILES input — **currently unused/orphaned**; `/visualize` reimplements its own input inline instead.
- **`/datasets`**: page defines its own `UploadModal`/`DatasetDetailModal` inline (not extracted to `components/`). Calls (via `lib/api.ts`): `listDatasets`, `uploadDataset`, `getDownloadUrl`, `deleteDataset`.
- **`/train`**: uses `components/FolderBrowserModal.tsx` (×2, for dataset path and output dir) plus in-file `CodeBlock`/`SetupStep` helpers for a "local trainer not detected" setup guide. Calls (via `lib/trainer-api.ts`): `checkTrainerHealth`, `uploadDatasetFile`, `validateDataset`, `startTraining`, `getTrainingStatus`, `getTrainingResult`, `subscribeToTraining` (SSE), `browseDirectories`, `createDirectory`, `listDrives`.
- **`components/auth/AuthProvider.tsx`** / **`AuthGuard.tsx`**: see §Auth below.
- **`components/ui/Navbar.tsx`**, **`RuleBadge.tsx`**, **`SectionCard.tsx`**, **`Tooltip.tsx`**: shared presentational primitives.

### `lib/api.ts` (cloud backend, base URL `NEXT_PUBLIC_API_URL` ?? `http://localhost:8000`)

```
POST   /api/visualize            visualizeMolecule(smiles)
GET    /api/predict/models       getAvailableModels()
POST   /api/predict              predictActivity(smiles, modelName)
POST   /api/predict/heatmap      getPredictionHeatmap(smiles, modelName)
POST   /api/datasets/upload      uploadDataset(file, name, description)  (multipart)
GET    /api/datasets             listDatasets()
GET    /api/datasets/{id}/download  getDownloadUrl(datasetId)
DELETE /api/datasets/{id}        deleteDataset(datasetId)
GET    /api/health               checkHealth()
```
Attaches a Supabase bearer token opportunistically when a session exists; falls back to unauthenticated request (no hard gate). Exports `ApiError` (carries HTTP status).

### `lib/trainer-api.ts` (local trainer, hardcoded `const TRAINER_BASE = "http://localhost:5000"`, not env-configurable, no auth headers)

```
GET  /health                            checkTrainerHealth()      (3s timeout)
POST /upload                            uploadDatasetFile(file)
GET  /browse-directories                browseDirectories(...)
POST /browse-directories/create         createDirectory(path)
GET  /browse-directories/drives         listDrives()
POST /validate-dataset                  validateDataset(filePath)
POST /train                             startTraining(req)
GET  /train/{jobId}/status              getTrainingStatus(jobId)
GET  /train/{jobId}/stream              subscribeToTraining(...)    (SSE via EventSource)
GET  /train/{jobId}/result              getTrainingResult(jobId)
```

### State management approach

Plain React `useState` / `useContext` / `useEffect` / `useRef` throughout — **no external state library**. Global auth state is one React Context (`AuthProvider.tsx`). `/visualize` page has ~13 local `useState` hooks. `/train` uses `sessionStorage` directly (not a library) to persist an in-flight job ID across navigation/refresh (`JOB_ID_STORAGE_KEY`).

### Auth integration with Supabase

- **Client setup** (`lib/supabase.ts`): bare `createClient(supabaseUrl, supabaseAnonKey)` from `NEXT_PUBLIC_*` env vars, non-null-asserted, no runtime validation. Default Supabase JS behavior — session persisted to `localStorage`; no SSR cookie helper (`@supabase/ssr`) in use.
- **Session handling** (`components/auth/AuthProvider.tsx`): on mount, `supabase.auth.getSession()`, then subscribes to `supabase.auth.onAuthStateChange`; exposes `{ user, session, loading, signOut }` via `useAuth()`.
- **Protected routes**: `components/auth/AuthGuard.tsx` wraps `/datasets` and `/visualize`, but its actual gating logic (redirect to `/login` if unauthenticated) is **fully commented out**, with an explicit in-code note that auth is "currently disabled — all pages are publicly accessible" and the logic is "preserved below, commented out, so it can be re-enabled later." The live export is a pass-through no-op. **No `middleware.ts`** exists either — there is no server-side/edge route protection. **Net effect: the frontend currently has no functioning route protection at all**, despite the `AuthGuard` wrapper still being present in the JSX.
- Consistent with this, the backend treats auth as optional everywhere (see §3) — `lib/api.ts` attaches a token if available but never requires one.

### Styling — "Clinical Teal" theme

Defined in `frontend/constants/theme.ts` (mirrored as Tailwind v4 `@theme` CSS custom properties in `frontend/app/globals.css`; no separate `tailwind.config.js` — Tailwind v4's CSS-first config is used exclusively):

```ts
primary: { 50:"#E6F5F0", 100:"#C8E6DC", 200:"#9AD4C4", 300:"#5FBFA8", 400:"#2DA88C",
           500:"#0D7C66", 600:"#0A6553", 700:"#074D3F", 800:"#1A3A33", 900:"#0F2620" }
surface: { bg:"#F7FAFA", card:"#FFFFFF", border:"#E0EFED", hover:"#D4E8E3" }
text:    { primary:"#1A3A33", secondary:"#5A7A73", muted:"#8BA39C" }
success: { bg:"#D4EDDA", text:"#155724", border:"#B8DCC4" }
danger:  { bg:"#F8D7DA", text:"#721C24", border:"#F0B4BA" }
warning: { bg:"#FFF3CD", text:"#856404", border:"#FFE69C" }
info:    { bg:"#D1ECF1", text:"#0C5460", border:"#A8D8E2" }
```
`globals.css` also defines `fade-in`/`scale-in`/`tooltip-in` keyframe animations.

### Types (`frontend/types/`)

- `dataset.ts`: `Dataset{id, name, description, file_name, file_size, file_type, uploaded_by_email, created_at}`, `DatasetListResponse`, `DownloadUrlResponse{url, expires_in}`, `UploadResponse{dataset, message}`.
- `molecule.ts`: `MoleculeData{svg, smiles, physicochemical, lipophilicity, solubility, druglikeness, medicinal_chemistry, radar}` with nested `Physicochemical`, `RuleResult`, `RadarValues`.
- `prediction.ts`: `ModelInfo{name, accuracy, roc_auc, threshold}`, `PredictionResult{smiles, model_name, prediction, prediction_label, probability, threshold}`, `TopAtom`, `TopSubstructure`, `HeatmapResult`.

### Notable stale/dead artifacts (frontend)

- `frontend/app/page.tsx.bak` — full standalone earlier UI version predating componentization, auth, and theming (dark "slate" theme, no `/api/predict`).
- `frontend/README.md` is unmodified `create-next-app` boilerplate — no project-specific deployment notes, still references the "Geist" font though the app actually uses Inter.
- `frontend/AGENTS.md`/`CLAUDE.md` contain only an unusual instruction to consult `node_modules/next/dist/docs/` because this Next.js version (16.2.9) has breaking changes vs. training-data knowledge — not deployment guidance.

---

## 3. Backend (FastAPI)

### Full route list

```
GET    /api/health                     no auth   liveness check → {"status":"ok"}
GET    /api/debug-config               no auth   DEBUG ENDPOINT — leaks whether
                                                  SUPABASE_JWT_SECRET is loaded, its
                                                  length, and its first 5 characters
GET    /api/debug-token-header         no auth   DEBUG/DEAD ENDPOINT — hardcodes
                                                  token = "PASTE_TOKEN_HERE"; always
                                                  fails as shipped

POST   /api/visualize                  optional  SmilesRequest{smiles} →
                                                  MoleculeResponse (RDKit descriptors + SVG)

POST   /api/predict                    optional  PredictionRequest{smiles, model_name} →
                                                  PredictionResponse{prediction,
                                                  prediction_label, probability, threshold}
POST   /api/predict/heatmap            optional  PredictionRequest →
                                                  HeatmapResponse (atom/substructure
                                                  importance heatmap SVGs)
GET    /api/predict/models             optional  → AvailableModelsResponse
                                                  (4 models w/ hardcoded held-out metrics)

POST   /api/datasets/upload            optional  multipart{file, name, description} →
                                                  UploadResponse (unauth uploads →
                                                  user_id="anonymous")
GET    /api/datasets                   optional  → DatasetListResponse (ALL datasets,
                                                  no per-user filtering)
GET    /api/datasets/{id}/download     optional  → DownloadUrlResponse
                                                  (1-hour signed Supabase URL)
DELETE /api/datasets/{id}              optional  ownership-checked delete
                                                  (403 if not owner, 404 if missing)
```

"Optional" auth = every route uses `Optional[dict] = Depends(get_current_user)`, and `get_current_user` returns `None` silently if no `Authorization` header is present — **no route in the backend actually rejects unauthenticated requests**; a bad/expired *present* token is the only thing that produces a 401.

### Request/response schemas

```python
# app/schemas/molecule.py
SmilesRequest{smiles: str (1-500 chars)}
MoleculeResponse{
  svg, smiles,
  physicochemical: {formula, mw, heavy_atoms, aromatic_heavy_atoms,
                     fraction_csp3, rotatable_bonds, hba, hbd,
                     molar_refractivity, tpsa},
  lipophilicity: {crippen_logp},
  solubility: {esol_logs, esol_mg_ml, esol_mol_l, esol_class},
  druglikeness: {lipinski, ghose, veber, egan, muegge: RuleResult,
                 bioavailability_score},
  medicinal_chemistry: {pains_alerts, pains_descriptions[], sa_score, leadlikeness},
  radar: {lipo, size, polar, insolu, insatu, flex}
}
RuleResult{passes, violations, details}

# app/schemas/prediction.py
PredictionRequest{smiles, model_name = "Logistic Regression"}
PredictionResponse{smiles, model_name, prediction, prediction_label, probability, threshold}
ModelInfo{name, accuracy, roc_auc, threshold}
AvailableModelsResponse{models: [ModelInfo], default_model}
TopAtom{atom_idx, element, score, percentage, direction}
TopSubstructure{token, description, score, percentage, occurrences, direction}
HeatmapResponse{smiles, model_name, prediction, confidence, atom_heatmap_svg,
                 top_atoms[], substructure_heatmap_svg, top_substructures[]}

# app/schemas/dataset.py
DatasetResponse{id, name, description, file_name, file_size, file_type,
                 uploaded_by_email, created_at}
DatasetListResponse{datasets}
DownloadUrlResponse{url, expires_in}
UploadResponse{dataset, message}
```

Hardcoded held-out test metrics served by `GET /api/predict/models` (`app/routers/prediction.py`):
```python
{"Logistic Regression": {"accuracy": 0.7097, "roc_auc": 0.7783},
 "Gradient Boosting":   {"accuracy": 0.7230, "roc_auc": 0.8046},
 "Linear SVM":          {"accuracy": 0.7211, "roc_auc": 0.7989},
 "Random Forest":       {"accuracy": 0.7381, "roc_auc": 0.8087}}
```

### Sparsegraphs submodule invocation

The production backend **deliberately bypasses** the submodule's own `load_bundle`/`InferencePipeline` entry point (`sparsegraphs/utils/inference.py`), because that path imports `dict_learners.fddl_gpu`, which does `import torch` at module scope — and `torch` is intentionally excluded from `backend/requirements.txt` to keep the inference image lean. Instead, `backend/ml_pipeline/inference.py` reimplements FDDL-GPU's inference-time ISTA sparse-coding loop in pure NumPy (`_NumpySparseCoder`), loading only the raw `.npy`/`.json` artifacts.

Concrete imports from the submodule (`sys.path` is patched at import time in `ml_pipeline/inference.py` to point at `backend/sparsegraphs`):
- `from graph_encoders.wl import WL` — `WL.load(dir)`, `WL.generate_inferencing_embeddings(graphs)`.
- `from utils.inference import smiles_to_graph` — SMILES → `networkx.Graph` (adds explicit Hs to match SDF-based training data).
- `interpretability/wl_aksvd_interpreter.py` additionally imports `from graph_encoders.wlkernalsubtree import WeisfeilerLehmanHashing`.

Artifacts read (all under `backend/sparsegraphs/artifacts/<bundle>/`, `<bundle>` = `wl_fddl_gpu_nci_full_atoms32_20260708_202033_20260708_202100` by default from `.env.example`):
```
encoder/wl_config.json, encoder/wl_vocab.json     WL encoder state
dict_learner/fddl_config.json, fddl_D.npy         FDDL dictionary matrix (numpy-only load)
scaler.joblib                                     fitted MaxAbsScaler
manifest.json                                     model registry, feature_dim, n_atoms, classes
models/*.joblib                                   one fitted classifier per name
thresholds.json                                   {model_name: decision_threshold}
```
Per the module's own docstring: "`sparsegraphs/` itself is a read-only submodule and is never modified [by the backend]" — artifact **writing** only happens inside the submodule's own training/export code (`utils/export.py`, `utils/artifact_store.py::save_bundle`), which the FastAPI app never executes. `results/` (MC-CV evaluation dirs) inside the submodule is likewise not consumed by the runtime backend at all.

### SMILES → prediction pipeline (full call trace, `MolecularActivityPredictor.predict`)

1. `Chem.MolFromSmiles(smiles)` — validate; `ValueError` if invalid/empty.
2. Validate `model_name` is a known model, else `ValueError`.
3. `smiles_to_graph(smiles)` (submodule `utils/inference.py`) → `Chem.MolFromSmiles` again → `Chem.AddHs(mol)` → `molecule_to_graph(mol)` builds an `nx.Graph` (node attr `feature=atom.GetSymbol()`; edge attrs `bond_type, bond_order, aromatic, in_ring, conjugated, stereo`).
4. `self._encoder.generate_inferencing_embeddings([graph])` (submodule `graph_encoders/wl.py`) — WL subtree hashing (`WeisfeilerLehmanHashing`) → count occurrences of each saved-vocab token → L2-normalize. Output shape `(1, feature_dim)` (feature_dim = 3329 per the manifest of the shipped bundle).
5. `self._dict_learner.infer(embeddings)` (`_NumpySparseCoder`, pure NumPy reimplementation of FDDL-GPU ISTA) — soft-thresholded gradient-descent sparse coding against the fixed dictionary `D`. Output shape `(1, n_atoms)` = `(1, 32)` for the shipped bundle.
6. `self._scaler.transform(codes)` — `scaler.joblib` (MaxAbsScaler).
7. `model.predict_proba(X_scaled)[:, 1][0]` — classifier selected by `model_name`.
8. `threshold = self._thresholds.get(model_name, 0.5)`.
9. `label = 1 if proba >= threshold else -1` (classes are `{-1, 1}`, not `{0, 1}` — matches manifest's `"classes": [-1, 1]`).
10. Returns `{prediction: "Active"/"Inactive", prediction_label: ±1, probability, threshold}`.

Per-model thresholds actually shipped (`thresholds.json`): Logistic Regression `0.4721`, Gradient Boosting `0.4335`, Linear SVM `0.4518`, Random Forest `0.54` — i.e. **not** the naive 0.5 default; these are validation-tuned.

A `_apply_compat_patches` step manually sets `multi_class="auto"` on the pickled Logistic Regression model if that attribute is missing (sklearn version-skew compatibility fix between training-time and inference-time sklearn). The predictor is a lazily-loaded singleton guarded by a `threading.Lock` (double-checked locking).

### PubChem integration

**Not found in the backend.** A repo-wide grep for `pubchem`/`PubChem` under `backend/` returns zero matches. PubChem integration exists **only in the frontend** (`app/visualize/page.tsx`), which calls PubChem's public PUG REST API directly from the browser to resolve a compound name to a SMILES string before ever hitting the backend. No caching or backend-side proxying of PubChem calls exists.

### Supabase JWT verification (`backend/app/core/auth.py`)

- JWKS URL: `f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"`, fetched with stdlib `urllib.request.urlopen(url, timeout=5)`.
- Algorithm: not hardcoded — read per-key from the JWKS entry (`jwt.decode(token, signing_key, algorithms=[signing_key["alg"]], ...)`). Module docstring states Supabase's newer JWT Signing Keys use **ES256** (asymmetric, rotating `kid`), replacing the legacy static HS256 secret.
- Claims checked: `sub` (required, else 401 "Token missing user identity"), `email`, `role`. `verify_aud` is explicitly **disabled** (`options={"verify_aud": False}`). `exp` is checked implicitly (python-jose default, not disabled); `iss` is not checked.
- JWKS caching: module-level in-memory dict, 1-hour TTL (`_JWKS_CACHE_TTL_SECONDS = 3600`); falls back to stale cache on fetch failure; forces one refresh if a `kid` isn't found in the cache (handles key rotation).
- Auth is optional by construction: `HTTPBearer(auto_error=False)` — missing header ⇒ `None`, no error.
- `SUPABASE_JWT_SECRET` is defined in config but **not actually used** by this ES256/JWKS verification path — only referenced by the leaky `/api/debug-config` route. Likely vestigial from an earlier HS256 setup.
- Errors logged via `print(f"JWT ERROR: {e}")`, not the `logging` module.

### Supabase storage/DB usage (`backend/app/services/dataset_service.py`)

- Client created with the **service-role key** (`SUPABASE_SERVICE_ROLE_KEY`) — RLS is bypassed at the application layer; ownership is enforced only in Python code, not database policy. No migration files were found in the repo, so table schema below is *inferred from the queries*, not from a migration/DDL source — flag this as inferred.
- Bucket: `"datasets"`. Table: `"datasets"`.
- Inferred `datasets` table columns (from `DatasetResponse(**row)` and insert calls): `id, name, description, file_name, file_size, file_type, uploaded_by_email, user_id, created_at`.
- Constraints: `ALLOWED_EXTENSIONS = {.csv, .txt, .zip, .tsv}`, `MAX_FILE_SIZE = 50MB`, signed URLs expire after 1 hour (`3600s`).
- Storage path convention: `f"{user_id}/{uuid.uuid4()}_{file.filename}"`.
- No try/except around the Supabase SDK calls themselves — SDK failures propagate as unhandled 500s. No explicit retry/timeout config; relies on `supabase-py` client defaults.

### Error handling & logging (backend-wide)

- Pattern: service/pipeline layer raises `ValueError` → router catches, converts to `HTTPException(422)`. `dataset.py` also maps `PermissionError → 403` and missing-record → `404`.
- **No `logging` module usage anywhere in `backend/`** (confirmed by grep — zero matches for `import logging`/`logger`). Only diagnostic output is two `print()` calls: `auth.py:97` (`"JWT ERROR: {e}"`) and one in the submodule's training-time `wl.py` (not exercised at inference).
- No global FastAPI exception handler registered; no request/response logging middleware.
- Notable dead/unsafe code: `GET /api/debug-token-header` hardcodes a placeholder token and will always fail; `GET /api/debug-config` leaks partial JWT secret info, both unauthenticated.
- `backend/main.py.bak` (354 lines) is a stale, fully self-contained pre-refactor version of the app (single file, `allow_origins=["*"]`, only `/api/visualize` + `/api/health`, no auth/prediction/dataset routes) — dead code, not wired into the Dockerfile's `main:app` target.

---

## 4. Local trainer (`smiles-viz-trainer`)

### Package structure

```
smiles_viz_trainer/
├── __init__.py            # sets __version__ = "0.1.0" (stale vs pyproject 0.2.0);
│                           # Windows DLL-directory workaround (see below)
├── cli.py                 # `smiles-train` console-script entry point
├── pipeline/
│   ├── artifact_store.py  # save_bundle() / load_bundle()
│   ├── dict_learner.py    # DictLearner abstract base
│   ├── evaluator.py       # fits/evaluates 4 classifier types, threshold tuning
│   ├── fddl_gpu.py        # FDDLGPU(DictLearner) — GPU/CPU Fisher Discriminative Dict Learning
│   ├── graph_encoder.py   # GraphEncoder abstract base
│   ├── graph_utils.py     # smiles_to_graph(), molecule_to_graph()
│   ├── runner.py          # run_training() — orchestrates the full pipeline
│   ├── seeding.py         # seed_everything(), derive_seeds()
│   ├── wl.py               # WL(GraphEncoder) — WL embedding + imbalance-aware vocab selection
│   └── wl_hashing.py       # WeisfeilerLehmanHashing — md5-based subtree hashing
├── server/
│   ├── app.py               # create_app() — FastAPI factory, CORS, router registration
│   ├── routers/              health.py, train.py, upload.py, validate.py
│   └── schemas/training.py   Pydantic request/response models
├── services/job_manager.py  # single in-memory job slot (one training job at a time)
└── utils/dataset.py          # CSV/SDF validation + SMILES/target column detection
```

### CLI

Single Click command `main()` registered as `smiles-train` (`[project.scripts]` in `pyproject.toml`). Options: `--host` (default `127.0.0.1`), `--port` (default `5000`). Runs `uvicorn.run("smiles_viz_trainer.server.app:create_app", host, port, factory=True)`. No `__main__.py`; not runnable via `python -m smiles_viz_trainer`. Only one command — not a command group.

### FastAPI routes (localhost:5000)

```
GET  /health                            {"status":"ok","version": __version__}
POST /validate-dataset                  {file_path} → DatasetValidationResponse
POST /train                             TrainRequest{file_path, smiles_column?,
                                         target_column?, classifier, output_dir?,
                                         parameters?} → TrainResponse{job_id, message}
GET  /train/{job_id}/status             → JobStatus{status, progress, ...}
GET  /train/{job_id}/result             → TrainingResult{metrics, ...} (404/400 if not ready)
GET  /train/{job_id}/stream             SSE (EventSourceResponse): progress/complete/error
POST /upload                            multipart UploadFile → {"file_path": str}
                                         (saved to ~/smiles-viz-uploads/{uuid}_{filename})
GET  /browse-directories                query {path?, include_files, file_extensions?}
                                         → server-side filesystem browser listing
POST /browse-directories/create         {path} → os.makedirs(path, exist_ok=True)
GET  /browse-directories/drives         → list of Windows drive letters
```
`/upload`, `/browse-directories*`, and `/train`'s `output_dir`/`file_path` give this server **arbitrary local filesystem read/write access driven by client-supplied paths, with no sandboxing/allowlist** — worth flagging given the CORS policy below permits any `*.vercel.app` origin to call it.

### CORS setup (cloud frontend → localhost)

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),       # default: localhost:3000, 127.0.0.1:3000,
                                             # plus ALLOWED_ORIGINS env var (CSV)
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
```
The `allow_origin_regex` explicitly whitelists **any** `*.vercel.app` subdomain (with credentials) — not scoped to the project's own deployment specifically.

### CSV/SDF ingestion, SMILES column detection (`utils/dataset.py`)

- `SMILES_COLUMN_CANDIDATES`: `["smiles", "SMILES", "canonical_smiles", "Canonical_SMILES", "smi", "molecule"]`.
- `TARGET_COLUMN_CANDIDATES`: 22 common label-column names (`activity`, `label`, `target`, `class`, `active`, `y`, `p_np`, etc).
- `_detect_smiles_column`: exact match → case-insensitive match → content-sniffing fallback (parses first 5 values of each object-dtype column with `Chem.MolFromSmiles`, picks the column with highest parse ratio if `> 0.5`).
- `_detect_target_column`: case-insensitive candidate lookup only, no content-based fallback.
- CSV path: `pd.read_csv` + per-row `Chem.MolFromSmiles` validation, collects invalid rows, computes `value_counts` on the target column.
- SDF path: `rdkit.Chem.SDMolSupplier`; target column detected by scanning `TARGET_COLUMN_CANDIDATES` against `mol.HasProp(...)` on the first valid molecule; SMILES column concept doesn't apply (structures come from the SDF directly).
- Inconsistency: `/upload` accepts `.tsv` (`ALLOWED_EXTENSIONS = {.csv, .tsv, .sdf}`), but `validate_dataset()` only branches on `.csv`/`.sdf` — an uploaded `.tsv` passes upload but then fails validation/training.

### Training pipeline (`pipeline/runner.py::run_training`, staged)

1. **VALIDATING** — load CSV/SDF → convert to `networkx.Graph` per molecule (`smiles_to_graph`/`molecule_to_graph`) → labels mapped to `{-1, +1}`. Requires ≥20 valid molecules.
2. **Splitting** — stratified 3-way split: test (15%), val (15% of remainder), then train split again into vocab/ml subsets at a 2:7 ratio ("same as sparsegraphs export pipeline", per code comment).
3. **ENCODING** — `WL` fit on the vocab subset: WL subtree hashing → imbalance-aware discriminative vocabulary selection (class `ImbalanceAwareWL`, keeps words scoring above `mean − std` of a discriminative score) → L2-normalized term-frequency embeddings.
4. **SPARSE_CODING** — `FDDLGPU` (PyTorch, auto-selects CUDA if available): Fisher Discriminative Dictionary Learning, alternating `_update_X` (ISTA-style proximal gradient with per-class Fisher regularization) / `_update_D` (closed-form dictionary update), `max_iter=64`, `k=16` atoms/class by default.
5. **NORMALIZING** — `sklearn.preprocessing.MaxAbsScaler`, fit on ML-split sparse codes.
6. **TRAINING** — `Evaluator` fits one of `LogisticRegression` / `GradientBoostingClassifier` / `CalibratedClassifierCV(LinearSVC)` / `RandomForestClassifier` per the requested `classifier`; F1-optimal threshold found on the validation set via precision-recall-curve argmax.
7. **EVALUATING** — re-run with the val-tuned threshold fixed, against the held-out test split (avoids test-set leakage); metrics: `accuracy, precision, recall, f1, roc_auc, pr_auc, threshold`.
8. **SAVING** — `save_bundle()` writes the full artifact directory (see below).

### Artifact bundle format (`pipeline/artifact_store.py`)

Directory name: `<implementation>_<dataset>_atoms<N>_<started_at>_<ended_at>/`, default root `~/smiles-viz-models`.

```
manifest.json     implementation, dataset, started_at/ended_at, encoder_class="WL",
                  dict_learner_class="FDDLGPU", n_atoms, feature_dim, classes,
                  models (name→relative path), default_model, git_commit,
                  library_versions
encoder/          wl_config.json (wl_iterations, attributed, n_vocab, seed, ...),
                  wl_vocab.json (ordered [hash_word, discriminative_score] pairs —
                  this ordering IS the embedding column order)
dict_learner/     fddl_config.json (k, lambda1, lambda2, eta, max_iter, ...),
                  fddl_D.npy (learned dictionary matrix, numpy-only — no torch needed
                  to load), fddl_state.npz (classes, class_sizes, per-class mean
                  sparse codes M_i). Raw training sparse codes are deliberately
                  NOT persisted.
scaler.joblib     fitted MaxAbsScaler
models/           model_<slug>.joblib per trained classifier
thresholds.json   {model_name: validation-tuned decision threshold}
eval/             declared as a constant and documented in the module docstring
                  as "(optional) provenance metrics" — NEVER actually written by
                  save_bundle(); planned but unimplemented
```
`load_bundle()` is the exact inverse, used by `ml_pipeline/inference.py`-equivalent loading paths.

### Windows / Device Guard DLL handling

Identical block copy-pasted into `__init__.py`, `cli.py`, `server/app.py`, `server/__init__.py`:
```python
_conda_prefix = os.environ.get("CONDA_PREFIX", "")
if _conda_prefix:
    for _dll_dir in [os.path.join(_conda_prefix, "Library", "bin"),
                      os.path.join(_conda_prefix, "Library", "lib"),
                      os.path.join(_conda_prefix, "DLLs")]:
        if os.path.isdir(_dll_dir):
            os.add_dll_directory(_dll_dir)
```
No `ctypes` usage anywhere. No inline comment explicitly names "Device Guard" — the term does not appear anywhere in the trainer package. Mechanistically, this registers conda-provided native DLL directories (notably RDKit's C++ DLLs under `<conda_env>/Library/bin`) with Python's post-3.8 restricted DLL search path on Windows, so RDKit imports successfully when the server is launched via `uvicorn`/`smiles-train` inside a conda environment. Treat "Device Guard" specifically as **unconfirmed** — the code only demonstrably addresses the general Python-3.8+-on-Windows DLL search path change, not Device Guard/WDAC code-signing enforcement specifically.

### Tests

`smiles-viz-trainer/tests/` contains **only** `test_data/` (two fixture CSVs: `sample.csv`, `test_50.csv`) — **no actual test scripts exist** (no `test_*.py`, no `conftest.py`, no pytest config). `sample.csv` deliberately includes one invalid SMILES row; `test_50.csv` has 49 rows (chosen to exceed the ≥20-molecule minimum) and uses labels already in `{-1, 1}` form.

---

## 5. ML pipeline integration

### WL → FDDL → MaxAbsScaler → classifier wiring

The same conceptual pipeline exists in two independent implementations that must be kept manually in sync:

| Stage | Cloud backend (`backend/ml_pipeline/inference.py`, inference-only) | Local trainer (`smiles-viz-trainer`, full train+infer) |
|---|---|---|
| Graph encoding | `WL.generate_inferencing_embeddings` (imported from submodule `graph_encoders/wl.py`) | `pipeline/wl.py::WL` (own copy of the same algorithm) |
| Sparse coding | `_NumpySparseCoder` — pure-NumPy reimplementation of FDDL-GPU's ISTA loop, avoids importing `torch` | `pipeline/fddl_gpu.py::FDDLGPU` — full PyTorch implementation (train + infer) |
| Scaling | `joblib.load(scaler.joblib)` → `.transform()` | `sklearn.preprocessing.MaxAbsScaler` → `.fit_transform()`/`.transform()` |
| Classifier | `joblib.load(models/*.joblib)` → `.predict_proba()` | `Evaluator` fits `LogisticRegression`/`GradientBoostingClassifier`/`CalibratedClassifierCV(LinearSVC)`/`RandomForestClassifier` |
| Threshold | `thresholds.json` lookup, default 0.5 | F1-optimal threshold from PR-curve on validation split |

Both sides ultimately read/write the **same bundle directory format** (`manifest.json`, `encoder/`, `dict_learner/`, `scaler.joblib`, `models/`, `thresholds.json`) — a model trained locally with `smiles-viz-trainer` produces an artifact bundle that, if pointed at by the backend's `ARTIFACT_DIR` setting, could in principle be loaded by `ml_pipeline/inference.py`, though this integration path is not exercised by any code in this survey (no code was found that automates promoting a locally-trained bundle into the backend's `sparsegraphs/artifacts/` directory — that would be a manual/deployment step, not found in the repo).

### Threshold/label mapping logic

Consistent across both sides: classes are `{-1, +1}` (not `{0, 1}`); `label = 1 if proba >= threshold else -1`; `1 → "Active"`, `-1 → "Inactive"`. Thresholds are validation-tuned (F1-optimal via precision-recall curve), not the naive 0.5 default, and are persisted per-model in `thresholds.json`.

---

## 6. Data flow diagrams (described, for drawing)

### (a) System architecture

Actors/components: **Browser**, **Next.js frontend** (inferred Vercel-hosted, not confirmed in repo), **FastAPI backend** (Dockerized, inferred Render or similar container host, not confirmed), **Supabase** (Auth + Postgres + Storage), **PubChem** (external public API, called directly from the browser), **local trainer** (`smiles-train`, `localhost:5000`, runs on the user's own machine).

```
Browser ── HTTPS ──▶ Next.js frontend (App Router, client components)
Browser ── HTTPS ──▶ PubChem PUG REST API (name → SMILES, called directly, no backend proxy)
Next.js frontend ── Supabase JS client ──▶ Supabase Auth (sign in/up, session, JWKS)
Next.js frontend ── fetch(NEXT_PUBLIC_API_URL) ──▶ FastAPI backend (/api/*)
FastAPI backend ── JWKS fetch (1h cache) ──▶ Supabase Auth (/auth/v1/.well-known/jwks.json)
FastAPI backend ── supabase-py (service-role key) ──▶ Supabase Storage ("datasets" bucket)
                                                    + Supabase Postgres ("datasets" table)
FastAPI backend ── reads artifacts ──▶ backend/sparsegraphs/artifacts/<bundle>/ (local disk,
                                        baked into the Docker image at build time)
Next.js frontend ── fetch(localhost:5000) ──▶ local trainer server (only reachable when
                                                both frontend and trainer run on/near the
                                                same machine as the browser; CORS allows any
                                                *.vercel.app origin plus localhost:3000)
```

### (b) Sequence: user submits SMILES on /visualize and gets a prediction

1. User types a compound name or SMILES into `/visualize`.
2. If a name was typed, frontend calls PubChem PUG REST API directly from the browser → canonical SMILES.
3. Frontend calls `GET /api/predict/models` (optionally, to populate the model dropdown) → backend returns hardcoded model metadata + thresholds.
4. Frontend calls `POST /api/predict` with `{smiles, model_name}` (bearer token attached if a session exists, optional).
5. Backend `prediction.py` router → `get_predictor().predict(smiles, model_name)`.
6. `Chem.MolFromSmiles` validate → `smiles_to_graph` → `WL.generate_inferencing_embeddings` → `_NumpySparseCoder.infer` → `scaler.transform` → `model.predict_proba` → threshold compare → label.
7. Backend returns `PredictionResponse{prediction, prediction_label, probability, threshold}`.
8. (If the user requests the heatmap view) Frontend calls `POST /api/predict/heatmap` → backend's `interpretability_service.py` → `WLAKSVDInterpreter.get_node_importance` → per-atom/substructure importance scores + rendered SVG heatmaps → `HeatmapResponse`.
9. Frontend renders `MoleculeResults` / prediction panel with the returned data.

### (c) Sequence: user trains a model locally and uses it

1. User installs and runs `smiles-train` on their own machine (`uvicorn` server on `127.0.0.1:5000`).
2. In the (Vercel-hosted, per the CORS regex) frontend's `/train` page, `checkTrainerHealth()` polls `GET http://localhost:5000/health` from the browser to confirm the local server is reachable (cross-origin call, allowed by the trainer's CORS regex for `*.vercel.app`).
3. User picks a dataset file via `FolderBrowserModal` → `GET /browse-directories` (and `/browse-directories/drives`) on the trainer.
4. Frontend calls `POST /validate-dataset {file_path}` → trainer detects SMILES/target columns, returns validity stats.
5. User configures classifier + output directory, frontend calls `POST /train {file_path, smiles_column, target_column, classifier, output_dir}` → trainer spawns a background thread running `run_training()`, returns `job_id`.
6. Frontend subscribes to `GET /train/{job_id}/stream` (SSE) for live progress (`progress`/`complete`/`error` events), or polls `GET /train/{job_id}/status`.
7. On completion, frontend calls `GET /train/{job_id}/result` → trainer returns final metrics + `output_path` (the artifact bundle directory on the user's local disk, under `~/smiles-viz-models/` by default).
8. **Using the trained model afterward**: not automated anywhere in the codebase — no code was found that loads a `smiles-viz-trainer`-produced bundle back into either the frontend's prediction flow or the cloud backend's `ml_pipeline/inference.py`. The bundle format is compatible (same `manifest.json`/`encoder/`/`dict_learner/`/`scaler.joblib`/`models/`/`thresholds.json` layout), but wiring a freshly trained local bundle into `/api/predict` would require manually pointing the backend's `ARTIFACT_DIR` setting at it — this is a **gap**, not an implemented flow (see §8).

### (d) Component diagram of the frontend

```
app/layout.tsx
 └─ AuthProvider (Context: user, session, loading, signOut)
     └─ Navbar (ui/) — links to /visualize, /datasets, /train; shows signed-in email

app/visualize/page.tsx  (mode: "visualize" | "predict")
 ├─ (inline) SMILES/name input, PubChem name-resolution fetch
 ├─ molecule/MoleculeResults — SVG, physicochemical/lipophilicity/solubility/
 │    druglikeness/medchem SectionCards, prediction panel, heatmap panel
 │    └─ molecule/RadarChart — bioavailability hexagon (theme-token colored)
 │    └─ ui/Tooltip, ui/PropRow, ui/RuleBadge
 └─ AuthGuard (currently a no-op pass-through)

app/datasets/page.tsx
 ├─ (inline) UploadModal, DatasetDetailModal
 └─ AuthGuard (no-op)

app/train/page.tsx
 ├─ FolderBrowserModal (×2: dataset path, output dir)
 ├─ (inline) CodeBlock / SetupStep — "local trainer not detected" onboarding
 └─ sessionStorage-based job-id persistence across reloads

app/login/page.tsx, app/register/page.tsx, app/auth/callback/page.tsx
 └─ direct Supabase auth calls, no shared form component
```

---

## 7. Notable engineering decisions

- **Conda (not pure pip) for the backend Docker image**, specifically to obtain RDKit's C++-backed wheels from `conda-forge`, since `rdkit-pypi` is flagged in the (stale) root README as unreliable to install via plain pip.
- **`torch` deliberately excluded from the cloud backend** — `ml_pipeline/inference.py`'s own docstring states this explicitly, and the module reimplements FDDL-GPU's inference loop in pure NumPy specifically to avoid the submodule's default `torch`-importing load path. This shrinks the deployed image and inference-time dependency surface at the cost of maintaining two parallel implementations of the same sparse-coding algorithm (see §5 gap).
- **Training happens locally, not in the cloud**: the `smiles-viz-trainer` package is architected to run entirely on the end user's machine (`localhost:5000`), with the Vercel-hosted frontend calling into it via a permissive CORS policy (`allow_origin_regex=r"https://.*\.vercel\.app"`). This avoids provisioning GPU compute on the hosted backend for training, at the cost of the local server exposing unsandboxed filesystem read/write endpoints to any code that can reach `localhost:5000`, gated only by CORS on the *browser* side (a non-browser client bypasses CORS entirely).
- **`sparsegraphs` as a submodule, not vendored**: keeps the ML research library independently versioned/git-tracked (own repo, `kanishka` branch) while the backend pins to a specific commit; artifacts (`artifacts/`, `results/`) are shipped inside the same submodule checkout rather than a separate artifact store, so the Docker build (`COPY . .`) bakes trained model weights directly into the image.
- **Auth is "optional everywhere" by design** (`HTTPBearer(auto_error=False)`, silent `None` on missing header) rather than enforced — appears to be a deliberate simplification for demo/FYP purposes (`AuthGuard`'s commented-out logic and explicit "currently disabled" comment corroborates this was a conscious, temporary rollback rather than an oversight).
- **Validation-tuned decision thresholds instead of a flat 0.5** for every classifier, computed via F1-optimal point on a precision-recall curve, and evaluated on a held-out test split with the *validation*-tuned threshold fixed — a deliberate leakage-avoidance measure in the training pipeline.
- **JWKS-based ES256 verification with a 1-hour in-memory cache and stale-cache fallback**, rather than a static shared HS256 secret — aligns with Supabase's newer key-rotation model; the old `SUPABASE_JWT_SECRET` config field is kept but effectively unused, suggesting a mid-project migration between Supabase auth key schemes.
- **Service-role Supabase key on the backend** (bypassing RLS) with ownership checks reimplemented in application code, rather than relying on Postgres RLS policies — simpler to reason about for a small app, but means database-level security is entirely dependent on the FastAPI layer being correct (no defense in depth if a route is later added without the same checks).

---

## 8. Gaps / TODOs / known issues

No literal `TODO`/`FIXME`/`XXX`/`HACK` comment markers were found anywhere in `backend/`, `frontend/`, or `smiles-viz-trainer/` (confirmed by repo-wide grep in each survey). All items below are inferred from code structure, comments, and stale artifacts rather than explicit markers.

**Backend:**
- `GET /api/debug-token-header` — hardcodes `token = "PASTE_TOKEN_HERE"`; will always error as shipped. Leftover debug endpoint, unauthenticated, present in the deployed router.
- `GET /api/debug-config` — leaks whether `SUPABASE_JWT_SECRET` is loaded, its length, and its first 5 characters, unauthenticated. Information-disclosure risk.
- `backend/main.py.bak` — 354-line stale pre-refactor monolithic version of the app, left in the tree (dead code, not imported by anything).
- No `logging` module usage anywhere in the backend — only two `print()` statements for error diagnostics. No structured logs, no log levels, no request logging middleware.
- No try/except around Supabase SDK calls in `dataset_service.py` — an SDK failure surfaces as an unhandled 500.
- `SUPABASE_JWT_SECRET` config field defined but unused by the actual (ES256/JWKS) verification path — vestigial.

**Frontend:**
- `components/auth/AuthGuard.tsx` — real auth-gating logic fully written but commented out, replaced with a pass-through stub; **no route protection currently functions**, and there is no `middleware.ts` either.
- `frontend/app/page.tsx.bak` — dead pre-refactor UI code left in the tree.
- `components/molecule/SmilesInput.tsx` — unused/orphaned component; `/visualize` reimplements equivalent logic inline instead.
- Empty `app/layout/` directory — stray artifact, not a functioning route.
- `frontend/README.md` — unmodified `create-next-app` boilerplate; no project-specific deployment instructions; incorrectly still references the "Geist" font.

**smiles-viz-trainer:**
- `__init__.py`'s `__version__ = "0.1.0"` vs. `pyproject.toml`'s `version = "0.2.0"` — version string mismatch; `/health` reports the stale value.
- `eval/` subdirectory declared as a constant and documented in `artifact_store.py`'s docstring as an "(optional) provenance metrics" output, but `save_bundle()` never writes it — planned-but-unimplemented.
- `FDDLGPU`'s `lr` config parameter is accepted and persisted but never referenced anywhere in `fit()`/`infer()` — dead/vestigial parameter.
- `.tsv` accepted by `/upload`'s `ALLOWED_EXTENSIONS` but not handled by `validate_dataset()` (only `.csv`/`.sdf` branches exist) — an uploaded `.tsv` passes upload, then fails validation.
- `tests/` contains only fixture CSVs (`sample.csv`, `test_50.csv`) — **no actual automated test scripts exist** anywhere in the trainer package.
- `JobManager` holds a **single in-memory job slot** (not a queue) — only one training job can run per server process at a time, and all job state is lost on server restart (no persistence). This is presented as intentional (409 response if a job is already running), not a bug, but is a real scalability/robustness limitation worth naming in a report.
- Every filesystem-facing endpoint (`/upload`, `/browse-directories*`, `/train`'s `output_dir`/`file_path`) accepts client-supplied absolute paths with no sandboxing or allowlist — combined with the CORS regex permitting any `*.vercel.app` origin, this is a real local-machine attack surface if the trainer is ever run somewhere reachable by an untrusted browser context.
- No automated path exists from "user trains a model locally" to "that model becomes available to `/api/predict` on the cloud backend" — the artifact bundle formats are compatible, but promoting a local bundle into the backend's `ARTIFACT_DIR` is a manual step not implemented anywhere in the repo.

**Cross-cutting:**
- Root `README.md` is **stale** — describes an early 2-endpoint, no-auth, no-ML version of the project (`POST /api/visualize` only) that does not match the current, much larger application. Any report content that leans on this README for architecture claims should be double-checked against the actual code (as this survey did).
- Deployment topology (Vercel + Render + Supabase) named in the report brief is **not documented or configured anywhere in the repository** — no `vercel.json`, no `render.yaml`, no hardcoded production hostnames anywhere in source. It is inferable only from env-var naming conventions (`NEXT_PUBLIC_*`), the backend's Dockerfile, and the CORS regex whitelisting `*.vercel.app`. Report this explicitly as an inferred/likely topology, not a confirmed one.
- PubChem integration exists client-side only (direct browser → PubChem calls); there is no backend-side PubChem proxy, caching, or error handling to describe, contrary to what the report brief assumes.

---

## 9. Line/file counts

`cloc` is not installed in this environment; counts below are `wc -l` over source files only, explicitly excluding `node_modules`, `.next`, `dist`, `__pycache__`, `.venv`, and (for the backend total) the `sparsegraphs` submodule, which is counted separately since it is third-party/external code.

| Component | Scope | Files counted | LOC |
|---|---|---|---|
| Frontend | `frontend/**/*.{ts,tsx,css}` (excl. `node_modules`, `.next`) | all `.ts`/`.tsx`/`.css` | **4,292** |
| Backend (app code) | `backend/**/*.py` (excl. `.venv`, `__pycache__`, `sparsegraphs/`) | all `.py` | **1,984** |
| `sparsegraphs` submodule | `backend/sparsegraphs/**/*.py` (excl. `__pycache__`) | all `.py` | **2,613** (third-party/external, not authored as part of this FYP's frontend/backend app code — attribute accordingly) |
| Trainer | `smiles-viz-trainer/**/*.py` (excl. `dist/`, `egg-info/`) | all `.py` | **2,213** |

These are raw line counts (including blank lines, comments, docstrings, imports) — not a cloc-style code/comment/blank breakdown, since `cloc` was unavailable. If a code/comment/blank split is needed for the report, `cloc` would need to be installed first (not done here, to avoid modifying the environment beyond what was asked).
