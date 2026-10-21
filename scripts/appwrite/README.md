# Appwrite product-catalog import

Moves the local SQLite catalog (`data/foodguard/foodguard.db`, ~29,650 Indian
retail products) into Appwrite **TablesDB**.

## Scope: catalog only

Appwrite stores the **product catalog** only. Users, sessions, gamification,
challenges and analyses stay in PostgreSQL:

| Data | Store | Why |
| --- | --- | --- |
| products, barcodes, nutrition, ingredient/allergen links | Appwrite TablesDB | Read-heavy document data, no cross-entity constraints |
| users, sessions, preferences | PostgreSQL | Foreign keys, unique constraints |
| XP / streaks / challenges | PostgreSQL | Needs atomic multi-row updates and `idempotencyKey` dedupe, which a document store cannot express |

## Schema

`products` — one document per product, with the 1:1 and 1:N child rows
denormalised onto it so a product read is a single fetch:

- identity: `productId` (unique index), `name`, `normalizedName`, `brand`, `normalizedBrand`
- lookup: `barcode` (key index), `barcodes[]`
- packaging: `variant`, `packSize`, `quantity`, `unit`, `price`, `mrp`, `rating`
- classification: `foodType`, `dietary`, `description`, `imageUrl`
- provenance: `dataStatus`, `completenessScore`, `confidenceScore`, `sources[]`
- denormalised children: `nutrition` (JSON text), `ingredientIds[]`, `allergenIds[]`
- audit: `createdAt`, `updatedAt`

`product_barcodes` — barcode → product lookup, its own table because Appwrite
cannot put a unique index on an array column:

- `barcode` (unique index), `productId` (key index), `source`, `confidence`

## Why the CLI provisions but the SDK imports

`appwrite tablesdb create-rows` passes rows as command-line arguments, which
cannot carry 29,650 products. So:

- **provision.sh** — Appwrite CLI (`appwrite databases create`, `appwrite tablesdb create-table`), declarative and idempotent
- **import-catalog.ts** — Appwrite server SDK, batched with retries

## Workflow

```bash
# 0. One-time: fill these in backend/.env
#    APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY

# 1. Create the database, tables, columns and indexes (idempotent)
npm run appwrite:provision

# 2. Export SQLite -> NDJSON (~2s, writes backend/tmp/appwrite/)
npm run appwrite:export

# 3. Import NDJSON -> Appwrite
npm run appwrite:import

# Re-import safely — skips rows already present
npm run appwrite:import -- --skip-existing

# Trial run with no credentials and no writes
npm run appwrite:import -- --dry-run
```

## Behaviour worth knowing

- **Timestamps are pinned to UTC.** The catalog stores naive local-looking
  strings (`2026-08-19T00:24:23.750292`, from Python `utcnow().isoformat()`).
  `new Date()` would read them as machine-local and shift every row by the
  importer's offset (+05:30 on this machine). `isoDate()` in
  `src/lib/appwrite/catalog-mapping.ts` treats offset-less timestamps as UTC.
- **Values are normalised, not trusted.** Appwrite rejects an over-long string
  or a malformed `url`/`datetime` and fails the *whole batch*, so the mapping
  truncates to the column size, validates URLs, and drops unparseable values.
- **A bad row cannot block the batch.** If a batch of 100 fails permanently,
  its rows are retried individually and the rejects are written to
  `tmp/appwrite/<table>.failures.ndjson`. The process exits non-zero if
  anything failed.
- **Rate limits are handled.** 408/429/5xx retry with exponential backoff up to
  5 attempts. Batch size is capped at 100 (Appwrite's bulk limit).
- Export output lands in `backend/tmp/`, which is git-ignored.

## Verifying

```bash
npm run appwrite:import -- --dry-run            # no writes
npx vitest run src/__tests__/appwrite-catalog-mapping.test.ts
```