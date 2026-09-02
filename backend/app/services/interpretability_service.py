"""
Renders prediction-explanation heatmaps for the Predict tab.

Wraps WLAKSVDInterpreter (backend/interpretability, adapted from the research
notebook) around the *same* live artifact bundle ml_pipeline.inference already
serves predictions from -- same encoder, dictionary and scaler -- so the
highlighted atoms are explaining the exact prediction the user just saw, not
a separately re-derived one.

Two images are produced, matching the notebook's visualise_subtrees pairing
(interpretability_pipeline.ipynb, cell 9c197f7a) pixel-for-pixel: the molecule
rendered with RDKit's Cairo backend, composited via matplotlib alongside its
red/blue score colorbar(s), and returned as base64 PNG data URIs.
  1. score_a_heatmap_png  -- top contributing WL substructures, scored by
                              Score A = atom_contribution x dict_weight.
  2. score_b_heatmap_png  -- same substructures, scored by
                              Score B = Score A x wl_feature_count.
"""

import base64
import hashlib
import io
import threading
from collections import defaultdict
from typing import Optional

import networkx as nx

from app.core.config import settings
from interpretability.wl_aksvd_interpreter import WLAKSVDInterpreter
from ml_pipeline.inference import get_predictor

# rdkit and matplotlib are imported lazily inside compute_prediction_heatmap()
# (and the render helpers it calls), matching ml_pipeline.inference's
# convention -- keeps this module importable (and the router that imports it
# at load time) even if rdkit's native extension or a display-less matplotlib
# backend fails to load in a given environment.

_LABEL_MAP = {-1: "Inactive", 1: "Active"}

_interpreters: dict[tuple[str, str], WLAKSVDInterpreter] = {}
_lock = threading.Lock()


def _get_interpreter(disease_id: str, model_name: str) -> WLAKSVDInterpreter:
    """One interpreter per (disease, classifier) — encoder, dictionary, and
    classifier coefficients all differ per disease. Cached lazily."""
    key = (disease_id, model_name)
    if key not in _interpreters:
        with _lock:
            if key not in _interpreters:
                predictor = get_predictor(disease_id)
                _interpreters[key] = WLAKSVDInterpreter(
                    wl=predictor.encoder,
                    aksvd=predictor.dict_learner,
                    classifier=predictor.model_for(model_name),
                    scaler=predictor.scaler,
                    label_map=_LABEL_MAP,
                )
    return _interpreters[key]


# ---------------------------------------------------------------------------
# WL subtree reconstruction -- for the substructure images we need to know
# *which atoms* belong to each contributing WL token, not just its score.
# get_node_importance() only returns per-node aggregates, so the token ->
# subtree membership is rebuilt here the same way WeisfeilerLehmanHashing
# builds it (self feature, then sorted neighbour features, md5-hashed) so the
# token strings line up byte-for-byte with the ones the encoder produced.
# ---------------------------------------------------------------------------

_ATOMIC_SYMBOLS = {
    "1": "H", "5": "B", "6": "C", "7": "N", "8": "O", "9": "F",
    "14": "Si", "15": "P", "16": "S", "17": "Cl", "33": "As", "34": "Se",
    "35": "Br", "53": "I",
}


def _readable_label(s: str) -> str:
    if s in _ATOMIC_SYMBOLS:
        return _ATOMIC_SYMBOLS[s]
    if len(s) == 32 and all(c in "0123456789abcdef" for c in s):
        return f"[{s[:6]}..]"
    return s


