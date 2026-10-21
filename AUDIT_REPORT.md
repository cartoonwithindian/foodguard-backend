# FoodGuard Backend — Security & Correctness Audit

- **Repository:** `cartoonwithindian/foodguard-backend`
- **Branch:** `audit/foodguard-backend-remediation` (base `main` @ `f9c2b98`)
- **Date:** 2026-10-21
- **Scope:** API routes, authentication/authorization, stores (`memory`/`prisma`), schemas/validation, outbound fetch (SSRF), Prisma schema + migrations, dependencies, tests.
- **Method:** independent second-pass verification. The previous report and `audit/findings.json` were treated as claims and re-tested against source, tests, a disposable PostgreSQL 16 instance, and a production build. Per the current directive, only this repository was inspected; the frontend repository was not accessed.

Nothing was committed, pushed, merged, deployed, reset or discarded. All changes remain uncommitted on the audit branch. No secret values appear in this report.

**Status legend:** `fixed` = code change + regression test on this branch and re-verified; `partially-fixed` = measurable improvement but a residual remains; `open` = confirmed and not remediated; `external` = cannot be verified in this repository; `not-tested` = could not be exercised in this environment.

---

## 1. Final verification results

| Check | Result |
| --- | --- |
| `npm run typecheck` | **pass** (exit 0, app + scripts tsconfigs) |
| `npm test` | **pass — 71 files, 1010 tests, 0 skipped** |
| `npm run build` (`prisma generate && tsup`) | **pass** |
| `npx prisma validate` | schema valid |
| Fresh DB: `prisma migrate deploy` | all 4 migrations applied on empty PostgreSQL 16 |
| `prisma migrate diff --from-url … --to-schema-datamodel … --exit-code` | `No difference detected` |
| Migration replay | pre-existing `updatedAt` defaults replaced with `<none>`; rerun is idempotent (exit 0) |
| `npm audit` | 6 vulnerabilities: 2 critical, 3 high, 1 moderate (all dev/build-time; no runtime bundle exposure) |
| `git diff --check` | clean |
| Secret scan (worktree + history) | no credentials, keys or database URLs committed |

### Production smoke test (real PostgreSQL, `node dist/server.js`)

| Request | Result |
| --- | --- |
| `GET /health` | 200 |
| Signup | 200 |
| Duplicate signup | 409 |
| Wrong password | 401 |
| Guest login | 401 |
| Malformed JSON | 400 |
| Oversized JSON body | 413 |
| Personalized analysis without auth | 401 |
| Admin route without token | 401 |
| Visual search → `http://localhost` | 400 |
| Visual search → cloud metadata IP | 400 |

---

## 2. Findings

Severity is the pre-remediation impact. All regression tests listed are on this branch.

### Critical

**FG-01 — SSRF in outbound product/image fetching — `fixed`**
Caller-influenced URLs on `/api/analyze`, product-image analysis and remote barcode decoding could reach loopback, private, link-local and cloud-metadata addresses, including through redirects.
Fix: `src/lib/safe-fetch.ts` validates http(s), resolves DNS, rejects reserved ranges (IPv4 and IPv6, including IPv4-mapped/NAT64/6to4 forms), re-validates every redirect (max 3), enforces deadlines. The second pass replaced the high-level `fetch` transport with `node:http`/`node:https` plus a custom `lookup` that pins the validated IP at socket level while preserving TLS SNI/`servername`, closing the DNS-rebinding window. See FG-21.

**FG-02 — Authentication bypass / account takeover via login auto-create — `fixed`**
Unknown emails were created with the supplied password and logged in; guest accounts with `passwordHash = null` were loginable.
Fix: unknown email, null hash and wrong password all return the same `401 AUTH_INVALID_CREDENTIALS`; login never creates an account. Covered by `auth-security.test.ts`.

**FG-03 — Stale or forged admin `role` claim — `fixed`**
`requireAdmin()` trusted the JWT claim only.
Fix: role is re-read from the store (401 unknown user, 403 non-admin); JWT verification is pinned to HS256. All nine admin route modules are covered by `admin-routes-auth.test.ts`, and token-alg/tamper cases by `jwt-validation.test.ts`.

