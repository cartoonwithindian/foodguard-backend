import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getStore } from "@/lib/store";
import { signToken, type SessionUser } from "@/lib/auth";
import { POST as updateProductImage } from "@/app/api/admin/product-image/route";
import { POST as listProductImages } from "@/app/api/product-images/route";
import { POST as findAlternatives } from "@/app/api/products/[id]/alternatives/route";

async function adminToken(): Promise<string> {
  const store = getStore();
  const user = await store.createUser({
    email: `route-admin-${Date.now()}-${Math.random().toString(36).slice(2)}@test.invalid`,
    name: "Route Admin",
    passwordHash: null,
    role: "ADMIN",
  });
  const session: SessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: "ADMIN",
    language: "EN",
  };
  return signToken(session);
}

function jsonRequest(path: string, body: string, token?: string): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new NextRequest(`http://localhost${path}`, { method: "POST", headers, body });
}

describe("admin/product-image validation", () => {
  it("rejects a non-http(s) image URL", async () => {
    const token = await adminToken();
    const response = await updateProductImage(
      jsonRequest("/api/admin/product-image", JSON.stringify({ productId: "p1", imageUrl: "javascript:alert(1)" }), token),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 (not 500) for malformed JSON", async () => {
    const token = await adminToken();
    const response = await updateProductImage(
      jsonRequest("/api/admin/product-image", "{", token),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("accepts a valid http(s) URL", async () => {
    const store = getStore();
    const saved = await store.saveProductFromProvider({
      product: {
        id: "",
        name: "Image Product",
        brand: "Test",
        category: "food",
        barcode: `img-${Date.now()}`,
        ingredientsRaw: "Water",
        ingredientsNormalized: [],
        country: "IN",
        servingSize: null,
        imageUrl: null,
        source: "test",
        sourceUrl: null,
        verified: false,
        productDataConfidence: 0.5,
        isDemo: false,
      },
      nutrition: null,
      source: "test",
    });
    const token = await adminToken();
    const response = await updateProductImage(
      jsonRequest(
        "/api/admin/product-image",
        JSON.stringify({ productId: saved.product!.id, imageUrl: "https://example.com/img.jpg" }),
        token,
      ),
    );
    expect(response.status).toBe(200);
  });
});

describe("product-images POST bounds", () => {
  it("rejects more than 50 names", async () => {
    const response = await listProductImages(
      jsonRequest(
        "/api/product-images",
        JSON.stringify({ names: Array.from({ length: 51 }, (_, i) => `Product ${i}`) }),
      ),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects non-string / oversized names", async () => {
    const response = await listProductImages(
      jsonRequest("/api/product-images", JSON.stringify({ names: ["ok", 42] })),
    );
    expect(response.status).toBe(400);
  });
});

describe("alternatives preference validation", () => {
  it("rejects an invalid preference payload instead of silently ignoring it", async () => {
    const store = getStore();
    const saved = await store.saveProductFromProvider({
      product: {
        id: "",
        name: "Alternatives Base",
        brand: "Test",
        category: "food",
        barcode: `alt-${Date.now()}`,
        ingredientsRaw: "Water, Salt",
        ingredientsNormalized: ["water", "salt"],
        country: "IN",
        servingSize: null,
        imageUrl: null,
        source: "test",
        sourceUrl: null,
        verified: false,
        productDataConfidence: 0.5,
        isDemo: false,
      },
      nutrition: null,
      source: "test",
    });
    const id = saved.product!.id;
    const response = await findAlternatives(
      jsonRequest(`/api/products/${id}/alternatives`, JSON.stringify({ goals: ["not_a_goal"] })),
      { params: Promise.resolve({ id }) },
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });
});
