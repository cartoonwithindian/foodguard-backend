/**
 * FSSAI Additive Knowledge Base
 *
 * Startup-loaded, cached index over the extracted FSSAI additive knowledge base
 * (`fssai-knowledge-base/additives.json`, 556 clean records) and the
 * category-permission layer (`additive_permissions.json`, ~227 records).
 *
 * Design notes:
 *  - The JSON files are parsed ONCE and cached in memory (precomputed map
 *    pattern) — never re-read per request.
 *  - Records are validated before indexing; extraction noise is excluded rather
 *    than fuzzy-matched. Regulatory classification must never be guessed.
 *  - Presence in the knowledge base alone is NOT permission. The permission
 *    layer comes only from `additive_permissions.json` — every permission row
 *    is backed by an explicit source table/rule. When no permission data
 *    exists for a matched additive, callers must surface
 *    `PERMISSION_REQUIRES_CATEGORY_DATA` instead of inventing permission.
 *  - Statuses come straight from the extraction (PERMITTED /
 *    PERMITTED_WITH_CONDITIONS / RESTRICTED / NOT_PERMITTED / NOT_SPECIFIED /
 *    UNCLEAR). We never mark an additive permitted merely because it exists in
 *    the knowledge base.
 *  - Works identically in mock mode and database mode — no PostgreSQL is
 *    required to perform additive lookup.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { logger } from "@/lib/logger";

export interface AdditiveKBSource {
  document: string;
  regulation?: string;
  section?: string;
  table?: string;
  line?: number;
}

/** A raw record as extracted from additives.json. */
export interface AdditiveKBRawRecord {
  additive_name?: string;
  INS_number?: string;
  functional_class?: string[];
  synonyms?: string[];
  confidence?: string;
  needs_human_review?: boolean;
  source?: AdditiveKBSource;
}

/** A validated, indexed knowledge-base record. */
export interface AdditiveKBRecord {
  name: string;
  insNumber: string | null;
  /** True when the INS number is plausible (100–1529) and indexed by number. */
  validIns: boolean;
  functionalClass: string[];
  synonyms: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  needsHumanReview: boolean;
  source: AdditiveKBSource;
}

/** Additive permission statuses — taken verbatim from the extraction. */
export type AdditivePermissionStatus =
  | "PERMITTED"
  | "PERMITTED_WITH_CONDITIONS"
  | "RESTRICTED"
  | "NOT_PERMITTED"
  | "NOT_SPECIFIED"
  | "UNCLEAR";

/** A permission record from additive_permissions.json. */
export interface AdditivePermissionRecord {
  insNumber?: string;
  additiveName?: string;
  foodCategory?: string;
  status?: AdditivePermissionStatus;
  maxLevel?: string;
  unit?: string;
  conditions?: string;
  restrictions?: string[];
  source?: AdditiveKBSource;
}

export interface AdditiveKBStats {
  totalRecords: number;
  indexedRecords: number;
  validInsCount: number;
  validNameCount: number;
  permissionsCount: number;
  sourceFile: string;
}

const FSSAI_DIR = join(process.cwd(), "fssai-knowledge-base");

const ADDITIVES_FILE = "additives.json";
const PERMISSIONS_FILE = "additive_permissions.json";

// Word tokens that mark a parsed row as table boilerplate rather than an
// additive name. The 2026 clean extraction no longer produces these, but the
// filter stays as a defence in depth against regressions.
const NOISE_TOKENS = [
  "table",
  "percent",
  "requirement",
  "designation",
  "locality",
  "moisture",
  "gram",
  "columns",
  "sub section",
  "acid value",
  "minimum",
  "maximum",
  "frozen confection",
  "class of",
  "as prescribed",
];

/** Lowercases and collapses whitespace/punctuation for name lookups. */
export function normalizeAdditiveName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extracts the digit part of an INS/E number ("E621" -> "621", "100(i)" -> "100"). */
export function normalizeInsNumber(value: string): string {
  return String(value).replace(/[^\d]/g, "");
}