**FG-04 — Scan response envelope mismatch — `partially-fixed` / `external`**
The route returns the standard envelope `{ success, data, error, meta }` with scan fields under `data`. Shared client helpers in this repository (`src/lib/resolve-product.ts`, `src/lib/ocr-client.ts`) previously read top-level `barcode`/`ocr`/`ingredientsText`, so a successful scan looked empty and could surface as a failure.
Fix (backend): both helpers now prefer `json.data` and fall back to the legacy unwrapped shape; a new `scan-label-contract.test.ts` locks the envelope, the payload keys and the absence of top-level duplicates. Frontend consumption could not be inspected under the backend-only directive and remains **external verification** before shipping a frontend release.

### High

**FG-05 — Unbounded bodies and 500s on malformed JSON — `fixed`**
Public AI and user routes parsed unbounded JSON with `request.json()` (malformed input → 500).
Fix: `parseJsonBody()` maps malformed JSON to 400 `VALIDATION_ERROR`; bounded schemas cap array counts and string lengths; URLs use the http(s)-only `httpUrlSchema`. Applied across analyze, personalized, regulatory, ingredients, compare, history, users/me(+preferences), auth and admin routes.

**FG-06 — Admin product image accepted arbitrary URI schemes — `fixed`**
Fix: `productImageUpdateSchema` + `httpUrlSchema` accept only bounded http(s) URLs and a bounded product id.

**FG-07 — Hardcoded demo credentials and unguarded demo seeding — `fixed`**
Fix: seeding returns early in production, remains opt-in via `SEED_DEMO_DATA`, demo emails are normalized and never admin, plaintext credential hint removed.

**FG-08 — Vulnerable dependencies — `partially-fixed`**
After `npm audit fix` (sharp, hono, transformers, adm-zip) and an `esbuild` override from `0.27.7` to `0.28.1`, `npm audit` reports **6** advisories: 2 critical (`tinypool` via Vitest 3.2.7), 1 moderate (`@vitest/mocker`), 3 high in the `prisma`/`@prisma/config`/`deepmerge-ts` build-time chain. All are dev/build-only. Clearing them requires unreviewed semver-major upgrades (Vitest 5, Prisma 7); no safe non-major fix exists. Accepted as a documented residual for this change set.

**FG-09 — Chat response guard allowed non-http URL schemes — `fixed`**
Fix: `httpUrl` refinement restricts `sources[].url` and `view_regulation.payload.url` to http(s), ≤2048 chars.

**FG-10 — Product-images route unbounded and leaky — `fixed`**
Fix: 1–50 names, ≤200 chars, language validation, rate limit, `fileMustExist`, standard error envelope; legacy success shape preserved.

**FG-11 — Alternatives silently ignored invalid preferences — `fixed`**
Fix: invalid or malformed bodies return 400; rate limits on GET and POST.

**FG-12 — Expensive AI endpoints unthrottled — `fixed` (key paths)**
Rate limits added to product-images, ingredient detail and alternatives; second pass added `/api/products` and `/api/products/search`.

### Medium

**FG-13 — `updatedAt` schema/migration drift — `fixed`**
Fix: `20261021000000_fix_updated_at_defaults` drops the DB defaults (no data change). Verified on fresh PostgreSQL 16: all migrations apply, `migrate diff` is empty, and replaying the migration on a database that already had the defaults is idempotent.

**FG-14 — Weak/missing `AUTH_SECRET` in production — `fixed`**
Production requires ≥32 characters and fails fast at startup; development warns.

**FG-15 — Missing `DATABASE_URL` surfaced only at request time — `fixed`**
Startup validation exits on missing `DATABASE_URL`/`AUTH_SECRET` and warns on missing `CORS_ORIGINS`, `FSSAI_API_URL` or ineffective `SEED_DEMO_DATA`.

**FG-16 — Prisma errors leaked driver text — `fixed`**
`P2002` → generic 409; other `P####` → generic 500 `DATABASE_ERROR`.

**FG-17 — Duplicate signup race returned 500 — `fixed`**
Unique violations map to 409 `AUTH_EMAIL_EXISTS` in both stores; emails are lowercased. Concurrent duplicate signup test asserts one 200 and one 409.

### Low / informational

- **FG-18 — Guest email namespace claimable via signup — `fixed`.** Reserved guest addresses are rejected.
- **FG-19 — Tokens lack `iss`/`aud` — `open`.** Acceptable for a single-service deployment; revisit when the secret is shared.
- **FG-20 — Rate limiting is per-process — `open`.** Use a shared store for multi-instance deployments.
- Gamification routes remain mounted with and without `/api` for backward compatibility; admin routes are mounted only under `/api/admin`.

---

