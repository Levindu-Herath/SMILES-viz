// Compound-name/SMILES resolution helpers, shared by every predict surface
// (Analyze -> Predict and the standalone Predict page).

export interface ExampleMolecule {
  label: string;
  smiles: string;
}

// Curated "Try:" examples. Each carries its own canonical SMILES so selecting one
// can display the familiar name while resolving straight to that SMILES (see
// findExampleByLabel below) instead of round-tripping through a PubChem name
// lookup -- important for the less common names below, where PubChem's name
// resolution can be unreliable.
export const EXAMPLE_COMPOUNDS: readonly ExampleMolecule[] = [
  { label: "Aspirin", smiles: "CC(=O)Oc1ccccc1C(=O)O" },
  { label: "Paracetamol", smiles: "CC(=O)Nc1ccc(O)cc1" },
  {
    label: "Ritterazine A",
    smiles:
      "CC1C2C(C=C3C4CCC5Cc6nc7c(nc6CC5(C)C4CC(O)C32CO)CC2CCC3C4=CC5OC6(OC(C)(CO)CC6O)C(C)C5(O)C4(C)C(O)CC3C2(C)C7)OC12CCC(C)(C)O2",
  },
  {
    label: "Pactamycin",
    smiles: "CC(=O)c1cccc(NC2C(N)C(NC(=O)N(C)C)(C(C)O)C(C)(O)C2(O)COC(=O)c2c(C)cccc2O)c1",
  },
  {
    label: "Valinomycin",
    smiles:
      "CC1OC(=O)C(C(C)C)NC(=O)C(C(C)C)OC(=O)C(C(C)C)NC(=O)C(C)OC(=O)C(C(C)C)NC(=O)C(C(C)C)OC(=O)C(C(C)C)NC(=O)C(C)OC(=O)C(C(C)C)NC(=O)C(C(C)C)OC(=O)C(C(C)C)NC1=O",
  },
  {
    label: "Leucinostatin A",
    smiles:
      "CCC(=O)CC(O)CC(C)CC(NC(=O)C1CC(C)CN1C(=O)C=CC(C)CC)C(=O)NC(C(=O)NC(C)(C)C(=O)NC(CC(C)C)C(=O)NC(CC(C)C)C(=O)NC(C)(C)C(=O)NC(C)(C)C(=O)NCCC(=O)NC(C)CN(C)C)C(O)C(C)C",
  },
] as const;

// Matches typed text against a curated example by name, so a Try-example selection
// (which fills the input with the familiar label, not raw SMILES) resolves straight
// to its known-good SMILES instead of a live PubChem lookup.
export function findExampleByLabel(input: string): ExampleMolecule | undefined {
  const trimmed = input.trim().toLowerCase();
  return EXAMPLE_COMPOUNDS.find((e) => e.label.toLowerCase() === trimmed);
}

// Heuristic only -- ambiguous input falls through to a PubChem lookup, and if that
// fails the raw input is still tried against the backend as a SMILES string, so a
// wrong guess here never blocks a valid input from working.
export function looksLikeSmiles(input: string): boolean {
  const s = input.trim();
  if (!s) return false;
  // Structural characters that only appear in SMILES notation.
  if (/[()=[\]#@\\/]/.test(s)) return true;
  // Multi-word or hyphenated input reads as a name (e.g. "vitamin C", "beta-carotene").
  if (/[\s-]/.test(s)) return false;
  // Ring-closure digits (c1ccccc1) are a strong SMILES signal.
  if (/\d/.test(s)) return true;
  // An uppercase letter after the first position breaks normal English capitalization
  // (e.g. "CCO", "NCCc1ccc(O)c(O)c1") -- real compound names only capitalize the first letter.
  if (/[A-Z]/.test(s.slice(1))) return true;
  return false;
}

export async function resolveCompoundName(name: string): Promise<{ smiles: string; cid: number }> {
  // PubChem's PUG REST deprecated `CanonicalSMILES` in favour of `SMILES` /
  // `ConnectivitySMILES` -- requesting the old name still returns HTTP 200, but the
  // property comes back under a different key, so ask for all three and read
  // whichever one is actually present instead of assuming the property name.
  const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(
    name,
  )}/property/SMILES,CanonicalSMILES,ConnectivitySMILES/JSON`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error("Could not connect to PubChem. Try entering a SMILES string instead.");
  }

  if (res.status === 404) {
    throw new Error(
      `Compound '${name}' not found on PubChem. Try a different name or enter a SMILES string directly.`,
    );
  }
  if (!res.ok) {
    throw new Error("Could not connect to PubChem. Try entering a SMILES string instead.");
  }

  const data = await res.json();
  const prop = data?.PropertyTable?.Properties?.[0];
  const smiles = prop?.SMILES ?? prop?.CanonicalSMILES ?? prop?.ConnectivitySMILES;
  if (!smiles) {
    throw new Error(
      `Compound '${name}' not found on PubChem. Try a different name or enter a SMILES string directly.`,
    );
  }
  return { smiles, cid: prop.CID };
}
