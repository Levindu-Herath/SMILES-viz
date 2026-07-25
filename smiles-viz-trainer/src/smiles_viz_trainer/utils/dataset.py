import os
from dataclasses import dataclass, field

import pandas as pd
from rdkit import Chem
from rdkit.Chem import SDMolSupplier

SMILES_COLUMN_CANDIDATES = [
    "smiles",
    "SMILES",
    "canonical_smiles",
    "Canonical_SMILES",
    "smi",
    "molecule",
]

TARGET_COLUMN_CANDIDATES = [
    "activity",
    "label",
    "target",
    "class",
    "active",
    "outcome",
    "y",
]


@dataclass
class InvalidRow:
    row: int
    smiles: str
    error: str


@dataclass
class DatasetValidationResult:
    file_path: str
    file_format: str | None = None
    total_rows: int = 0
    valid_smiles: int = 0
    invalid_smiles: int = 0
    invalid_rows: list[InvalidRow] = field(default_factory=list)
    columns: list[str] = field(default_factory=list)
    detected_smiles_column: str | None = None
    detected_target_column: str | None = None
    target_value_counts: dict = field(default_factory=dict)
    is_valid: bool = False
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _detect_smiles_column(df: pd.DataFrame) -> str | None:
    for candidate in SMILES_COLUMN_CANDIDATES:
        if candidate in df.columns:
            return candidate

    lowered_candidates = {c.lower() for c in SMILES_COLUMN_CANDIDATES}
    for column in df.columns:
        if column.lower() in lowered_candidates:
            return column

    string_columns = df.select_dtypes(include=["object"]).columns
    best_column = None
    best_ratio = 0.0
    for column in string_columns:
        sample = df[column].dropna().astype(str).head(5)
        if len(sample) == 0:
            continue
        parsed = sum(1 for value in sample if Chem.MolFromSmiles(value) is not None)
        ratio = parsed / len(sample)
        if ratio > best_ratio:
            best_ratio = ratio
            best_column = column

    if best_ratio > 0.5:
        return best_column

    return None


def _detect_target_column(df: pd.DataFrame, smiles_column: str | None) -> str | None:
    for candidate in TARGET_COLUMN_CANDIDATES:
        if candidate in df.columns and candidate != smiles_column:
            return candidate

    lowered_candidates = {c.lower() for c in TARGET_COLUMN_CANDIDATES}
    for column in df.columns:
        if column == smiles_column:
            continue
        if column.lower() in lowered_candidates:
            return column

    return None


def _validate_csv(result: DatasetValidationResult) -> None:
    try:
        df = pd.read_csv(result.file_path)
    except Exception as exc:
        result.errors.append(f"Failed to read CSV file: {exc}")
        return

    result.columns = list(df.columns)
    result.total_rows = len(df)

    smiles_column = _detect_smiles_column(df)
    result.detected_smiles_column = smiles_column
    if smiles_column is None:
        result.errors.append("No SMILES column detected")
        return

    target_column = _detect_target_column(df, smiles_column)
    result.detected_target_column = target_column
    if target_column is None:
        result.errors.append("No target/label column detected")

    invalid_rows: list[InvalidRow] = []
    valid_count = 0
    for idx, value in df[smiles_column].items():
        smiles = "" if pd.isna(value) else str(value)
        mol = Chem.MolFromSmiles(smiles) if smiles else None
        if mol is None:
            invalid_rows.append(
                InvalidRow(row=idx + 1, smiles=smiles, error="Could not be parsed by RDKit")
            )
        else:
            valid_count += 1

    result.valid_smiles = valid_count
    result.invalid_smiles = len(invalid_rows)
    result.invalid_rows = invalid_rows

    if target_column is not None:
        counts = df[target_column].value_counts(dropna=False)
        result.target_value_counts = {str(k): int(v) for k, v in counts.items()}

    if result.invalid_smiles > 0:
        result.warnings.append(
            f"{result.invalid_smiles} invalid SMILES found, these rows will be skipped during training"
        )


def _validate_sdf(result: DatasetValidationResult) -> None:
    try:
        supplier = SDMolSupplier(result.file_path)
    except Exception as exc:
        result.errors.append(f"Failed to read SDF file: {exc}")
        return

    invalid_rows: list[InvalidRow] = []
    valid_count = 0
    total = 0
    target_values: list[str | None] = []
    target_column = None

    for idx, mol in enumerate(supplier):
        total += 1
        if mol is None:
            invalid_rows.append(
                InvalidRow(row=idx + 1, smiles="", error="Could not be parsed by RDKit")
            )
            continue

        valid_count += 1

        if target_column is None:
            for candidate in TARGET_COLUMN_CANDIDATES:
                if mol.HasProp(candidate):
                    target_column = candidate
                    break

        if target_column is not None and mol.HasProp(target_column):
            target_values.append(mol.GetProp(target_column))
        else:
            target_values.append(None)

    result.total_rows = total
    result.valid_smiles = valid_count
    result.invalid_smiles = len(invalid_rows)
    result.invalid_rows = invalid_rows
    result.detected_smiles_column = None
    result.detected_target_column = target_column

    if target_column is None:
        result.errors.append("No target/label column detected")
    else:
        counts: dict[str, int] = {}
        for value in target_values:
            key = "None" if value is None else str(value)
            counts[key] = counts.get(key, 0) + 1
        result.target_value_counts = counts

    if result.invalid_smiles > 0:
        result.warnings.append(
            f"{result.invalid_smiles} invalid SMILES found, these rows will be skipped during training"
        )


def validate_dataset(file_path: str) -> DatasetValidationResult:
    result = DatasetValidationResult(file_path=file_path)

    if not os.path.isfile(file_path):
        result.errors.append("File not found")
        return result

    _, ext = os.path.splitext(file_path)
    ext = ext.lower()

    if ext == ".csv":
        result.file_format = "csv"
        _validate_csv(result)
    elif ext == ".sdf":
        result.file_format = "sdf"
        _validate_sdf(result)
    else:
        result.errors.append("Unsupported file extension, expected .csv or .sdf")
        return result

    result.is_valid = len(result.errors) == 0
    return result
