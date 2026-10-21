import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET as getCatalog } from "@/app/api/products/route";
import { listCatalog } from "@/services/catalog.service";
import { normalizeProductImageUrl } from "@/lib/store/catalog";

describe("catalog photos-only filter", () => {
  it("never returns a product without an image when hasImage=true", async () => {
    const data = await listCatalog({ limit: 50, offset: 0, hasImage: true });
    expect(data.products.length).toBeGreaterThan(0);
    for (const product of data.products) {
      expect(product.imageUrl).toBeTruthy();
    }
  });

  it("returns a strict subset of the unfiltered catalog", async () => {
    const withImages = await listCatalog({ limit: 50, offset: 0, hasImage: true });
    const all = await listCatalog({ limit: 50, offset: 0 });
    expect(withImages.total).toBeLessThan(all.total);
    // A page never exceeds the filtered total, even when photos are scarce.
    expect(withImages.products.length).toBeLessThanOrEqual(Math.min(50, withImages.total));
  });

  it("paginates only photo-backed products without empty pages", async () => {
    const page1 = await listCatalog({ limit: 10, offset: 0, hasImage: true });
    const page2 = await listCatalog({ limit: 10, offset: 10, hasImage: true });

    expect(page1.products.length).toBe(10);
    expect(page2.products.length).toBeGreaterThan(0);

    const ids1 = new Set(page1.products.map((p) => p.id));
    const overlap = page2.products.filter((p) => ids1.has(p.id));
    expect(overlap).toHaveLength(0);
  });

  it("honours search together with the filter", async () => {
    const data = await listCatalog({ search: "amul", limit: 25, hasImage: true });
    for (const product of data.products) {
      expect(product.name.toLowerCase()).toContain("amul");
      expect(product.imageUrl).toBeTruthy();
    }
  });

  it("honours category together with the filter", async () => {
    const data = await listCatalog({ category: "dairy", limit: 25, hasImage: true });
    for (const product of data.products) {
      expect(product.category).toBe("dairy");
      expect(product.imageUrl).toBeTruthy();
    }
  });
});

describe("GET /api/products hasImage param", () => {
  it("filters photo-backed products via the query param", async () => {
    const response = await getCatalog(
      new NextRequest("http://localhost/api/products?limit=25&hasImage=true"),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.products.length).toBeGreaterThan(0);
    for (const product of body.data.products) {
      expect(product.imageUrl).toBeTruthy();
    }
  });

  it("ignores hasImage=false and keeps the unfiltered behaviour", async () => {
    const unfiltered = await getCatalog(new NextRequest("http://localhost/api/products?limit=5"));
    const explicit = await getCatalog(
      new NextRequest("http://localhost/api/products?limit=5&hasImage=false"),
    );
    const a = await unfiltered.json();
    const b = await explicit.json();
    expect(b.data.total).toBe(a.data.total);
  });
});

describe("normalizeProductImageUrl placeholder rejection", () => {
  it("rejects generic placeholder artwork", () => {
    expect(
      normalizeProductImageUrl("https://souqalbuhair.com/wp-content/uploads/woocommerce-placeholder-450x450.png"),
    ).toBeNull();
    expect(normalizeProductImageUrl("https://cdn.example.com/no-image-placeholder.png")).toBeNull();
    expect(normalizeProductImageUrl("https://cdn.example.com/blank.jpg")).toBeNull();
    expect(normalizeProductImageUrl("https://cdn.example.com/img/1x1.png")).toBeNull();
  });

  it("keeps real product photography", () => {
    expect(
      normalizeProductImageUrl("https://www.mustakshif.com/public/uploads/products/product_8904288611.jpg"),
    ).toBe("https://www.mustakshif.com/public/uploads/products/product_8904288611.jpg");
  });

  it("still rejects non-http and empty values", () => {
    expect(normalizeProductImageUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeProductImageUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(normalizeProductImageUrl("   ")).toBeNull();
    expect(normalizeProductImageUrl(null)).toBeNull();
  });
});