def _build_wl_token_map(graph, attr_key: Optional[str], wl_iterations: int):
    """token -> readable description, token -> [subtree node-id sets]."""
    nodes = list(graph.nodes())
    features = {}
    for node in nodes:
        attrs = dict(graph.nodes[node])
        val = str(attrs.get(attr_key)) if attr_key else str(graph.degree(node))
        features[node] = val
    base_desc = {val: _readable_label(val) for val in features.values()}

    token_desc: dict[str, str] = {}
    token_members: dict[str, list] = defaultdict(list)

    for it in range(wl_iterations):
        radius = it + 1
        new_features = {}
        for node in nodes:
            nbr_feats = sorted(features[n] for n in graph.neighbors(node))
            parts = [features[node]] + nbr_feats
            token = hashlib.md5("_".join(parts).encode()).hexdigest()
            new_features[node] = token

            subtree = set(nx.single_source_shortest_path_length(graph, node, cutoff=radius))
            token_members[token].append(subtree)

            if token not in token_desc:
                if it == 0:
                    readable = [base_desc.get(p, _readable_label(p)) for p in parts]
                    token_desc[token] = "_".join(readable)
                else:
                    readable = [token_desc.get(p, p[:6] + "..") for p in parts]
                    desc = readable[0] + "*(" + ",".join(readable[1:]) + ")"
                    token_desc[token] = desc[:45] + ".." if len(desc) > 45 else desc
        features = new_features

    return token_desc, dict(token_members)


def _aggregate_token_scores(node_sources: dict) -> tuple[dict[str, float], dict[str, float]]:
    """Sum path_importance_a/_b per (atom, token) pair once -- node_sources
    lists the same (atom_idx, token) contribution once per node it touches,
    so dedupe before summing or shared atoms would double-count it."""
    scores_a: dict[str, float] = defaultdict(float)
    scores_b: dict[str, float] = defaultdict(float)
    seen = set()
    for sources in node_sources.values():
        for src in sources:
            key = (src["atom_idx"], src["token"])
            if key in seen:
                continue
            seen.add(key)
            scores_a[src["token"]] += src["path_importance_a"]
            scores_b[src["token"]] += src["path_importance_b"]
    return dict(scores_a), dict(scores_b)


# ---------------------------------------------------------------------------
# Rendering -- ported from the notebook's visualise_subtrees /
# _show_with_colourbar so the Predict tab's images are pixel-for-pixel the
# same as the ones produced during model analysis.
# ---------------------------------------------------------------------------


def _build_token_colour_map(sorted_tokens: list, top_n: int, floor: float = 0.35) -> dict:
    import matplotlib

    sup_cm = matplotlib.colormaps["Reds"]
    opp_cm = matplotlib.colormaps["Blues"]
    supporting = [(t, s) for t, s in sorted_tokens if s > 0][:top_n]
    opposing = [(t, s) for t, s in sorted_tokens if s < 0][:top_n]
    colours = {}
    if supporting:
        max_s = max(abs(s) for _, s in supporting)
        for tok, score in supporting:
            colours[tok] = sup_cm(floor + (abs(score) / max_s) * (1 - floor) if max_s else floor)
    if opposing:
        max_o = max(abs(s) for _, s in opposing)
        for tok, score in opposing:
            colours[tok] = opp_cm(floor + (abs(score) / max_o) * (1 - floor) if max_o else floor)
    return colours


def _expand_to_atoms(token_colour_map: dict, token_members: dict, sorted_tokens: list, n_heavy_atoms: int) -> dict:
    atom_colours: dict[int, tuple] = {}
    for tok, _ in sorted_tokens:
        colour = token_colour_map.get(tok)
        if colour is None:
            continue
        for occurrence in token_members.get(tok, []):
            for atom_idx in occurrence:
                if atom_idx < n_heavy_atoms:
                    atom_colours.setdefault(atom_idx, colour)
    return atom_colours


