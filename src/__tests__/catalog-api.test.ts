import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET as getCatalog } from "@/app/api/products/route";

describe("GET /api/products (catalog)", () => {
  it("returns a paged catalog envelope with metadata", async () => {
    const response = await getCatalog(new NextRequest("http://localhost/api/products?limit=24"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.products)).toBe(true);
    expect(body.data.limit).toBe(24);
    expect(body.data.page).toBe(1);
    expect(typeof body.data.hasMore).toBe("boolean");
    expect(Array.isArray(body.data.categories)).toBe(true);
  });

  it("supports search, category, and sort query params", async () => {
    const response = await getCatalog(
      new NextRequest(
        "http://localhost/api/products?search=amul&category=dairy&sort=name_asc&limit=5",
      ),
    );
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.meta.query).toBe("amul");
    expect(body.meta.category).toBe("dairy");
    expect(body.meta.sort).toBe("name_asc");
  });

  it("validates the sort key", async () => {
    const response = await getCatalog(
      new NextRequest("http://localhost/api/products?sort=bogus"),
    );
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("clamps the limit to 50", async () => {
    const response = await getCatalog(
      new NextRequest("http://localhost/api/products?limit=999"),
    );
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.limit).toBe(50);
  });

  it("never ships more rows than requested even with a large page", async () => {
    const response = await getCatalog(
      new NextRequest("http://localhost/api/products?limit=50&page=1"),
    );
    const body = await response.json();
    expect(body.data.products.length).toBeLessThanOrEqual(50);
  });
});