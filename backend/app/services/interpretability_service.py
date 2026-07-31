"""
Renders prediction-explanation heatmaps for the Predict tab.

Wraps WLAKSVDInterpreter (backend/interpretability, adapted from the research
notebook) around the *same* live artifact bundle ml_pipeline.inference already
serves predictions from -- same encoder, dictionary and scaler -- so the
highlighted atoms are explaining the exact prediction the user just saw, not
a separately re-derived one.

Two images are produced (mirrors the notebook's visualise_prediction +
visualise_subtrees pairing, both using Score A = atom_contribution x
dict_weight):
  1. atom_heatmap_svg          -- every heavy atom, coloured by its own
                                   aggregate importance.
  2. substructure_heatmap_svg  -- only the top-N contributing WL subtrees
                                   highlighted (their full radius, not just
                                   the root atom), grouped by substructure
                                   rather than by individual atom.
"""

import hashlib
import threading
from collections import defaultdict
from typing import Optional

import networkx as nx

from interpretability.wl_aksvd_interpreter import WLAKSVDInterpreter
from ml_pipeline.inference import get_predictor

# rdkit is imported lazily inside compute_prediction_heatmap(), matching
# ml_pipeline.inference's convention -- keeps this module importable (and the
# router that imports it at load time) even if rdkit's native extension fails
# to load in a given environment.

_LABEL_MAP = {-1: "Inactive", 1: "Active"}

_interpreters: dict[str, WLAKSVDInterpreter] = {}
_lock = threading.Lock()


def _get_interpreter(model_name: str) -> WLAKSVDInterpreter:
    """One interpreter per model (classifier coefficients differ per model),
    built lazily and cached -- same lifetime as the predictor singleton."""
    if model_name not in _interpreters:
        with _lock:
            if model_name not in _interpreters:
                predictor = get_predictor()
                _interpreters[model_name] = WLAKSVDInterpreter(
                    wl=predictor.encoder,
                    aksvd=predictor.dict_learner,
                    classifier=predictor.model_for(model_name),
                    scaler=predictor.scaler,
                    label_map=_LABEL_MAP,
                )
    return _interpreters[model_name]


# ---------------------------------------------------------------------------
# Colour ramp -- red (supports the prediction) / blue (opposes it), darker
# means stronger contribution. Plain two-stop linear interpolation so no
# matplotlib dependency is needed just to colour a handful of atoms.
# ---------------------------------------------------------------------------

_RED_LO, _RED_HI = (255, 235, 230), (165, 15, 21)
_BLUE_LO, _BLUE_HI = (225, 238, 255), (8, 48, 107)


def _ramp(lo: tuple, hi: tuple, t: float, floor: float) -> tuple[float, float, float]:
    t = floor + max(0.0, min(t, 1.0)) * (1 - floor)
    return tuple((lo[i] + (hi[i] - lo[i]) * t) / 255.0 for i in range(3))


def _score_colour(score: float, max_abs: float, floor: float = 0.15) -> tuple[float, float, float]:
    intensity = abs(score) / max_abs if max_abs else 0.0
    return (
        _ramp(_RED_LO, _RED_HI, intensity, floor)
        if score >= 0
        else _ramp(_BLUE_LO, _BLUE_HI, intensity, floor)
    )


def _render_svg(mol, atom_colours: dict[int, tuple], width: int, height: int) -> str:
    from rdkit.Chem.Draw import rdMolDraw2D

    h_atoms = list(atom_colours)
    h_bonds: list[int] = []
    h_bond_colours: dict[int, tuple] = {}
    for bond in mol.GetBonds():
        a1, a2 = bond.GetBeginAtomIdx(), bond.GetEndAtomIdx()
        if a1 in atom_colours and a2 in atom_colours and atom_colours[a1] == atom_colours[a2]:
            h_bonds.append(bond.GetIdx())
            h_bond_colours[bond.GetIdx()] = atom_colours[a1]

    drawer = rdMolDraw2D.MolDraw2DSVG(width, height)
    drawer.drawOptions().useBWAtomPalette()
    drawer.DrawMolecule(
        mol,
        highlightAtoms=h_atoms,
        highlightAtomColors=atom_colours,
        highlightBonds=h_bonds,
        highlightBondColors=h_bond_colours,
    )
    drawer.FinishDrawing()
    return drawer.GetDrawingText()


# ---------------------------------------------------------------------------
# WL subtree reconstruction -- for the substructure image we need to know
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


def _aggregate_token_scores(node_sources: dict) -> dict[str, float]:
    """Sum path_importance_a per (atom, token) pair once -- node_sources lists
    the same (atom_idx, token) contribution once per node it touches, so
    dedupe before summing or shared atoms would double-count it."""
    scores: dict[str, float] = defaultdict(float)
    seen = set()
    for sources in node_sources.values():
        for src in sources:
            key = (src["atom_idx"], src["token"])
            if key in seen:
                continue
            seen.add(key)
            scores[src["token"]] += src["path_importance_a"]
    return dict(scores)


