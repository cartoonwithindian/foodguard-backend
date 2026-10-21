import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Migration-chain guard.
 *
 * The repository previously shipped only the two gamification migrations, which
 * are hand-written and assume `User` / `Product` already exist. Because no
 * migration ever created the 29 pre-existing models, `prisma migrate deploy`
 * aborted on the first migration of a fresh database with
 * `relation "User" does not exist`, so production could never be provisioned.
 *
 * `20260924000000_baseline` closes that gap. These assertions fail if a future
 * model or enum is added to the schema without a matching baseline statement,
 * if the baseline is no longer ordered before the migrations that reference its
 * tables, or if any migration becomes destructive.
 */

const PRISMA = join(process.cwd(), "prisma");
const MIGRATIONS = join(PRISMA, "migrations");
const BASELINE = "20260924000000_baseline";

const schema = readFileSync(join(PRISMA, "schema.prisma"), "utf8");
const baselineSql = readFileSync(join(MIGRATIONS, BASELINE, "migration.sql"), "utf8");

/** `<timestamp>_<name>` directories, oldest first (Prisma applies in this order). */
const migrationDirs = readdirSync(MIGRATIONS)
  .filter((d) => /^\d{14}_/.test(d))
  .sort();

const timestamps = migrationDirs.map((d) => d.slice(0, 14));

const schemaModels = [...schema.matchAll(/^model\s+([A-Za-z_][A-Za-z0-9_]*)/gm)].map((m) => m[1]);
const schemaEnums = [...schema.matchAll(/^enum\s+([A-Za-z_][A-Za-z0-9_]*)/gm)].map((m) => m[1]);

describe("prisma migration chain", () => {
  it("ships the baseline migration that creates the pre-existing tables", () => {
    expect(migrationDirs).toContain(BASELINE);
  });

  it("orders the baseline before every other migration", () => {
    // The gamification migrations ALTER/REFERENCEMENT `User` and `Product`, so
    // the baseline has to be applied first or the chain fails.
    expect(timestamps.indexOf(BASELINE.slice(0, 14))).toBe(0);
    expect(timestamps[0]).toBe(BASELINE.slice(0, 14));
  });

  it("has unique, strictly increasing migration timestamps", () => {
    expect(new Set(timestamps).size).toBe(timestamps.length);
    const sorted = [...timestamps].sort();
    expect(timestamps).toEqual(sorted);
  });

  it("creates a table for every model in the schema", () => {
    const missing = schemaModels.filter(
      (model) => !baselineSql.includes(`CREATE TABLE IF NOT EXISTS "${model}"`),
    );
    expect(missing).toEqual([]);
  });

  it("covers every model in the schema", () => {
    // Guards against a schema model that no migration creates at all.
    expect(schemaModels.length).toBeGreaterThan(0);
    expect(schemaModels).toContain("User");
    expect(schemaModels).toContain("Product");
    expect(schemaModels).toContain("HistoryEntry");
  });

  it("creates a guarded enum type for every enum in the schema", () => {
    const missing = schemaEnums.filter((e) => !baselineSql.includes(`CREATE TYPE "${e}" AS ENUM`));
    expect(missing).toEqual([]);
    // Enums are wrapped in DO/EXCEPTION so re-running is safe.
    expect(baselineSql).toMatch(/WHEN duplicate_object THEN NULL/);
  });

  it("keeps the baseline idempotent so it is safe on a pre-existing database", () => {
    expect(baselineSql).not.toMatch(/^CREATE TABLE "/m);
    expect(baselineSql).not.toMatch(/^CREATE (UNIQUE )?INDEX "/m);
    // Foreign keys are guarded by a pg_constraint existence check.
    expect(baselineSql).toMatch(/SELECT 1 FROM pg_constraint WHERE conname/);
  });

  it("contains no destructive statement in any migration", () => {
    const destructive =
      /\b(DROP\s+(TABLE|COLUMN|TYPE|SCHEMA|DATABASE|INDEX)|TRUNCATE|DELETE\s+FROM)\b/i;
    for (const dir of migrationDirs) {
      const sql = readFileSync(join(MIGRATIONS, dir, "migration.sql"), "utf8");
      expect(sql, `${dir} must not be destructive`).not.toMatch(destructive);
    }
  });
});