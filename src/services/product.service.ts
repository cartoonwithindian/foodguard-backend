import { AppError, ErrorCodes } from "@/lib/errors";
import { getStore } from "@/lib/store";
import { lookupProductByBarcode } from "@/lib/product-provider";
import { normalizeIngredient } from "@/lib/ingredients/normalize";
import { parseIngredientText } from "@/lib/ingredients/parse";
import { getEvidenceForIngredient, evidenceStatusFor } from "@/lib/evidence";
import { ingredientIndex } from "@/lib/ingredients";
import { searchIndianProducts } from "@/lib/india-dataset";
import { logger } from "@/lib/logger";
import type { ProductSearchResult } from "@/lib/store/types";

const ASSESSMENTS_BY_NAME = new Map<string, string>(
  ingredientIndex.all().map((i) => [i.canonicalName, i.assessment]),
);

export async function searchProducts(query: string, category: string = "all") {
  const store = getStore();
  const storeResults = await store.searchProducts(query, category as never);
  const results: ProductSearchResult[] = [...storeResults];

  // Merge name search over the bundled India dataset (18k+ products), which
  // the store does not index. Dataset hits rank below exact store matches.
  const trimmed = query.trim();
  if (trimmed) {
    const datasetHits = searchIndianProducts(trimmed, 10).map(({ product, score }) => ({
      product,
      score,
      rank: score,
      matchedOn: ["name"] as string[],
    }));
    const knownBarcodes = new Set(storeResults.map((r) => r.product.barcode));
    for (const hit of datasetHits) {
      if (knownBarcodes.has(hit.product.barcode)) continue;
      results.push(hit);
    }
  }

  logger.debug("product_search_completed", {
    query: trimmed,
    storeHits: storeResults.length,
    datasetMerged: results.length - storeResults.length,
    total: results.length,
    withBarcode: results.filter((r) => r.product.barcode).length,
  });

  return {
    products: results.map((r) => ({
      id: r.product.id,
      name: r.product.name,
      brand: r.product.brand ?? "",
      category: r.product.category,
      barcode: r.product.barcode,
      score: r.rank ?? 0,
      ingredients: r.product.ingredientsRaw,
      matchedOn: r.matchedOn,
      isDemo: r.product.isDemo,
      verified: r.product.verified,
    })),
    total: results.length,
  };
}

export async function getProductDetail(id: string) {
  const store = getStore();
  const product = await store.getProductById(id);
  if (!product) throw new AppError(ErrorCodes.PRODUCT_NOT_FOUND, "Product could not be found", 404);
  return product;
}

export async function compareProducts(productIds: string[]) {
  if (productIds.length < 2 || productIds.length > 5) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, "Provide between 2 and 5 product IDs");
  }
  const store = getStore();
  const rows = await Promise.all(
    productIds.map(async (id) => {
      const product = await store.getProductById(id);
      if (!product) throw new AppError(ErrorCodes.PRODUCT_NOT_FOUND, `Product ${id} not found`, 404);
      const nutrition = await store.getNutritionForProduct(product.id);
      const { ingredients } = parseIngredientText(product.ingredientsRaw);
      const normalized = ingredients
        .map((i) => normalizeIngredient(i))
        .filter((n) => n.matched)
        .map((n) => n.canonicalName as string);
      return { product, nutrition, normalizedIngredients: normalized };
    }),
  );

  const concernsOf = (normalized: string[]) =>
    normalized.filter((name) => ["potentially_concerning", "noteworthy", "allergen"].includes(assessmentOf(name) ?? ""));

  return rows.map((row, index) => {
    const other = rows.filter((_, i) => i !== index);
    const whyBetter = other.map((o) => {
      const reasons: string[] = [];
      const mySodium = row.nutrition?.nutrients.sodium?.value;
      const otherSodium = o.nutrition?.nutrients.sodium?.value;
      if (mySodium !== undefined && otherSodium !== undefined && mySodium < otherSodium) {
        reasons.push(`Lower sodium (${mySodium}mg vs ${otherSodium}mg per 100g)`);
      }
      const mySat = row.nutrition?.nutrients.saturatedFat?.value;
      const otherSat = o.nutrition?.nutrients.saturatedFat?.value;
      if (mySat !== undefined && otherSat !== undefined && mySat < otherSat) {
        reasons.push(`Lower saturated fat (${mySat}g vs ${otherSat}g per 100g)`);
      }
      const mySugar = row.nutrition?.nutrients.sugars?.value;
      const otherSugar = o.nutrition?.nutrients.sugars?.value;
      if (mySugar !== undefined && otherSugar !== undefined && mySugar < otherSugar) {
        reasons.push(`Lower sugar (${mySugar}g vs ${otherSugar}g per 100g)`);
      }
      if (concernsOf(row.normalizedIngredients).length < concernsOf(o.normalizedIngredients).length) {
        reasons.push("Fewer concerning ingredients");
      }
      return reasons;
    });

    return {
      product: row.product,
      ingredients: row.normalizedIngredients,
      concerningIngredients: concernsOf(row.normalizedIngredients),
      nutrition: row.nutrition,
      whyBetter: whyBetter.flat(),
      allergens: [],
    };
  });
}

function assessmentOf(name: string): string | null {
  return ASSESSMENTS_BY_NAME.get(name) ?? null;
}

export async function nutritionDetail(barcode: string) {
  const { product, nutrition: productNutrition } = await lookupProductByBarcode(barcode);
  if (!product) throw new AppError(ErrorCodes.PRODUCT_NOT_FOUND, "Product could not be found", 404);
  const nutrition =
    productNutrition ?? (await getStore().getNutritionForProduct(product.id));
  if (!nutrition) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, "No nutrition data available for this product", 404);
  }
  return { product, nutrition };
}

export async function evidenceDetail(barcode: string) {
  const store = getStore();
  let product = await store.getProductByBarcode(barcode);
  if (!product) {
    // The seed store only holds ~20 demo products; resolve via the full
    // lookup chain (India dataset, local, external providers) which also
    // persists the product into the current worker's store.
    const lookup = await lookupProductByBarcode(barcode);
    if (lookup.product) {
      product = await store.getProductByBarcode(barcode);
    }
  }
  if (!product) throw new AppError(ErrorCodes.PRODUCT_NOT_FOUND, "Product could not be found", 404);
  const { ingredients } = parseIngredientText(product.ingredientsRaw);
  const normalized = ingredients
    .map((i) => normalizeIngredient(i))
    .filter((n) => n.matched && n.canonicalName);

  const perIngredient = await Promise.all(
    normalized.slice(0, 12).map(async (n) => {
      const record = await store.getIngredientByCanonical(n.canonicalName as string);
      const evidence = record ? await getEvidenceForIngredient(record.id) : [];
      return {
        ingredientId: n.canonicalName,
        name: n.canonicalName,
        evidence,
      };
    }),
  );

  const allEvidence = perIngredient.flatMap((e) => e.evidence);
  return {
    product,
    evidence: allEvidence,
    perIngredient,
    evidenceStatus: evidenceStatusFor(allEvidence, 0.7),
  };
}
