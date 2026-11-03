# syntax=docker/dockerfile:1
# Tag + digest pinned; Dependabot (docker ecosystem) proposes bumps.
FROM mambaorg/micromamba:2.9.0-debian13-slim@sha256:7b93def90e48d6d7744938e31c29172e03b19bc9f56f0db512039f18efd21529

# Run every RUN step below inside the activated base env.
ARG MAMBA_DOCKERFILE_ACTIVATE=1

# 1. Conda layer: Python + RDKit from conda-forge, installed from the explicit
#    lock (exact builds + md5). Edit environment.yml, then regenerate the lock.
COPY --chown=$MAMBA_USER:$MAMBA_USER conda-lock.txt /tmp/conda-lock.txt
RUN micromamba install -y -n base -f /tmp/conda-lock.txt && \
    micromamba clean --all --yes && \
    rm /tmp/conda-lock.txt

# 2. App dir owned by the non-root user (uploaded-model cache is written here).
USER root
RUN mkdir -p /app/artifacts/published && chown -R $MAMBA_USER:$MAMBA_USER /app
USER $MAMBA_USER
WORKDIR /app

# 3. Pip layer from the pip-compile lock. The cache mount keeps downloaded
#    wheels between rebuilds; pip check fails the build on broken deps.
COPY --chown=$MAMBA_USER:$MAMBA_USER requirements.txt .
RUN --mount=type=cache,target=/home/mambauser/.cache/pip,uid=57439,gid=57439 \
    pip install -r requirements.txt && \
    pip check

# 4. Application code (+ the 3 reference bundles allowed by .dockerignore).
COPY --chown=$MAMBA_USER:$MAMBA_USER . .

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
