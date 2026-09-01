import { describe, it, expect, vi, afterEach } from "vitest";
import {
  resolveProductByBarcode,
  searchProductCandidates,
  resolveProductByPhoto,
  guessProductName,
  buildAnalysisPath,
} from "@/lib/resolve-product";
import { normalizeBarcode } from "@/types/identification";

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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveProductByBarcode", () => {
  it("normalizes digits and returns a resolved product on 200", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => foundProduct(),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await resolveProductByBarcode(" 8901491100519 ", "manual_barcode");
    expect(fetchMock).toHaveBeenCalledWith("/api/products/barcode/8901491100519");
    expect(res.status).toBe("resolved");
    if (res.status === "resolved") {
      expect(res.product.name).toBe("Kurkure Masala Munch");
      expect(res.product.barcode).toBe("8901491100519");
      expect(res.product.source).toBe("manual_barcode");
      expect(res.product.confidence).toBe(0.9);
    }
  });

  it("reports not_found on 404 without inventing data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ success: false }) }),
    );
    const res = await resolveProductByBarcode("0000000000000", "barcode");
    expect(res.status).toBe("not_found");
  });

  it("returns a friendly error on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const res = await resolveProductByBarcode("8901491100519", "barcode");
    expect(res.status).toBe("error");
    if (res.status === "error") {
      expect(res.message).not.toContain("404");
      expect(res.message).not.toContain("offline");
    }
  });

  it("rejects empty barcode input early", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await resolveProductByBarcode("   ", "manual_barcode");
    expect(res.status).toBe("error");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("searchProductCandidates", () => {
  it("returns a resolved product when exactly one candidate matches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            products: [
              {
                id: "p1",
                name: "Kurkure Masala Munch",
                brand: "Kurkure",
                category: "food",
                barcode: "8901491100519",
                score: 95,
              },
            ],
            total: 1,
          },
        }),
      }),
    );
    const res = await searchProductCandidates("kurkure");
    expect(res.status).toBe("resolved");
    if (res.status === "resolved") {
      expect(res.product.source).toBe("name_search");
      expect(res.product.confidence).toBe(0.95);
    }
  });

  it("returns candidates (not a guess) when multiple match", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            products: [
              { id: "p1", name: "Biscuit A", brand: "X", category: "food", barcode: "1", score: 90 },
              { id: "p2", name: "Biscuit B", brand: "Y", category: "food", barcode: "2", score: 80 },
            ],
            total: 2,
          },
        }),
      }),
    );
    const res = await searchProductCandidates("biscuit");
    expect(res.status).toBe("candidates");
    if (res.status === "candidates") {
      expect(res.candidates.length).toBe(2);
    }
  });

  it("returns not_found with no candidates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { products: [], total: 0 } }),
      }),
    );
    const res = await searchProductCandidates("zzzz-not-a-product");
    expect(res.status).toBe("not_found");
  });
});

describe("resolveProductByPhoto", () => {
  it("follows the barcode path when a barcode is detected", async () => {
    const stub = vi.fn();
    stub.mockImplementation((url: RequestInfo | URL) => {
      const path = String(url);
      if (path === "/api/scan/label") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            barcode: { value: "8901491100519", format: "EAN_13", status: "success" },
            ocr: { text: "Kurkure", status: "success", confidence: 0.88, needsReview: false, provider: "tesseract" },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => foundProduct(),
      });
    });
    vi.stubGlobal("fetch", stub);

    const file = new Blob(["fake-image"], { type: "image/jpeg" });
    const { resolution, extracted } = await resolveProductByPhoto(file);
    expect(resolution.status).toBe("resolved");
    expect(extracted.barcode).toBe("8901491100519");
    if (resolution.status === "resolved") {
      expect(resolution.product.source).toBe("photo_ocr");
    }
  });

  it("runs name matching from OCR when no barcode is present", async () => {
    const stub = vi.fn();
    stub.mockImplementation((url: RequestInfo | URL) => {
      const path = String(url);
      if (path === "/api/scan/label") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            barcode: { value: null, format: null, status: "failed" },
            ocr: { text: "Amul Butter\nIngredients\nPasteurised cream\nSalt\nNet wt 500g", status: "success", confidence: 0.9, needsReview: false, provider: "tesseract" },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            products: [{ id: "p9", name: "Amul Butter", brand: "Amul", category: "food", barcode: "890123", score: 90 }],
            total: 1,
          },
        }),
      });
    });
    vi.stubGlobal("fetch", stub);

    const file = new Blob(["x"], { type: "image/png" });
    const { resolution } = await resolveProductByPhoto(file);
    expect(resolution.status).toBe("resolved");
    if (resolution.status === "resolved") {
      expect(resolution.product.name).toBe("Amul Butter");
    }
  });

  it("surfaces a friendly error when the OCR endpoint fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ success: false }) }),
    );
    const file = new Blob(["x"], { type: "image/jpeg" });
    const { resolution } = await resolveProductByPhoto(file);
    expect(resolution.status).toBe("error");
    if (resolution.status === "error") {
      expect(resolution.message).toContain("clearer");
      expect(resolution.message).not.toContain("500");
    }
  });
});

describe("guessProductName", () => {
  it("skips ingredient/nutrition boilerplate lines and picks the brand line", () => {
    const text = "Ingredients\nPasteurised cream\nSalt\nAmul Butter";
    expect(guessProductName(text)).toBe("Pasteurised cream");
  });

  it("returns null for empty/low-value text", () => {
    expect(guessProductName("")).toBeNull();
    expect(guessProductName("1234567890")).toBeNull();
  });

  it("prefers a known name from a matched product", () => {
    expect(guessProductName("random words", "Amul Butter")).toBe("Amul Butter");
  });
});

describe("buildAnalysisPath", () => {
  it("routes barcode products to the same analysis pipeline", () => {
    const path = buildAnalysisPath({
      id: "p1",
      barcode: "8901491100519",
      name: "Kurkure Masala Munch",
      brand: "Kurkure",
      category: "food",
      source: "name_search",
      confidence: 0.95,
    });
    expect(path).toContain("/analysis?");
    expect(path).toContain("barcode=8901491100519");
    expect(path).toContain("productName=Kurkure+Masala+Munch");
    expect(path).toContain("brand=Kurkure");
  });

  it("includes OCR text and confidence when present", () => {
    const path = buildAnalysisPath(
      {
        id: "p1",
        barcode: "",
        name: "Amul Butter",
        brand: "Amul",
        category: "food",
        source: "photo_ocr",
        confidence: 0.8,
      },
      { ocrText: "Amul Butter", ocrConfidence: 0.9, barcode: "890123" },
    );
    expect(path).toContain("barcode=890123");
    expect(path).toContain("ocrText=");
    expect(path).toContain("ocrConfidence=0.9");
  });
});

describe("normalizeBarcode", () => {
  it("strips non-digit characters", () => {
    expect(normalizeBarcode("890-1491 100519")).toBe("8901491100519");
    expect(normalizeBarcode("")).toBe("");
  });
});