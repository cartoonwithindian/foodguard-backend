import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import type { NutritionFacts, ProductInfo } from "@/types/domain";
import { getStore } from "@/lib/store";
import { POST, GET } from "@/app/api/products/[id]/alternatives/route";
import { findAlternativesForProduct } from "@/services/alternative-engine.service";



function nutrition(nutrients: Record<string, number>): NutritionFacts {
  return {
    basis: "PER_100G",
    nutrients: Object.fromEntries(
      Object.entries(nutrients).map(([k, value]) => [
        k,
        { value, unit: k === "sodium" || k === "salt" ? "mg" : "g", confidence: 0.9 },
      ]),
    ),
  };
}

function product(name: string, barcode: string, ingredientsRaw: string): ProductInfo {
  return {
    id: `p-${barcode}`,
    name,
    brand: "TestBrand",
    category: "food",
    barcode,
    ingredientsRaw,
    country: "IN",
    servingSize: null,
    imageUrl: null,
    ingredientsNormalized: [],
    source: "test",
    sourceUrl: null,
    verified: false,
    productDataConfidence: 0.8,
    isDemo: false,
  };
}

async function saveProduct(name: string, barcode: string, ingredientsRaw: string, nutr: NutritionFacts) {
  const store = getStore();
  const saved = await store.saveProductFromProvider({
    product: product(name, barcode, ingredientsRaw),
    nutrition: nutr,
    source: "test",
  });
  if (!saved.product) throw new Error("saveProductFromProvider returned no product");
  return saved.product;
}