## 3. New findings from the verification pass

| ID | Severity | Status | Finding and evidence |
| --- | --- | --- | --- |
| FG-21 | high | `fixed` | **DNS rebinding survived the original SSRF fix.** Validation and connection used separate DNS answers. `safe-fetch` now pins the validated address through a custom `lookup` (Node ≥20.13 `all:true` array form handled), keeps TLS SNI, disables connection reuse, and re-validates redirects. Tests prove the socket goes to the pinned address even when the hostname later resolves elsewhere. |
| FG-22 | high | `fixed` | **Binary fetches trusted `content-length`.** `readBytesLimited` now counts streamed bytes for analysis (10 MB) and barcode decoding (20 MB); missing or lying headers cannot exceed the cap. |
| FG-23 | high | `fixed` | **Unbounded bodies/form data on remaining routes.** `readRequestBytes`, `parseJsonBody({maxBytes})` (1 MB default → 413 `PAYLOAD_TOO_LARGE`) and `readFormDataLimited` are applied to chat, food-safety assistant, product-images, enrich-product, scan/label (image cap + 1 MB), visual-search (`maxBodyMb`) and visual-search-url (16 KB). Hono's global `bodyLimit` also remains in `server.ts`. |
| FG-24 | medium | `fixed` | **Unbounded path/query identifiers.** Evidence barcodes (`^\d{4,32}$`), history ids (≤120), ingredient ids (≤80), product-image barcodes (3–32), temp ids (≤64), nutrition barcodes (≤32); evidence `url` now uses `httpUrlSchema`. |
| FG-25 | medium | `fixed` | **Personalized analysis parsed the request before authentication.** `requireAuth` and rate limiting now run before body parsing. |
| FG-26 | medium | `fixed` | **In-repo scan clients contradicted their own API.** See FG-04: clients now accept the envelope first; contract test added. |
| FG-27 | low | `fixed` | **Unbounded catalog search.** `/api/products` and `/api/products/search` now rate-limit and cap `q` (120), category (80) and page (10 000). |

---

## 4. Changes on this branch

- **New:** `src/lib/safe-fetch.ts`, migration `20261021000000_fix_updated_at_defaults/`, and test suites `safe-fetch`, `jwt-validation`, `admin-routes-auth`, `http-validation`, `auth-security`, `route-hardening`, `scan-label-contract`.
- **Auth:** `services/user.service.ts`, `lib/auth.ts`, `lib/server/auth-secret.ts`, `lib/store/{index,memory,prisma}.ts`.
- **Validation/errors:** `schemas/index.ts`, `lib/http.ts`, `lib/errors.ts`; hardened routes across auth, analysis, chat, food-safety, products, evidence, history, ingredients, nutrition, product-images, temp, visual-search and admin modules.
- **Outbound fetching/limits:** `web-product-enrichment.ts`, `analysis.service.ts`, `barcode/node-decoder.ts`, `chat/response-guard.ts`.
- **Contracts:** `lib/resolve-product.ts`, `lib/ocr-client.ts` now accept the documented envelope (and the legacy unwrapped shape).
- **Ops/dependencies:** `src/server.ts` startup validation; `package.json`/`package-lock.json` updates (including `esbuild: 0.28.1`).

`git diff --check` is clean. All changes are uncommitted on `audit/foodguard-backend-remediation`.

---

## 5. Residual risk and not-tested items

1. **Frontend scan consumer (FG-04)** — externally reported; not verifiable here. The backend contract is documented and tested; confirm the frontend reads `data.*` before release.
2. **Dependencies (FG-08)** — Vitest and Prisma major upgrades are required to clear dev/build advisories. They do not ship in the runtime bundle but should be scheduled.
3. **Deployment PostgreSQL version** — migrations were verified on PostgreSQL 16 only. The production server version was not available in this environment.
4. **Live third-party providers** (LLM, Firecrawl, FSSAI, visual-search) were not called. Their input validation, timeouts and fail-closed paths are covered by tests.
5. **`npm ci`** was not re-run after the final lockfile state; the existing installation passed typecheck, tests and build.

---

## 6. Recommendation

**GO for the backend**, with conditions: run `prisma migrate deploy` against staging first, and have the frontend owner confirm the `data.*` scan contract before deploying a matching frontend release. No confirmed open critical or high backend code vulnerability remains; the only residual high-severity items are dev/build dependency advisories (FG-08) and externally unverified frontend consumption (FG-04).
