/**
 * FSSAI Contaminant Knowledge Base
 *
 * Startup-cached loader over the extracted contaminant limits
 * (`fssai-knowledge-base/contaminants.json`, ~572 records).
 *
 * Regulatory limits are REFERENCE THRESHOLDS, not findings about any scanned
 * product. This module only exposes the reference data plus lookup helpers —
 * it never claims a product contains (or exceeds) a contaminant.
 *
 * Works identically in mock mode and database mode — no PostgreSQL required.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { logger } from "@/lib/logger";

export type ContaminantSubstanceType =
  | "HEAVY_METAL"
  | "MYCOTOXIN"
  | "NATURAL_TOXIN"
  | "PESTICIDE_RESIDUE"
  | "VETERINARY_DRUG_RESIDUE"
  | "PROHIBITED_SUBSTANCE"
  | "OTHER";

export interface ContaminantKBRecord {
  substance: string;
  substance_type: ContaminantSubstanceType;
  food_category: string;
  maximum_limit: string;
  unit: string;
  applicable_conditions?: string;
  source: {
    document: string;
    regulation?: string;
    section?: string;
    table?: string;
    page?: string;
  };
  confidence: "HIGH" | "MEDIUM" | "LOW";
  needs_human_review: boolean;
  note?: string;
}

export interface ContaminantKBStats {
  totalRecords: number;
  byType: Record<string, number>;
  needsHumanReview: number;
  sourceFile: string;
}

const FSSAI_DIR = join(process.cwd(), "fssai-knowledge-base");
const CONTAMINANTS_FILE = "contaminants.json";

/** Food labels that apply broadly rather than to a specific commodity. */
export const GENERAL_FOOD_LABELS = [
  "all foods",
  "all articles of food",
  "any article of food",
  "foods not specified",
  "other foods",
  "general",
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export class ContaminantKnowledgeBase {
  private readonly dir: string;
  private records: ContaminantKBRecord[] = [];
  private loaded = false;
  private loadError: string | null = null;
  private sourceFile = join(FSSAI_DIR, CONTAMINANTS_FILE);

  constructor(options?: { dir?: string; records?: ContaminantKBRecord[] }) {
    this.dir = options?.dir ?? FSSAI_DIR;
    if (options?.records) {
      this.records = options.records;
      this.loaded = true;
      this.sourceFile = "fixture";
    } else {
      this.loadFromDisk();
    }
  }

  private loadFromDisk(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const filepath = join(this.dir, CONTAMINANTS_FILE);
      if (!existsSync(filepath)) {
        this.loadError = `${CONTAMINANTS_FILE} not found at ${filepath}`;
        logger.warn("fssai_contaminant_kb_missing", { path: filepath });
        return;
      }
      const raw = JSON.parse(readFileSync(filepath, "utf-8")) as unknown;
      if (Array.isArray(raw)) {
        this.records = raw as ContaminantKBRecord[];
      } else {
        this.loadError = `${CONTAMINANTS_FILE} is not an array`;
        logger.warn("fssai_contaminant_kb_invalid", { error: this.loadError });
      }
      this.sourceFile = filepath;
      logger.info("fssai_contaminant_kb_loaded", {
        total: this.records.length,
        sourceFile: filepath,
      });
    } catch (error) {
      this.loadError = String(error);
      logger.error("fssai_contaminant_kb_load_failed", { error: this.loadError });
    }
  }

  /** All reference records (or [] when the KB is unavailable). */
  getAll(): ContaminantKBRecord[] {
    this.loadFromDisk();
    return this.records;
  }

  /** Reference limits for a substance (insensitive exact match). */
  getBySubstance(substance: string): ContaminantKBRecord[] {
    const key = normalize(substance);
    return this.getAll().filter((r) => normalize(r.substance) === key);
  }

  /** Reference limits of a given substance type. */
  getByType(type: ContaminantSubstanceType): ContaminantKBRecord[] {
    return this.getAll().filter((r) => r.substance_type === type);
  }

  /**
   * Reference limits relevant to a food category: exact/contains matches plus
   * the general buckets ("All foods", "Foods not specified", ...). No category
   * → all records.
   */
  getByFoodCategory(foodCategory?: string): ContaminantKBRecord[] {
    const all = this.getAll();
    if (!foodCategory || !foodCategory.trim()) return all;
    const key = normalize(foodCategory);
    // Bidirectional matching only for meaningful keys — a 1-2 char key would
    // otherwise over-match every row containing that fragment.
    const bidirectional = key.length >= 3;
    const specific = all.filter((r) => {
      const fc = normalize(r.food_category);
      return fc.includes(key) || (bidirectional && key.includes(fc));
    });
    if (specific.length > 0) {
      return specific;
    }
    return all.filter((r) =>
      GENERAL_FOOD_LABELS.some((label) => normalize(r.food_category).includes(label)),
    );
  }

  getStats(): ContaminantKBStats {
    const all = this.getAll();
    const byType: Record<string, number> = {};
    for (const r of all) {
      byType[r.substance_type] = (byType[r.substance_type] ?? 0) + 1;
    }
    return {
      totalRecords: all.length,
      byType,
      needsHumanReview: all.filter((r) => r.needs_human_review).length,
      sourceFile: this.sourceFile,
    };
  }

  getLoadError(): string | null {
    return this.loadError;
  }
}

let singleton: ContaminantKnowledgeBase | null = null;

/** Shared instance — loaded and cached once per process. */
export function getContaminantKnowledgeBase(): ContaminantKnowledgeBase {
  singleton ??= new ContaminantKnowledgeBase();
  return singleton;
}
