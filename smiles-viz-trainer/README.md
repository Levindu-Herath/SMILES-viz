# smiles-viz-trainer

Local training server for [smiles-viz](../README.md). Exposes a FastAPI API on `localhost:5000` that the Next.js frontend talks to for training and evaluating molecular property prediction models.

## Prerequisites

- Python 3.10+
- A conda environment with [RDKit](https://www.rdkit.org/) installed

## Installation

```bash
pip install -e .
```

## Usage

```bash
smiles-train
smiles-train --port 5001
```

By default the server binds to `127.0.0.1:5000`. Additional allowed CORS origins can be set via the `ALLOWED_ORIGINS` environment variable (comma-separated).
