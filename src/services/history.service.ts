import type { FrontendAnalysisResult } from "@/types/domain";
import { AppError, ErrorCodes } from "@/lib/errors";
import { getStore } from "@/lib/store";

export async function addHistoryEntry(
  userId: string,
  input: { productId?: string; assessmentSnapshot: FrontendAnalysisResult; source?: string },
) {
  const store = getStore();
  return store.addHistoryEntry(userId, {
    productId: input.productId ?? null,
    assessmentSnapshot: input.assessmentSnapshot,
    source: input.source ?? "manual",
  });
}

export async function listHistory(userId: string) {
  const store = getStore();
  const entries = await store.listHistory(userId);
  return entries.map((entry) => {
    const snapshot = entry.assessmentSnapshot as FrontendAnalysisResult;
    return {
      id: entry.id,
      productId: entry.productId,
      name: snapshot.name,
      brand: snapshot.brand,
      category: snapshot.category,
      barcode: snapshot.barcode,
      scannedAt: entry.scannedAt,
      assessment: snapshot.assessment,
      score: snapshot.score,
      analysis: snapshot,
      source: entry.source,
    };
  });
}

export async function deleteHistoryEntry(userId: string, entryId: string): Promise<void> {
  const store = getStore();
  const deleted = await store.deleteHistoryEntry(userId, entryId);
  if (!deleted) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, "History entry not found", 404);
  }
}
