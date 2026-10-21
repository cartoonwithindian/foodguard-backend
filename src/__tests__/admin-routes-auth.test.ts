import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as dashboard } from "@/app/api/admin/dashboard/route";
import { GET as data } from "@/app/api/admin/data/route";
import { POST as createEvidence } from "@/app/api/admin/evidence/route";
import { GET as ingredientsGet, POST as ingredientsPost } from "@/app/api/admin/ingredients/route";
import { POST as productImage } from "@/app/api/admin/product-image/route";
import { GET as products } from "@/app/api/admin/products/route";
import { GET as reviews } from "@/app/api/admin/reviews/route";
import { GET as resolveGet, POST as resolvePost } from "@/app/api/admin/reviews/[id]/resolve/route";
import { GET as users } from "@/app/api/admin/users/route";

type Handler = (request: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

const params = { params: Promise.resolve({ id: "review-1" }) };
const handlers: Array<[string, Handler]> = [
  ["GET /api/admin/dashboard", dashboard as Handler],
  ["GET /api/admin/data", data as Handler],
  ["POST /api/admin/evidence", createEvidence as Handler],
  ["GET /api/admin/ingredients", ingredientsGet as Handler],
  ["POST /api/admin/ingredients", ingredientsPost as Handler],
  ["POST /api/admin/product-image", productImage as Handler],
  ["GET /api/admin/products", products as Handler],
  ["GET /api/admin/reviews", reviews as Handler],
  ["GET /api/admin/reviews/:id/resolve", resolveGet as Handler],
  ["POST /api/admin/reviews/:id/resolve", resolvePost as Handler],
  ["GET /api/admin/users", users as Handler],
];

describe("admin routes reject unauthenticated requests", () => {
  for (const [label, handler] of handlers) {
    it(label, async () => {
      const response = await handler(
        new NextRequest(`http://localhost${label.split(" ")[1]}`, {
          method: label.split(" ")[0],
          headers: { "content-type": "application/json" },
          body: label.startsWith("POST") ? "{}" : undefined,
        }),
        params,
      );
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });
  }
});