def _render_molecule(mol, colour_map: dict, size: tuple[int, int]):
    """RDKit Cairo render -> PIL Image, matching the notebook's _render_molecule."""
    from PIL import Image
    from rdkit.Chem.Draw import rdMolDraw2D

    h_atoms = list(colour_map)
    h_aclrs = {int(k): tuple(v[:3]) for k, v in colour_map.items()}
    h_bonds: list[int] = []
    h_bclrs: dict[int, tuple] = {}
    for bond in mol.GetBonds():
        a1, a2 = bond.GetBeginAtomIdx(), bond.GetEndAtomIdx()
        if a1 in colour_map and a2 in colour_map and colour_map[a1] == colour_map[a2]:
            bid = bond.GetIdx()
            h_bonds.append(bid)
            h_bclrs[bid] = tuple(colour_map[a1][:3])

    drawer = rdMolDraw2D.MolDraw2DCairo(*size)
    drawer.drawOptions().useBWAtomPalette()
    drawer.DrawMolecule(
        mol,
        highlightAtoms=h_atoms, highlightAtomColors=h_aclrs,
        highlightBonds=h_bonds, highlightBondColors=h_bclrs,
    )
    drawer.FinishDrawing()
    return Image.open(io.BytesIO(drawer.GetDrawingText()))


def _truncated_cmap(name: str, lo: float = 0.35, hi: float = 1.0, n: int = 256):
    import matplotlib
    import matplotlib.colors as mcolors
    import numpy as np

    return mcolors.LinearSegmentedColormap.from_list(
        f"{name}_trunc",
        matplotlib.colormaps[name](np.linspace(lo, hi, n)),
    )


