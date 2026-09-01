export type ToolResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type SearchProductToolArgs = { query: string; category?: string };
export type SearchProductHit = { id: string; name: string; brand: string | null; barcode: string; category: string };

export type ProductDetailsToolArgs = { product_id?: string; barcode?: string };
export type ProductDetails = {
  id: string;
  name: string;
  brand: string | null;
  barcode: string;
  category: string;
  ingredientsRaw: string;
  source: string;
  verified: boolean;
  productDataConfidence: number;
};

export type ProductAnalysisSummary = {
  productId: string;
  name: string;
  brand: string | null;
  assessment: string;
  assessmentDescription: string;
  score: number | null;
  confidence: number;
  positivePoints: string[];
  attentionPoints: string[];
  needsReview: boolean;
  regulatoryStatus: string | null;
};

export type IngredientInfoToolArgs = { name: string };
export type IngredientInfo = {
  raw: string;
  normalized: string | null;
  canonicalName: string | null;
  insCode: string | null;
  category: string | null;
  function: string | null;
  assessment: string | null;
  evidence: Array<{ organization: string; summary: string; url?: string | null }>;
};

export type ScanHistoryToolArgs = Record<string, never>;
export type ScanHistoryEntry = {
  productId: string | null;
  name: string;
  brand: string | null;
  assessment: string;
  score: number | null;
  scannedAt: string;
  source: string;
};

export type CompareProductsToolArgs = { product_a?: string; product_b?: string };
export type ProductComparison = {
  product_a: ProductDetails | null;
  product_b: ProductDetails | null;
  rows: Array<{ field: string; a: string; b: string }>;
  concern_a: string;
  concern_b: string;
};