import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { serve } from "@hono/node-server";
import type { Context } from "hono";

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

const HTTP_METHODS = ["GET", "POST"] as const;
type Method = (typeof HTTP_METHODS)[number];

const app = new Hono();

app.use(
  "*",
  cors({
    origin: (origin) => origin || "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "x-forwarded-for"],
    exposeHeaders: ["Content-Length"],
    maxAge: 86400,
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

export default app;

if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT || 3001);
  // `serve` is awaited so the process stays alive.
  serve({ fetch: app.fetch, port }, () => {
    console.log(`[foodguard-backend] listening on http://localhost:${port} (${mounted} routes mounted)`);
  });
}
