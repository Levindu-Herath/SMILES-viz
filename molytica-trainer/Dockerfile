# TODO: pin by digest (@sha256:...) for full reproducibility
FROM continuumio/miniconda3:24.9.2-0 AS builder

WORKDIR /app

# Conda env "molytica": python=3.11 (sklearn artifact compatibility) + RDKit from
# conda-forge. Baking RDKit here removes the pip path's undeclared conda-only
# RDKit dependency — this is the whole point of the image.
RUN conda create -n molytica python=3.11 rdkit -c conda-forge -y && \
    conda clean -afy

# Activate the env for subsequent RUN commands
SHELL ["conda", "run", "-n", "molytica", "/bin/bash", "-c"]

# CPU-only torch, installed explicitly from the PyTorch CPU index *before*
# `pip install .`, so the package's `torch>=2.0` dependency is satisfied by
# this wheel and pip never pulls the large default CUDA wheel. No CUDA
# libraries end up in the image.
RUN pip install --no-cache-dir torch==2.4.1 --index-url https://download.pytorch.org/whl/cpu

# Copy only what the install needs (see .dockerignore) for build-cache efficiency
COPY pyproject.toml README.md ./
COPY src ./src

# Install the package from source, same as the pip path — no forked logic
RUN pip install --no-cache-dir . && \
    find /opt/conda/envs/molytica -type d -name "__pycache__" -exec rm -rf {} + && \
    find /opt/conda/envs/molytica -type d \( -iname "test" -o -iname "tests" \) -path "*/site-packages/*" -exec rm -rf {} +

# ---- Runtime stage -----------------------------------------------------
# The builder stage's ~2.6GB is mostly build-time-only weight: the miniconda
# installer + its own base env (never used at runtime — we only ever run
# inside the "molytica" env), plus git/mercurial/subversion/openssh/wget
# that continuumio/miniconda3 ships for *building* environments, not running
# one. None of that belongs in the shipped image. This stage copies out only
# the finished "molytica" env plus the handful of system shared libraries
# RDKit's conda-forge build links against (X11/cairo runtime libs), on the
# same Debian bookworm base the builder image itself uses.
FROM debian:bookworm-slim

RUN apt-get update -q && \
    apt-get install -y --no-install-recommends \
        ca-certificates libglib2.0-0 libsm6 libxext6 libxrender1 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/conda/envs/molytica /opt/conda/envs/molytica
ENV PATH="/opt/conda/envs/molytica/bin:${PATH}" \
    CONDA_PREFIX="/opt/conda/envs/molytica" \
    LD_LIBRARY_PATH="/opt/conda/envs/molytica/lib"
# LD_LIBRARY_PATH is required: the conda env ships its own newer libstdc++
# (RDKit needs a GLIBCXX version the debian-slim base's system libstdc++
# doesn't have), and without this the dynamic linker finds the system one
# first and RDKit's native extension fails to import.

WORKDIR /app
EXPOSE 5000

# curl may be absent from this base image; use a Python one-liner instead
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:5000/health', timeout=3).status == 200 else 1)" || exit 1

# Bind 0.0.0.0 inside the container — required for the compose port mapping to
# work. Loopback-only exposure is enforced at the compose `ports:` publish
# level (127.0.0.1:5000:5000), not here. The "molytica" env is already on
# PATH, so the console script runs directly (no "conda run" wrapper needed).
CMD ["molytica-train", "--host", "0.0.0.0", "--port", "5000"]