function postRequest(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/products/${id}/alternatives`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

// Demo seed products are stored under generated ids (prod-N), so resolve the
// id by barcode once.
let DEMO_PRODUCT_ID = "";
beforeAll(async () => {
  process.env.DATABASE_URL = ""; // force in-memory (mock) store
  const demo = await getStore().getProductByBarcode("8901000000001");
  DEMO_PRODUCT_ID = demo?.id ?? "8901000000001";
});

describe("POST /api/products/:id/alternatives (Phase 5 pipeline)", () => {
  it("1. existing alternatives API still works (GET + POST happy path)", async () => {
    const getRes = await GET(new NextRequest("http://localhost/api/products/x/alternatives"), params(DEMO_PRODUCT_ID));
    const getBody = await getRes.json();
    expect(getRes.status).toBe(200);
    expect(getBody.success).toBe(true);
    expect(Array.isArray(getBody.data.alternatives)).toBe(true);
    expect(getBody.data.product.id).toBe(DEMO_PRODUCT_ID);

    const postRes = await POST(postRequest(DEMO_PRODUCT_ID, {}), params(DEMO_PRODUCT_ID));
    const postBody = await postRes.json();
    expect(postRes.status).toBe(200);
    expect(postBody.success).toBe(true);
    expect(Array.isArray(postBody.data.alternatives)).toBe(true);
    expect(postBody.data.currentProduct.id).toBe(DEMO_PRODUCT_ID);
  });

  it("2. HIGH_SODIUM produces LOWER_SODIUM characteristic", async () => {
    const saved = await saveProduct("Saltys Chips", "5000000000001", "Ingredients: Potato, Salt.", nutrition({ sodium: 900 }));
    const res = await POST(postRequest(saved.id, {}), params(saved.id));
    const body = await res.json();
    expect(res.status).toBe(200);
    const keys = body.data.alternativeCharacteristics.map((c: { key: string }) => c.key);
    expect(keys).toContain("LOWER_SODIUM");
    const sodium = body.data.alternativeCharacteristics.find((c: { key: string }) => c.key === "LOWER_SODIUM");
    expect(sodium.issueKey).toBe("sodium");
    expect(sodium.label).toBe("Lower sodium");
  });

  it("3. HIGH_ADDED_SUGAR produces LOWER_ADDED_SUGAR when explicit added sugar exists", async () => {
    const saved = await saveProduct("Sweet Corn Pops", "5000000000002", "Ingredients: Corn, Sugar, Salt.", nutrition({ addedSugars: 30 }));
    const res = await POST(postRequest(saved.id, {}), params(saved.id));
    const body = await res.json();
    expect(res.status).toBe(200);
    const keys = body.data.alternativeCharacteristics.map((c: { key: string }) => c.key);
    expect(keys).toContain("LOWER_ADDED_SUGAR");
  });

  it("4. palm oil produces PALM_OIL_FREE characteristic", async () => {
    const saved = await saveProduct("Crispy Flakes", "5000000000003", "Ingredients: Corn, Palm Oil, Salt.", nutrition({ calories: 100 }));
    const res = await POST(postRequest(saved.id, {}), params(saved.id));
    const body = await res.json();
    expect(res.status).toBe(200);
    const keys = body.data.alternativeCharacteristics.map((c: { key: string }) => c.key);
    expect(keys).toContain("PALM_OIL_FREE");
  });

  it("5. multiple characteristics are returned", async () => {
    const res = await GET(new NextRequest("http://localhost/api/products/x/alternatives"), params(DEMO_PRODUCT_ID));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.alternativeCharacteristics.length).toBeGreaterThanOrEqual(3);
    const keys = body.data.alternativeCharacteristics.map((c: { key: string }) => c.key);
    expect(keys).toContain("LOWER_SALT");
    expect(keys).toContain("LOWER_SATURATED_FAT");
  });

  it("6. unsupported characteristics are not falsely presented as validated", async () => {
    const source = await saveProduct("Maida Crackers", "5000000000004", "Ingredients: Maida, Salt.", nutrition({ sodium: 800 }));
    await saveProduct("Rice Crackers Lite", "5000000000005", "Ingredients: Rice Flour, Salt.", nutrition({ sodium: 400 }));

    const res = await POST(postRequest(source.id, {}), params(source.id));
    const body = await res.json();
    expect(res.status).toBe(200);

    const keys = body.data.alternativeCharacteristics.map((c: { key: string }) => c.key);
    expect(keys).toContain("WHOLE_GRAIN");
    expect(body.data.alternativeCriteria.unsupported).toContain("WHOLE_GRAIN");

    const names = body.data.alternatives.map((a: { product: { name: string } }) => a.product.name);
    expect(names).toContain("Rice Crackers Lite");
    for (const alt of body.data.alternatives) {
      for (const reason of alt.reasons) {
        expect(reason.detail.toLowerCase()).not.toContain("whole grain");
      }
    }
    const sodiumReason = body.data.alternatives
      .flatMap((a: { reasons: Array<{ detail: string }> }) => a.reasons)
      .some((r: { detail: string }) => r.detail === "Lower sodium than the scanned product.");
    expect(sodiumReason).toBe(true);
  });

  it("7. candidate reasons come from validated criteria only", async () => {
    const source = await saveProduct("Crispy Chips", "5000000000006", "Ingredients: Potato, Salt.", nutrition({ sodium: 800 }));
    await saveProduct("Light Chips", "5000000000007", "Ingredients: Potato, Salt.", nutrition({ sodium: 400 }));
    await saveProduct("Heavy Chips", "5000000000008", "Ingredients: Potato, Salt.", nutrition({ sodium: 900 }));

    const res = await POST(postRequest(source.id, {}), params(source.id));
    const body = await res.json();
    expect(res.status).toBe(200);

    const names = body.data.alternatives.map((a: { product: { name: string } }) => a.product.name);
    expect(names).toContain("Light Chips");
    expect(names).not.toContain("Heavy Chips"); // not lower sodium → rejected by criteria gate

    const light = body.data.alternatives.find((a: { product: { name: string } }) => a.product.name === "Light Chips");
    expect(light.reasons.some((r: { factor: string; detail: string }) => r.factor === "better_nutrition" && r.detail === "Lower sodium than the scanned product.")).toBe(true);
  });

  it("8. existing goals continue to work", async () => {
    const res = await POST(postRequest(DEMO_PRODUCT_ID, { goals: ["lower_sodium"] }), params(DEMO_PRODUCT_ID));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.preferences.goals).toEqual(["lower_sodium"]);
    expect(Array.isArray(body.data.alternatives)).toBe(true);
  });

  it("9. existing avoidIngredients continue to work", async () => {
    const source = await saveProduct("Plain Chips", "5000000000009", "Ingredients: Potato, Salt.", nutrition({ sodium: 800 }));
    await saveProduct("Veg Chips", "5000000000010", "Ingredients: Potato, Salt.", nutrition({ sodium: 400 }));
    await saveProduct("Palm Chips", "5000000000011", "Ingredients: Potato, Palm Oil, Salt.", nutrition({ sodium: 400 }));

    const res = await POST(postRequest(source.id, { avoidIngredients: ["palm oil"] }), params(source.id));
    const body = await res.json();
    expect(res.status).toBe(200);
    const names = body.data.alternatives.map((a: { product: { name: string } }) => a.product.name);
    expect(names).toContain("Veg Chips");
    expect(names).not.toContain("Palm Chips"); // avoided ingredient → rejected
  });

  it("10. existing personalization continues to work (goals + avoidIngredients together; allergens still hard-reject)", async () => {
    const source = await saveProduct("Spicy Chips", "5000000000012", "Ingredients: Potato, Salt.", nutrition({ sodium: 800 }));
    const res = await POST(
      postRequest(source.id, { goals: ["lower_sodium"], avoidIngredients: ["palm oil"] }),
      params(source.id),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.preferences.goals).toEqual(["lower_sodium"]);
    expect(body.data.preferences.avoidIngredients).toEqual(["palm oil"]);
    const names = body.data.alternatives.map((a: { product: { name: string } }) => a.product.name);
    expect(names).toContain("Veg Chips");
    expect(names).not.toContain("Palm Chips");

    // Engine-level allergen personalization still rejects candidates.
    await saveProduct("Milk Chips", "5000000000013", "Ingredients: Potato, Milk, Salt.", nutrition({ sodium: 400 }));
    const pipeline = await findAlternativesForProduct({
      product: (await saveProduct("Allergy Source Chips", "5000000000014", "Ingredients: Potato, Salt.", nutrition({ sodium: 800 }))),
      nutrition: nutrition({ sodium: 800 }),
      userPreferences: { allergies: ["milk"] },
    });
    const pipelineNames = pipeline.alternatives.map((a) => a.product.name);
    expect(pipelineNames).not.toContain("Milk Chips");
  });

  it("11. empty characteristics do not break the API", async () => {
    const saved = await saveProduct("Plain Rice", "5000000000015", "Ingredients: Rice.", nutrition({ calories: 100, protein: 5 }));
    const res = await POST(postRequest(saved.id, {}), params(saved.id));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.alternativeCharacteristics).toEqual([]);
    expect(body.data.alternativeCriteria.preferredCharacteristics).toEqual([]);
    expect(Array.isArray(body.data.alternatives)).toBe(true);
  });

  it("12. no qualifying alternatives does not break the API", async () => {
    const saved = await saveProduct("Kulfi Delight", "5000000000016", "Ingredients: Milk, Sugar.", nutrition({ sodium: 900 }));
    const res = await POST(postRequest(saved.id, {}), params(saved.id));
    const body = await res.json();
    expect(res.status).toBe(200);
    const keys = body.data.alternativeCharacteristics.map((c: { key: string }) => c.key);
    expect(keys).toContain("LOWER_SODIUM");
    expect(body.data.alternatives).toEqual([]);
  });
});