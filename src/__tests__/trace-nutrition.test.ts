import { describe, it, afterAll, vi } from "vitest";
import { runAnalysis } from "@/services/analysis.service";
import { getStore } from "@/lib/store";
import { lookupProductByBarcode } from "@/lib/product-provider";
import { resetProductProviderForTesting } from "@/lib/product-provider";

// Force mock mode for AI to prevent real API calls during tests
const { savedAIEnv } = vi.hoisted(() => {
  const savedAIEnv = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_API_KEY: process.env.AI_API_KEY,
  };
  process.env.AI_PROVIDER = "mock";
  process.env.AI_API_KEY = "";
  return { savedAIEnv };
});

afterAll(() => {
  process.env.AI_PROVIDER = savedAIEnv.AI_PROVIDER ?? "mock";
  process.env.AI_API_KEY = savedAIEnv.AI_API_KEY ?? "";
});

describe("trace nutrition for 8901000000001", () => {
  it("traces every stage", async () => {
    process.env.DATABASE_URL = "";
    resetProductProviderForTesting();
    const barcode = "8901000000001";

    console.log("\n=== STAGE 1: Product Provider Lookup ===");
    const lookup = await lookupProductByBarcode(barcode);
    console.log("source:", lookup.source);
    console.log("product found:", !!lookup.product);
    if (lookup.product) {
      console.log("name:", lookup.product.name);
      console.log("id:", lookup.product.id);
      console.log("isDemo:", lookup.product.isDemo);
    }

    console.log("\n=== STAGE 2: Nutrition from Provider ===");
    console.log("nutrition from lookup:", !!lookup.nutrition);
    if (lookup.nutrition) {
      console.log("basis:", lookup.nutrition.basis);
      console.log("nutrient keys:", Object.keys(lookup.nutrition.nutrients));
      for (const [k, v] of Object.entries(lookup.nutrition.nutrients)) {
        console.log(" ", k, ":", v.value, v.unit);
      }
    }

    console.log("\n=== STAGE 3: Store Nutrition Lookup ===");
    const store = getStore();
    if (lookup.product) {
      const storeNut = await store.getNutritionForProduct(lookup.product.id);
      console.log("store nutrition found:", !!storeNut);
    }

    console.log("\n=== STAGE 4: Full Analysis ===");
    const result = await runAnalysis({
      barcode,
      language: "en",
      skipAlternatives: true,
      skipPersonalization: true,
    });
    console.log("frontend.nutrition:", JSON.stringify(result.frontend.nutrition));
    console.log("meta.nutrition null:", result.meta.nutrition === null);
    console.log("warnings:", result.meta.warnings);
  });
});
