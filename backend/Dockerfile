FROM continuumio/miniconda3:latest

WORKDIR /app

# Create conda environment with RDKit (no torch needed for inference)
RUN conda create -n smiles-viz python=3.11 rdkit -c conda-forge -y && \
    conda clean -afy

# Activate environment for subsequent commands
SHELL ["conda", "run", "-n", "smiles-viz", "/bin/bash", "-c"]

# Copy requirements and install pip dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code (includes sparsegraphs submodule with artifacts)
COPY . .

# Expose port
EXPOSE 8000

# Run with conda environment activated
CMD ["conda", "run", "--no-capture-output", "-n", "smiles-viz", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
