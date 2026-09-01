import { config } from "@/lib/config";
import { fetchExternalJson } from "./client";

export type PubChemCompoundInfo = {
  CID?: number;
  IUPACName?: string;
  MolecularFormula?: string;
  MolecularWeight?: string;
  CanonicalSMILES?: string;
  InChI?: string;
  InChIKey?: string;
  Synonyms?: string[];
  Description?: string;
  [key: string]: unknown;
};

export type PubChemProperties = {
  PropertyTable?: {
    Properties?: Array<Record<string, string | number>>;
  };
};

/**
 * Look up a compound by its name. Returns compound info from the full
 * record (auto-detected by PubChem from the /JSON endpoint).
 */
export async function pubchemCompoundByName(name: string): Promise<PubChemCompoundInfo | null> {
  const url = `${config.external.pubchem.baseUrl}/compound/name/${encodeURIComponent(name)}/JSON`;
  return fetchExternalJson<PubChemCompoundInfo>(url);
}

/** Look up a compound by its PubChem CID. */
export async function pubchemCompoundByCid(cid: string | number): Promise<PubChemCompoundInfo | null> {
  const url = `${config.external.pubchem.baseUrl}/compound/cid/${encodeURIComponent(String(cid))}/JSON`;
  return fetchExternalJson<PubChemCompoundInfo>(url);
}

/**
 * Fetch selected properties (e.g. "MolecularFormula,MolecularWeight")
 * for a named compound.
 */
export async function pubchemCompoundProperties(
  name: string,
  properties: string,
): Promise<PubChemProperties | null> {
  const url = `${config.external.pubchem.baseUrl}/compound/name/${encodeURIComponent(name)}/property/${encodeURIComponent(properties)}/JSON`;
  return fetchExternalJson<PubChemProperties>(url);
}
