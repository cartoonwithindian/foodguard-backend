import type { IngredientRecord } from "@/types/domain";
import { AppError, ErrorCodes } from "@/lib/errors";
import { getStore } from "@/lib/store";
import { getEvidenceForIngredient } from "@/lib/evidence";

export async function adminStats() {
  const store = getStore();
  const [stats, unknown, users, products] = await Promise.all([
    store.getAdminStats(),
    store.listUnknownIngredients("pending"),
    store.listUsers(),
    store.searchProducts(""),
  ]);
  return {
    ...stats,
    pendingUnknownIngredients: unknown.length,
    userCount: users.length,
    productCount: products.length,
  };
}

export async function adminListUnknownIngredients() {
  const store = getStore();
  return store.listUnknownIngredients("pending");
}

export async function adminResolveUnknownIngredient(
  adminId: string,
  id: string,
  status: "resolved" | "dismissed",
  resolvedIngredientId?: string,
): Promise<void> {
  const store = getStore();
  await store.resolveUnknownIngredient(id, status, resolvedIngredientId);
  await store.logAdminAction({
    adminId,
    action: `resolve_unknown_ingredient`,
    entity: "UnknownIngredient",
    entityId: id,
    detail: status,
  });
}

export async function adminUpsertIngredient(adminId: string, record: IngredientRecord): Promise<void> {
  const store = getStore();
  await store.upsertIngredient(record);
  await store.logAdminAction({
    adminId,
    action: "upsert_ingredient",
    entity: "Ingredient",
    entityId: record.id,
    detail: record.canonicalName,
  });
}

export async function adminListIngredients(): Promise<IngredientRecord[]> {
  return getStore().listIngredients();
}

export async function adminAddEvidence(adminId: string, input: {
  ingredientId: string;
  title: string;
  organization: string;
  url?: string;
  sourceType: string;
  publicationDate?: string;
  evidenceLevel: string;
  summary: string;
}) {
  const store = getStore();
  void (await getEvidenceForIngredient(input.ingredientId));
  await store.logAdminAction({
    adminId,
    action: "add_evidence",
    entity: "Evidence",
    entityId: input.ingredientId,
    detail: input.title,
  });
  return { ok: true };
}

export async function adminListProducts(query: string) {
  const store = getStore();
  const results = await store.searchProducts(query);
  return results.map((r) => ({
    id: r.product.id,
    barcode: r.product.barcode,
    name: r.product.name,
    brand: r.product.brand,
    category: r.product.category,
    verified: r.product.verified,
    isDemo: r.product.isDemo,
    source: r.product.source,
  }));
}

export async function adminListUsers() {
  const store = getStore();
  const users = await store.listUsers();
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    language: u.language,
    createdAt: u.createdAt,
  }));
}

export function throwIfNotAdmin(role: string): void {
  if (role !== "ADMIN") {
    throw new AppError(ErrorCodes.FORBIDDEN, "Admin access required", 403);
  }
}
