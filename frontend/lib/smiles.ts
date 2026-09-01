// Compound-name/SMILES resolution helpers, shared by every predict surface
// (Analyze -> Predict and the standalone Predict page).

// Common drug/compound names general users would recognize -- resolved to SMILES via
// PubChem on submit, rather than requiring users to already know the SMILES notation.
export const EXAMPLE_COMPOUNDS = [
  "Aspirin",
  "Caffeine",
  "Ibuprofen",
  "Paracetamol",
  "Penicillin",
  "Glucose",
] as const;

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