def _build_token_colour_map(sorted_tokens: list, top_n: int) -> dict:
    supporting = [(t, s) for t, s in sorted_tokens if s > 0][:top_n]
    opposing = [(t, s) for t, s in sorted_tokens if s < 0][:top_n]
    colours = {}
    if supporting:
        max_s = max(abs(s) for _, s in supporting)
        for tok, score in supporting:
            colours[tok] = _ramp(_RED_LO, _RED_HI, abs(score) / max_s if max_s else 0.0, floor=0.35)
    if opposing:
        max_o = max(abs(s) for _, s in opposing)
        for tok, score in opposing:
            colours[tok] = _ramp(_BLUE_LO, _BLUE_HI, abs(score) / max_o if max_o else 0.0, floor=0.35)
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


def compute_prediction_heatmap(
    smiles: str,
    model_name: Optional[str] = None,
    top_k_atoms: int = 5,
    top_n_substructures: int = 5,
    width: int = 450,
    height: int = 350,
) -> dict:
    """Two Score-A heatmaps (atom_contribution x dict_weight) for the same
    graph/model the /api/predict endpoint just scored: one per-atom over the
    whole molecule, one restricted to the top contributing WL substructures.
    """
    from rdkit import Chem
    from rdkit.Chem import AllChem

    predictor = get_predictor()
    model_name = model_name or predictor.default_model
    interpreter = _get_interpreter(model_name)

    graph = predictor.graph_for(smiles)
    importance = interpreter.get_node_importance(graph, top_k_atoms=top_k_atoms)

    smiles = smiles.strip()

    # graph_for() adds explicit Hs to match training, but RDKit preserves the
    # original heavy-atom indices when adding Hs, so node ids < n_heavy_atoms
    # line up directly with a mol parsed without explicit Hs. Node ids at or
    # beyond that are hydrogens, which the display mols below don't carry as
    # separate atoms, so they're dropped from both heatmaps.
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError(f"Could not parse SMILES: {smiles!r}")
    AllChem.Compute2DCoords(mol)
    n_heavy_atoms = mol.GetNumAtoms()

    # --- Image 1: full molecule, per-atom importance -----------------------
    atom_scores = {nid: score for nid, score in importance["sorted_nodes"] if nid < n_heavy_atoms}
    sorted_heavy = sorted(atom_scores.items(), key=lambda x: abs(x[1]), reverse=True)
    max_abs = abs(sorted_heavy[0][1]) if sorted_heavy else 0.0
    total_heavy = sum(abs(s) for _, s in sorted_heavy) or 1.0

    atom_colours = {nid: _score_colour(score, max_abs) for nid, score in atom_scores.items()}
    atom_pct = {nid: round(abs(score) / total_heavy * 100, 2) for nid, score in atom_scores.items()}

    for atom in mol.GetAtoms():
        idx = atom.GetIdx()
        if idx in atom_pct:
            atom.SetProp("atomNote", f"{atom_pct[idx]:.1f}%")

    atom_heatmap_svg = _render_svg(mol, atom_colours, width, height)

    top_atoms = [
        {
            "atom_idx": nid,
            "element": mol.GetAtomWithIdx(nid).GetSymbol(),
            "score": round(float(score), 6),
            "percentage": atom_pct[nid],
            "direction": "supporting" if score >= 0 else "opposing",
        }
        for nid, score in sorted_heavy[:8]
    ]

    # --- Image 2: top contributing substructures (WL subtrees) -------------
    g = interpreter.wl._check_graph(graph)
    first_attrs = dict(next(iter(g.nodes(data=True)))[1]) if g.number_of_nodes() else {}
    attr_key = next(iter(first_attrs), None)
    token_desc, token_members = _build_wl_token_map(g, attr_key, interpreter.wl.wl_iterations)

    token_scores = _aggregate_token_scores(importance["node_sources"])
    sorted_tokens = sorted(token_scores.items(), key=lambda x: abs(x[1]), reverse=True)
    total_tok = sum(abs(s) for _, s in sorted_tokens) or 1.0

    token_colours = _build_token_colour_map(sorted_tokens, top_n_substructures)
    sub_atom_colours = _expand_to_atoms(token_colours, token_members, sorted_tokens, n_heavy_atoms)

    sub_mol = Chem.MolFromSmiles(smiles)
    AllChem.Compute2DCoords(sub_mol)
    substructure_heatmap_svg = _render_svg(sub_mol, sub_atom_colours, width, height)

    top_substructures = [
        {
            "token": tok,
            "description": token_desc.get(tok, tok[:10] + ".."),
            "score": round(float(score), 6),
            "percentage": round(abs(score) / total_tok * 100, 2),
            "occurrences": len(token_members.get(tok, [])),
            "direction": "supporting" if score >= 0 else "opposing",
        }
        for tok, score in sorted_tokens
        if tok in token_colours
    ]

    return {
        "smiles": smiles,
        "model_name": model_name,
        "prediction": importance["prediction"],
        "confidence": importance["confidence"],
        "atom_heatmap_svg": atom_heatmap_svg,
        "top_atoms": top_atoms,
        "substructure_heatmap_svg": substructure_heatmap_svg,
        "top_substructures": top_substructures,
    }