def _render_with_colourbar(img, sorted_tokens: list, top_n: int, title: str, floor: float = 0.35) -> str:
    """Molecule image + red/blue score colorbar(s), matching the notebook's
    _show_with_colourbar -- returns a base64 PNG data URI instead of
    plt.show()'ing it."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.colors as mcolors
    import matplotlib.pyplot as plt
    import numpy as np

    supporting = [(t, s) for t, s in sorted_tokens if s > 0][:top_n]
    opposing = [(t, s) for t, s in sorted_tokens if s < 0][:top_n]

    n_bars = (1 if supporting else 0) + (1 if opposing else 0)
    w, h = img.size
    ratios = [w] + [30] * n_bars

    fig, axes = plt.subplots(
        1, 1 + n_bars,
        figsize=(w / 96 + n_bars * 1.4, h / 96),
        gridspec_kw={"width_ratios": ratios},
    )
    if not isinstance(axes, np.ndarray):
        axes = [axes]

    axes[0].imshow(img)
    axes[0].axis("off")
    if title:
        axes[0].set_title(title, fontsize=10, pad=6)

    bar_idx = 1

    if supporting:
        abs_scores = sorted(abs(s) for _, s in supporting)
        vmin = abs_scores[0] if abs_scores[0] != abs_scores[-1] else 0.0
        vmax = abs_scores[-1]
        norm = mcolors.Normalize(vmin=vmin, vmax=vmax)
        cb = plt.colorbar(
            plt.cm.ScalarMappable(norm=norm, cmap=_truncated_cmap("Reds", lo=floor)),
            cax=axes[bar_idx],
        )
        cb.set_label("Score  (supporting ▲)", fontsize=8, labelpad=6)
        cb.ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f"{v:.3f}"))
        cb.ax.tick_params(labelsize=7)
        bar_idx += 1

    if opposing:
        abs_scores = sorted(abs(s) for _, s in opposing)
        vmin = abs_scores[0] if abs_scores[0] != abs_scores[-1] else 0.0
        vmax = abs_scores[-1]
        norm = mcolors.Normalize(vmin=vmin, vmax=vmax)
        cb = plt.colorbar(
            plt.cm.ScalarMappable(norm=norm, cmap=_truncated_cmap("Blues", lo=floor)),
            cax=axes[bar_idx],
        )
        cb.set_label("|Score|  (opposing ▼)", fontsize=8, labelpad=6)
        cb.ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f"{v:.3f}"))
        cb.ax.tick_params(labelsize=7)

    fig.tight_layout(pad=0.5)

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150)
    plt.close(fig)
    encoded = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _top_substructures(sorted_tokens: list, token_colours: dict, token_desc: dict, token_members: dict) -> list[dict]:
    total = sum(abs(s) for _, s in sorted_tokens) or 1.0
    return [
        {
            "token": tok,
            "description": token_desc.get(tok, tok[:10] + ".."),
            "score": round(float(score), 6),
            "percentage": round(abs(score) / total * 100, 2),
            "occurrences": len(token_members.get(tok, [])),
            "direction": "supporting" if score >= 0 else "opposing",
        }
        for tok, score in sorted_tokens
        if tok in token_colours
    ]


def compute_prediction_heatmap(
    smiles: str,
    model_name: Optional[str] = None,
    disease_id: Optional[str] = None,
    top_k_atoms: int = 5,
    top_n_substructures: int = 5,
    width: int = 450,
    height: int = 350,
) -> dict:
    """Score A and Score B heatmaps (notebook's visualise_subtrees pairing)
    for the same graph/model the /api/predict endpoint just scored: the top
    contributing WL substructures, highlighted per their full radius and
    coloured by Score A on one image, Score B on the other.
    """
    from rdkit import Chem
    from rdkit.Chem import AllChem

    disease_id = disease_id or settings.default_disease_id
    predictor = get_predictor(disease_id)
    model_name = model_name or predictor.default_model
    interpreter = _get_interpreter(disease_id, model_name)

    graph = predictor.graph_for(smiles)
    importance = interpreter.get_node_importance(graph, top_k_atoms=top_k_atoms)

    smiles = smiles.strip()

    # graph_for() adds explicit Hs to match training, but RDKit preserves the
    # original heavy-atom indices when adding Hs, so node ids < n_heavy_atoms
    # line up directly with a mol parsed without explicit Hs. Node ids at or
    # beyond that are hydrogens, which the display mol below doesn't carry as
    # separate atoms, so they're dropped from both heatmaps.
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError(f"Could not parse SMILES: {smiles!r}")
    AllChem.Compute2DCoords(mol)
    n_heavy_atoms = mol.GetNumAtoms()

    g = interpreter.wl._check_graph(graph)
    first_attrs = dict(next(iter(g.nodes(data=True)))[1]) if g.number_of_nodes() else {}
    attr_key = next(iter(first_attrs), None)
    token_desc, token_members = _build_wl_token_map(g, attr_key, interpreter.wl.wl_iterations)

    scores_a, scores_b = _aggregate_token_scores(importance["node_sources"])
    sorted_tok_a = sorted(scores_a.items(), key=lambda x: abs(x[1]), reverse=True)
    sorted_tok_b = sorted(scores_b.items(), key=lambda x: abs(x[1]), reverse=True)

    token_colours_a = _build_token_colour_map(sorted_tok_a, top_n_substructures)
    token_colours_b = _build_token_colour_map(sorted_tok_b, top_n_substructures)
    atom_colours_a = _expand_to_atoms(token_colours_a, token_members, sorted_tok_a, n_heavy_atoms)
    atom_colours_b = _expand_to_atoms(token_colours_b, token_members, sorted_tok_b, n_heavy_atoms)

    img_a = _render_molecule(mol, atom_colours_a, (width, height))
    img_b = _render_molecule(mol, atom_colours_b, (width, height))

    score_a_heatmap_png = _render_with_colourbar(
        img_a, sorted_tok_a, top_n_substructures,
        title="Score A  (atom_contribution × dict_weight)",
    )
    score_b_heatmap_png = _render_with_colourbar(
        img_b, sorted_tok_b, top_n_substructures,
        title="Score B  (Score A × wl_feature_count)",
    )

    return {
        "smiles": smiles,
        "model_name": model_name,
        "prediction": importance["prediction"],
        "confidence": importance["confidence"],
        "score_a_heatmap_png": score_a_heatmap_png,
        "top_substructures_a": _top_substructures(sorted_tok_a, token_colours_a, token_desc, token_members),
        "score_b_heatmap_png": score_b_heatmap_png,
        "top_substructures_b": _top_substructures(sorted_tok_b, token_colours_b, token_desc, token_members),
    }
