# syntax=docker/dockerfile:1
FROM mambaorg/micromamba:2.9.0-debian13-slim

# Run every RUN step below inside the activated base env.
ARG MAMBA_DOCKERFILE_ACTIVATE=1

# 1. Conda layer: Python + RDKit from conda-forge.
RUN micromamba install -y -n base -c conda-forge python=3.11 rdkit && \
    micromamba clean --all --yes

# 2. App dir owned by the non-root user (uploaded-model cache is written here).
USER root
RUN mkdir -p /app/artifacts/published && chown -R $MAMBA_USER:$MAMBA_USER /app
USER $MAMBA_USER
WORKDIR /app

# 3. Pip layer. The cache mount keeps downloaded wheels between rebuilds.
COPY --chown=$MAMBA_USER:$MAMBA_USER requirements.txt .
RUN --mount=type=cache,target=/home/mambauser/.cache/pip,uid=57439,gid=57439 \
    pip install -r requirements.txt

# 4. Application code (+ the 3 reference bundles allowed by .dockerignore).
COPY --chown=$MAMBA_USER:$MAMBA_USER . .

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
