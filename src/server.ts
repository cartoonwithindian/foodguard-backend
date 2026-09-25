import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { logger as honoLogger } from "hono/logger";
import { serve } from "@hono/node-server";
import type { Context } from "hono";

import { config } from "@/lib/config";
import { AppError, ErrorCodes } from "@/lib/errors";
import { jsonError } from "@/lib/http";
import { REMOTE_ADDR_HEADER } from "@/lib/rate-limit";

/**
 * Web-standards adapter that mounts the FoodGuard Next.js API route handlers
 * onto a standalone Hono server.
 *
 * The route modules under `src/app/api` (path ending in `route.ts`) export GET
 * and/or POST handlers of the shape `(request, { params }) => Promise<Response>`.
 * They use only the standard Request/Response/crypto Web APIs and their
 * `jsonSuccess`/`jsonError` helpers return plain Response objects — so they
 * can be registered on Hono verbatim, with no reimplementation.
 */

// Eagerly load every route handler via the build-time-generated static
// registry (so tsup bundles them all and prefers static imports over a
// runtime filesystem glob).
import { ROUTES } from "./routes.generated";

// Every method the route handlers export. GET/POST alone silently dropped the
// PATCH / PUT / DELETE handlers (preferences, profile, history, assistant).
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type Method = (typeof HTTP_METHODS)[number];

const app = new Hono();

/**
 * Records the raw TCP peer address on every request.
 *
 * Rate limiting keys come from `clientIp()`, which reads client-supplied
 * headers. Those headers are forgeable on a server that is reached directly,
 * and absent entirely behind some proxies — either way the limiter degrades to
 * either "unlimited budgets" or one shared bucket for every caller. The peer
 * address is stamped server-side (overwriting anything the client sent) so the
 * key is always available and always authentic.
 *
 * Registered first: `bodyLimit` may rebuild `c.req.raw`, and headers are
 * copied across when it does.
 */
type NodeIncoming = { socket?: { remoteAddress?: string } };
app.use("*", async (c, next) => {
  try {
    // Always clear first so a client-supplied value can never survive when
    // the peer address is unavailable (unix sockets, test harnesses).
    c.req.raw.headers.delete(REMOTE_ADDR_HEADER);
    const remote = (c.env as { incoming?: NodeIncoming } | undefined)?.incoming?.socket?.remoteAddress;
    if (remote) c.req.raw.headers.set(REMOTE_ADDR_HEADER, remote);
  } catch {
    // Headers can be immutable in some runtimes; rate limiting then falls
    // back to the forwarded-address path.
  }
  await next();
});

/**
 * Cross-origin allowlist. The old behaviour echoed any `Origin` back with
 * `Access-Control-Allow-Origin`, so literally any website could call the API
 * from a visitor's browser.
 *
 * Set `CORS_ORIGINS` to a comma-separated list of exact origins
 * (e.g. `https://foodguard.vercel.app,http://localhost:3000`), or `*` to
 * allow every origin deliberately. With nothing configured, cross-origin
 * browser requests are rejected.
 */
const configuredOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowAnyOrigin = configuredOrigins.includes("*");
const allowedOrigins = new Set(configuredOrigins);
if (configuredOrigins.length === 0) {
  console.warn(
    "[foodguard-backend] CORS_ORIGINS is not set — cross-origin browser requests will be rejected. " +
      "Set CORS_ORIGINS to your frontend origin(s), comma-separated, or `*` to allow all.",
  );
}

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return undefined; // same-origin / non-browser client
      if (allowAnyOrigin) return origin;
      return allowedOrigins.has(origin) ? origin : undefined;
    },
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "x-forwarded-for"],
    exposeHeaders: ["Content-Length"],
    maxAge: 86400,
  }),
);

/**
 * Rejects oversized bodies before a handler buffers them — `/api/scan/label`
 * and `/api/visual-search` read the whole upload into memory first, so a
 * multi-gigabyte body was a free OOM. Uses the standard content-length fast
 * path and a bounded stream read otherwise.
 */
app.use(
  "*",
  bodyLimit({
    maxSize: config.limits.maxBodyMb * 1024 * 1024,
    onError: (c) =>
      jsonError(
        new AppError(
          ErrorCodes.PAYLOAD_TOO_LARGE,
          `Request body exceeds the ${config.limits.maxBodyMb} MB limit`,
          413,
        ),
        c.req.header("x-request-id") ?? "body-limit",
      ),
  }),
);

app.use("*", honoLogger());

app.get("/health", (c) => c.json({ status: "ok", service: "foodguard-backend" }));

let mounted = 0;
type RouteHandler = (req: Request, p: { params: Promise<Record<string, string>> }) => Promise<Response>;

for (const { path: route, mod } of ROUTES) {
  for (const method of HTTP_METHODS) {
    const handler = mod?.[method];
    if (typeof handler !== "function") continue;
    // The route handlers are `(request, { params }) => Response`.
    const wrapped = async (c: Context) => {
      const params = Promise.resolve({ ...(c.req.param() as Record<string, string>) });
      const res = await (handler as RouteHandler)(c.req.raw, { params });
      return res;
    };
    app.on(method, route, wrapped);
    mounted++;
  }
}

/**
 * Any error a handler lets escape still gets the standard JSON envelope with
 * a generic message. Hono's built-in fallback returns a plain-text 500, and
 * echoing raw exception text would risk provider URLs, tokens and SQL.
 */
app.onError((error, c) => jsonError(error, c.req.header("x-request-id") ?? "unhandled"));

export default app;

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT || 3001);
  // `serve` is awaited so the process stays alive.
  serve({ fetch: app.fetch, port }, () => {
    console.log(`[foodguard-backend] listening on http://localhost:${port} (${mounted} routes mounted)`);
  });
}
