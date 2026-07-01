"""
RDKit resources that are expensive to initialize.
Loaded once at module import and reused across requests.
"""

from typing import Callable, Optional

from rdkit.Chem.FilterCatalog import FilterCatalog, FilterCatalogParams


def _load_sa_scorer() -> Optional[Callable]:
    """Attempt to load the SA Score function from RDKit Contrib."""
    try:
        from rdkit.Contrib.SA_Score import sascorer
        return sascorer.calculateScore
    except Exception:
        pass

    try:
        import importlib.util
        import os

        from rdkit.Chem import RDConfig

        path = os.path.join(RDConfig.RDContribDir, "SA_Score", "sascorer.py")
        spec = importlib.util.spec_from_file_location("sascorer", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module.calculateScore
    except Exception:
        return None


def _load_pains_catalog() -> FilterCatalog:
    """Build the PAINS filter catalog."""
    params = FilterCatalogParams()
    params.AddCatalog(FilterCatalogParams.FilterCatalogs.PAINS)
    return FilterCatalog(params)


# Module-level singletons
sa_scorer_fn = _load_sa_scorer()
pains_catalog = _load_pains_catalog()
