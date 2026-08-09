import networkx as nx
from rdkit import Chem


def molecule_to_graph(mol) -> nx.Graph:
    """Convert an RDKit Mol object to a networkx graph matching the training data format.

    Same graph structure as smiles_to_graph but accepts a pre-parsed Mol object.
    Used for SDF files where molecules are already parsed by SDMolSupplier.
    """
    if mol is None:
        raise ValueError("Received a None molecule")

    G = nx.Graph()
    for atom in mol.GetAtoms():
        G.add_node(atom.GetIdx(), feature=atom.GetSymbol())
    for bond in mol.GetBonds():
        G.add_edge(
            bond.GetBeginAtomIdx(),
            bond.GetEndAtomIdx(),
            bond_type=str(bond.GetBondType()),
            bond_order=bond.GetBondTypeAsDouble(),
            aromatic=bond.GetIsAromatic(),
            in_ring=bond.IsInRing(),
            conjugated=bond.GetIsConjugated(),
            stereo=str(bond.GetStereo()),
        )
    return G


def smiles_to_graph(smiles: str) -> nx.Graph:
    """Convert a SMILES string to a networkx graph matching the training data format.

    Mirrors the graph construction in sparsegraphs/utils/graph_data.py:
    - Node feature = atom symbol
    - Edges = bonds with bond_type, bond_order, aromatic, in_ring, conjugated, stereo attributes
    - Explicit hydrogens added (matching SDF loading behavior)
    """
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError(f"Could not parse SMILES: {smiles!r}")
    mol = Chem.AddHs(mol)
    return molecule_to_graph(mol)