/**
 * INS key that PRESERVES sub-classifications so distinct additives are never
 * conflated: "160c" -> "160c", "150d" -> "150d", "160a(i)" -> "160ai",
 * "100(i)" -> "100i", "E621" -> "621". Used for indexing and permission
 * matching. Sub-classifications (letter suffix, roman numeral) denote
 * DIFFERENT additives with different permission rows (160a vs 160c, 150a vs
 * 150d), so they must never collapse into the bare numeric core.
 */
export function normalizeInsKey(value: string): string {
  const s = String(value).trim().toLowerCase().replace(/\s+/g, "");
  const m = s.match(/^(?:ins|e)?(\d{3,4})([a-z])?(?:\(?(i{1,3}|iv|v|vi{0,3})\)?)?$/);
  if (!m) return normalizeInsNumber(value);
  return m[1] + (m[2] ?? "") + (m[3] ?? "");
}

/** INS numbers are 3-digit core values (100–1529, incl. sub-classifications). */
function isValidInsNumber(value: string): boolean {
  const digits = normalizeInsNumber(value);
  if (!/^\d{3,4}$/.test(digits)) return false;
  const n = Number(digits);
  return n >= 100 && n <= 1529;
}

function isValidAdditiveName(name: string): boolean {
  const s = (name ?? "").trim();
  if (s.length < 3 || s.length > 80) return false;
  if (/[\n\t\r]/.test(s)) return false;
  if (!/^[A-Za-z][A-Za-z .()\-']*$/.test(s)) return false;
  const lower = s.toLowerCase();
  return !NOISE_TOKENS.some((token) => lower.includes(token));
}

function parseConfidence(value: unknown): "HIGH" | "MEDIUM" | "LOW" {
  const s = String(value ?? "").toUpperCase();
  return s === "HIGH" ? "HIGH" : s === "LOW" ? "LOW" : "MEDIUM";
}

export class FSSAIAdditiveKnowledgeBase {
  private readonly dir: string;
  private byIns = new Map<string, AdditiveKBRecord>();
  private byName = new Map<string, AdditiveKBRecord>();
  private permissions: AdditivePermissionRecord[] = [];
  private stats: AdditiveKBStats = {
    totalRecords: 0,
    indexedRecords: 0,
    validInsCount: 0,
    validNameCount: 0,
    permissionsCount: 0,
    sourceFile: join(FSSAI_DIR, ADDITIVES_FILE),
  };
  private loaded = false;
  private loadError: string | null = null;

  /**
   * @param options.records      fixture/curated records (used by tests); when
   *                             omitted the raw JSON is loaded from disk.
   * @param options.permissions  fixture permission records (defaults to file).
   * @param options.dir          override the knowledge-base directory.
   */
  constructor(options?: {
    dir?: string;
    records?: AdditiveKBRawRecord[];
    permissions?: AdditivePermissionRecord[];
  }) {
    this.dir = options?.dir ?? FSSAI_DIR;
    if (options?.records || options?.permissions) {
      this.loaded = true;
      if (options.records) this.buildIndex(options.records);
      if (options.permissions) {
        this.permissions = options.permissions.map((p) =>
          this.normalizePermissionRecord(p as unknown as Record<string, unknown>),
        );
      }
      this.stats.permissionsCount = this.permissions.length;
      this.stats.sourceFile = "fixture";
    } else {
      this.loadFromDisk();
    }
  }

  private loadFromDisk(): void {
    if (this.loaded) return;
    this.loaded = true;

    try {
      const additivesPath = join(this.dir, ADDITIVES_FILE);
      if (!existsSync(additivesPath)) {
        this.loadError = `${ADDITIVES_FILE} not found at ${additivesPath}`;
        logger.warn("fssai_additive_kb_missing", { path: additivesPath });
        return;
      }
      const raw = JSON.parse(readFileSync(additivesPath, "utf-8")) as unknown;
      if (Array.isArray(raw)) {
        this.buildIndex(raw as AdditiveKBRawRecord[]);
      } else {
        this.loadError = `${ADDITIVES_FILE} is not an array`;
        logger.warn("fssai_additive_kb_invalid", { error: this.loadError });
      }

      const permissionsPath = join(this.dir, PERMISSIONS_FILE);
      if (existsSync(permissionsPath)) {
        const perms = JSON.parse(readFileSync(permissionsPath, "utf-8")) as unknown;
        if (Array.isArray(perms)) {
          this.permissions = (perms as unknown[]).map((p) =>
            this.normalizePermissionRecord(p as Record<string, unknown>),
          );
        }
      }
      this.stats.permissionsCount = this.permissions.length;
      this.stats.sourceFile = additivesPath;
    } catch (error) {
      this.loadError = String(error);
      logger.error("fssai_additive_kb_load_failed", { error: this.loadError });
    }
  }

  /** Maps raw snake_case permission records (extraction) to runtime records. */
  private normalizePermissionRecord(raw: Record<string, unknown>): AdditivePermissionRecord {
    const src = (raw.source ?? {}) as Record<string, unknown>;
    const rec: AdditivePermissionRecord = {
      insNumber:
        raw.insNumber !== undefined
          ? String(raw.insNumber)
          : raw.ins_number !== undefined
            ? String(raw.ins_number)
            : undefined,
      additiveName:
        raw.additiveName !== undefined
          ? String(raw.additiveName)
          : raw.additive !== undefined
            ? String(raw.additive)
            : undefined,
      foodCategory:
        raw.foodCategory !== undefined
          ? String(raw.foodCategory)
          : raw.food_category !== undefined
            ? String(raw.food_category)
            : undefined,
      status: (raw.status as AdditivePermissionStatus | undefined) ?? "PERMITTED_WITH_CONDITIONS",
      maxLevel:
        raw.maxLevel !== undefined
          ? String(raw.maxLevel)
          : raw.maximum_level !== undefined
            ? String(raw.maximum_level)
            : undefined,
      unit: raw.unit !== undefined ? String(raw.unit) : undefined,
      conditions: raw.conditions !== undefined ? String(raw.conditions) : undefined,
      restrictions: Array.isArray(raw.restrictions)
        ? (raw.restrictions as string[])
        : undefined,
      source: {
        document: src.document !== undefined ? String(src.document) : "FSSAI Regulations",
        regulation: src.regulation !== undefined ? String(src.regulation) : undefined,
        section: src.section !== undefined ? String(src.section) : undefined,
        table: src.table !== undefined ? String(src.table) : undefined,
        line: src.line !== undefined ? Number(src.line) : undefined,
      },
    };
    return rec;
  }

  private buildIndex(records: AdditiveKBRawRecord[]): void {
    this.stats.totalRecords = records.length;
    let indexed = 0;
    let validInsCount = 0;
    let validNameCount = 0;

    for (const raw of records) {
      const name = (raw.additive_name ?? "").trim();
      const insRaw = raw.INS_number;
      const hasIns = insRaw !== undefined && insRaw !== null && String(insRaw).trim() !== "";
      const insValid = hasIns && isValidInsNumber(String(insRaw));
      const nameValid = isValidAdditiveName(name);
      const synonyms = (raw.synonyms ?? []).filter((s) => isValidAdditiveName(s));

      if (!insValid && !nameValid) continue; // extraction noise — never match

      indexed += 1;
      if (insValid) validInsCount += 1;
      if (nameValid) validNameCount += 1;

      const record: AdditiveKBRecord = {
        name,
        insNumber: hasIns ? String(insRaw) : null,
        validIns: insValid,
        functionalClass: Array.isArray(raw.functional_class)
          ? raw.functional_class.filter((f) => typeof f === "string")
          : [],
        synonyms,
        confidence: parseConfidence(raw.confidence),
        needsHumanReview: raw.needs_human_review === true,
        source: {
          document: raw.source?.document ?? "FSSAI Food Additives Regulations",
          regulation: raw.source?.regulation,
          section: raw.source?.section,
          table: raw.source?.table,
          line: raw.source?.line,
        },
      };

      if (insValid && record.insNumber) {
        const key = normalizeInsKey(record.insNumber);
        if (key && !this.byIns.has(key)) {
          this.byIns.set(key, record);
        }
      }
      const nameKey = normalizeAdditiveName(name);
      if (nameValid && nameKey && !this.byName.has(nameKey)) {
        this.byName.set(nameKey, record);
      }
      // Index known synonyms too, so "tartrazine" → "C.I. Food Yellow 4",
      // "sucralose" → "trichlorogalactosucrose", OCR variants, etc. all resolve.
      for (const synonym of synonyms) {
        const key = normalizeAdditiveName(synonym);
        if (key && !this.byName.has(key)) {
          this.byName.set(key, record);
        }
      }
    }

    this.stats.indexedRecords = indexed;
    this.stats.validInsCount = validInsCount;
    this.stats.validNameCount = validNameCount;
    logger.info("fssai_additive_kb_indexed", {
      total: this.stats.totalRecords,
      indexed,
      validIns: validInsCount,
      validName: validNameCount,
    });
  }

  /** Lookup by INS number (or E number — same numbering). Exact, never fuzzy. */
  lookupByINS(ins: string): AdditiveKBRecord | null {
    this.loadFromDisk();
    const key = normalizeInsKey(ins);
    if (!key) return null;
    return this.byIns.get(key) ?? null;
  }

  /** Lookup by normalized additive name or a known synonym. Exact, never fuzzy. */
  lookupByName(name: string): AdditiveKBRecord | null {
    this.loadFromDisk();
    const key = normalizeAdditiveName(name);
    if (!key) return null;
    return this.byName.get(key) ?? null;
  }

  /**
   * Category-specific permission for an additive.
   *
   * @param insNumber       INS number of the additive (optional when the name
   *                        is provided instead).
   * @param options.name    additive name, used when the permission row has no
   *                        INS link (e.g. narrative rules).
   * @param options.foodCategory  when given, prefer permission rows whose food
   *                        category matches; otherwise fall back to the first
   *                        row for that additive.
   *
   * Returns null when no permission data exists — callers must then surface
   * PERMISSION_REQUIRES_CATEGORY_DATA rather than guessing.
   */
  getCategoryPermission(
    insNumber?: string,
    options?: { name?: string; foodCategory?: string },
  ): AdditivePermissionRecord | null {
    this.loadFromDisk();
    const insKey = insNumber ? normalizeInsKey(insNumber) : "";
    const nameKey = options?.name ? normalizeAdditiveName(options.name) : "";
    const categoryKey = options?.foodCategory ? normalizeAdditiveName(options.foodCategory) : "";

    const matches = this.permissions.filter((p) => {
      const pIns = p.insNumber ? normalizeInsKey(p.insNumber) : "";
      const pName = p.additiveName ? normalizeAdditiveName(p.additiveName) : "";
      if (insKey && pIns) return pIns === insKey;
      if (insKey && pName) return pName.includes(insKey) || insKey.includes(pName);
      if (nameKey && pName) {
        return pName.includes(nameKey) || nameKey.includes(pName);
      }
      return false;
    });

    if (matches.length === 0) return null;
    if (categoryKey) {
      const byCategory = matches.find((p) => {
        const fc = p.foodCategory ? normalizeAdditiveName(p.foodCategory) : "";
        return fc.includes(categoryKey) || categoryKey.includes(fc);
      });
      if (byCategory) return byCategory;
    }
    return matches[0];
  }

  /** All permission records for an additive (for multi-category diagnostics). */
  getPermissionsForAdditive(
    insNumber?: string,
    name?: string,
  ): AdditivePermissionRecord[] {
    this.loadFromDisk();
    const insKey = insNumber ? normalizeInsKey(insNumber) : "";
    const nameKey = name ? normalizeAdditiveName(name) : "";
    return this.permissions.filter((p) => {
      const pIns = p.insNumber ? normalizeInsKey(p.insNumber) : "";
      const pName = p.additiveName ? normalizeAdditiveName(p.additiveName) : "";
      if (insKey && pIns) return pIns === insKey;
      if (nameKey && pName) {
        return pName.includes(nameKey) || nameKey.includes(pName);
      }
      return false;
    });
  }

  getStats(): AdditiveKBStats {
    this.loadFromDisk();
    return { ...this.stats };
  }

  getLoadError(): string | null {
    return this.loadError;
  }
}

let singleton: FSSAIAdditiveKnowledgeBase | null = null;

/** Shared instance — parsed and indexed once per process. */
export function getFSSAIAdditiveKnowledgeBase(): FSSAIAdditiveKnowledgeBase {
  singleton ??= new FSSAIAdditiveKnowledgeBase();
  return singleton;
}
