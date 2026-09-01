import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  resolveProductByBarcode,
  searchProductCandidates,
  resolveProductByPhotoLocalFirst,
} from "@/lib/resolve-product";
import {
  getProductCache,
  setProductCacheForTesting,
  PRODUCT_FRESH_MS,
} from "@/lib/cache/product-cache";
import { MemoryStorageAdapter, setStorageForTesting, resetStorageForTesting } from "@/lib/offline/storage";
import type { IdentifiedProduct } from "@/types/identification";

const foundProduct = () => ({
  success: true,
  data: {
    product: {
      id: "p1",
      barcode: "8901491100519",
      name: "Kurkure Masala Munch",
      brand: "Kurkure",
      category: "food",
      imageUrl: null,
      ingredientsRaw: "Corn Flour, Palm Oil, Salt, Sugar",
      verified: false,
      isDemo: false,
    },
    nutrition: null,
    source: "indian_dataset",
    confidence: 0.9,
  },
});

const seedProduct = (): IdentifiedProduct => ({
  id: "p1",
  barcode: "8901491100519",
  name: "Kurkure Masala Munch",
  brand: "Kurkure",
  category: "food",
  source: "barcode",
  confidence: 0.9,
});

function goOffline(): void {
  vi.stubGlobal("navigator", { onLine: false });
}

beforeEach(() => {
  setStorageForTesting(new MemoryStorageAdapter(true));
  getProductCache();
});

afterEach(() => {
  setProductCacheForTesting(null);
  resetStorageForTesting();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("local-first barcode resolution", () => {
  it("serves a fresh cached product instantly without a network call", async () => {
    await getProductCache().save(seedProduct(), "network");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await resolveProductByBarcode("8901491100519", "barcode");

    expect(res.status).toBe("resolved");
    if (res.status === "resolved") {
      expect(res.product.resolutionSource).toBe("local_cache");
      expect(res.product.confidence).toBe(0.9);
      expect(res.product.source).toBe("barcode");
      expect(res.product.cachedAt).toBeTypeOf("number");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("serves a stale cached product and refreshes in the background", async () => {
    await getProductCache().save(
      seedProduct(),
      "network",
      Date.now() - PRODUCT_FRESH_MS - 1000,
    );
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => foundProduct(),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await resolveProductByBarcode("8901491100519", "barcode");
    expect(res.status).toBe("resolved");
    if (res.status === "resolved") {
      expect(res.product.resolutionSource).toBe("local_cache");
    }

    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalled();
  });

  it("resolves an offline cached barcode without any network call", async () => {
    await getProductCache().save(seedProduct(), "network");
    goOffline();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await resolveProductByBarcode("8901491100519", "barcode");
    expect(res.status).toBe("resolved");
    if (res.status === "resolved") {
      expect(res.product.resolutionSource).toBe("local_cache");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to the bundled offline database when offline with no cache", async () => {
    goOffline();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await resolveProductByBarcode("8901000000001", "barcode");
    expect(res.status).toBe("resolved");
    if (res.status === "resolved") {
      expect(res.product.resolutionSource).toBe("local_database");
      expect(res.product.name).toContain("Crunchy");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a friendly error for an unknown offline barcode", async () => {
    goOffline();
    const res = await resolveProductByBarcode("9999999999999", "barcode");
    expect(res.status).toBe("error");
    if (res.status === "error") {
      expect(res.message.toLowerCase()).not.toContain("offline");
    }
  });

  it("caches a network hit for later offline use", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => foundProduct() }),
    );
    const res = await resolveProductByBarcode("8901491100519", "manual_barcode");
    expect(res.status).toBe("resolved");
    if (res.status === "resolved") {
      expect(res.product.resolutionSource).toBe("network");
    }
    const record = await getProductCache().getByBarcode("8901491100519");
    expect(record).not.toBeNull();
  });
});

describe("local-first name search", () => {
  it("returns offline database matches when offline", async () => {
    goOffline();
    const res = await searchProductCandidates("crunchy");
    expect(res.status === "resolved" || res.status === "candidates").toBe(true);
    if (res.status === "resolved") {
      expect(res.product.resolutionSource).toBe("local_database");
    } else if (res.status === "candidates") {
      expect(res.candidates.some((c) => c.resolutionSource === "local_database")).toBe(true);
    }
  });

  it("falls back to local matches when the network search fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    const res = await searchProductCandidates("crunchy");
    expect(res.status === "resolved" || res.status === "candidates").toBe(true);
  });
});

describe("local-first photo resolution (offline)", () => {
  it("does not upload anything when offline and returns not_found without usable OCR", async () => {
    goOffline();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const file = new Blob(["photo-bytes"], { type: "image/jpeg" });
    const { resolution } = await resolveProductByPhotoLocalFirst(file);
    expect(resolution.status).toBe("not_found");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a friendly error when the online upload path fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    const file = new Blob(["photo-bytes"], { type: "image/jpeg" });
    const { resolution } = await resolveProductByPhotoLocalFirst(file);
    expect(resolution.status).toBe("error");
    if (resolution.status === "error") {
      expect(resolution.message).not.toContain("500");
    }
  });
});