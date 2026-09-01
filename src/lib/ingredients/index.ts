import type { IngredientRecord } from "@/types/domain";
import { INGREDIENT_SEED } from "@/data/seed/ingredients";

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u2018\u2019\u201C\u201D']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

class IngredientIndex {
  private byId = new Map<string, IngredientRecord>();
  private byCanonical = new Map<string, IngredientRecord>();
  private byAlias = new Map<string, IngredientRecord>();
  private byE = new Map<string, IngredientRecord>();
  private byIns = new Map<string, IngredientRecord>();

  constructor(records: IngredientRecord[]) {
    for (const record of records) {
      this.byId.set(record.id, record);
      this.byCanonical.set(normalizeText(record.canonicalName), record);
      if (record.eNumber) this.byE.set(record.eNumber.toLowerCase(), record);
      if (record.insCode) this.byIns.set(record.insCode, record);
      if (record.eNumber) this.byIns.set(record.eNumber.replace(/^e/i, ""), record);
      for (const a of record.aliases) {
        const key = normalizeText(a.alias);
        if (!this.byAlias.has(key)) this.byAlias.set(key, record);
      }
    }
  }

  resolveByAlias(raw: string): IngredientRecord | undefined {
    return this.byAlias.get(normalizeText(raw));
  }

  resolveByCanonical(raw: string): IngredientRecord | undefined {
    return this.byCanonical.get(normalizeText(raw));
  }

  resolveByE(e: string): IngredientRecord | undefined {
    return this.byE.get(normalizeText(e));
  }

  resolveByIns(ins: string): IngredientRecord | undefined {
    return this.byIns.get(ins.trim());
  }

  getById(id: string): IngredientRecord | undefined {
    return this.byId.get(id);
  }

  all(): IngredientRecord[] {
    return [...this.byId.values()];
  }
}

export const ingredientIndex = new IngredientIndex(INGREDIENT_SEED);

// Re-export normalizeIngredient so that importing from '@/lib/ingredients' works
export { normalizeIngredient } from "./normalize";
