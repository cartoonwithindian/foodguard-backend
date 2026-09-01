import { describe, it, expect, vi } from "vitest";
import { lookupProductByBarcode } from "@/lib/product-lookup";
import { parseBarcodeListPage } from "@/lib/product-lookup/barcode-list";
import { parseBarcodesDatabasePage } from "@/lib/product-lookup/barcodes-database";
import { parseGoogleResultsForBarcode } from "@/lib/product-lookup/google";
import { mergeLookupResults, validateLookupResult } from "@/lib/product-lookup/validation";
import type { LookupAdapter, ProductLookupResult } from "@/lib/product-lookup/types";

const FOUND = (source: string, overrides: Partial<ProductLookupResult> = {}): ProductLookupResult => ({
  found: true,
  barcode: "8901491100519",
  name: "Kurkure Masala Munch",
  brand: "Kurkure",
  category: "Snacks",
  ingredients: "Corn Flour, Palm Oil, Salt, Sugar",
  source,
  confidence: 0.8,
  ...overrides,
});

const NOT_FOUND = (source: string, barcode = "8901491100519"): ProductLookupResult => ({
  found: false,
  barcode,
  source,
  confidence: 0,
});

describe("product-lookup orchestrator", () => {
  it("primary API succeeds -> no fallback calls", async () => {
    const primary = vi.fn(async () => FOUND("indian_dataset"));
    const google = vi.fn(async () => NOT_FOUND("google"));
    const barcodeList = vi.fn(async () => NOT_FOUND("barcode-list"));
    const result = await lookupProductByBarcode("8901491100519", {
      adapters: { primary, google, "barcode-list": barcodeList },
    });
    expect(result.success).toBe(true);
    expect(result.source).toBe("indian_dataset");
    expect(result.product?.name).toBe("Kurkure Masala Munch");
    expect(primary).toHaveBeenCalledTimes(1);
    expect(google).not.toHaveBeenCalled();
    expect(barcodeList).not.toHaveBeenCalled();
  });

  it("primary fails -> google is attempted", async () => {
    const primary = vi.fn(async () => NOT_FOUND("none"));
    const google = vi.fn(async () => FOUND("google", { barcode: "8901491361026" }));
    const barcodeList = vi.fn(async () => NOT_FOUND("barcode-list"));
    const result = await lookupProductByBarcode("8901491361026", {
      adapters: { primary, google, "barcode-list": barcodeList },
    });
    expect(result.success).toBe(true);
    expect(result.source).toBe("google");
    expect(primary).toHaveBeenCalledTimes(1);
    expect(google).toHaveBeenCalledTimes(1);
    expect(barcodeList).not.toHaveBeenCalled();
  });

  it("google fails -> barcode-list is attempted", async () => {
    const primary = vi.fn(async () => NOT_FOUND("none"));
    const google = vi.fn(async () => NOT_FOUND("google"));
    const barcodeList = vi.fn(async () => FOUND("barcode-list", { barcode: "8901491366229" }));
    const barcodesDb = vi.fn(async () => NOT_FOUND("barcodesdatabase"));
    const result = await lookupProductByBarcode("8901491366229", {
      adapters: { primary, google, "barcode-list": barcodeList, barcodesdatabase: barcodesDb },
    });
    expect(result.success).toBe(true);
    expect(result.source).toBe("barcode-list");
    expect(barcodesDb).not.toHaveBeenCalled();
  });

  it("barcode-list fails -> barcodesdatabase is attempted", async () => {
    const primary = vi.fn(async () => NOT_FOUND("none"));
    const google = vi.fn(async () => NOT_FOUND("google"));
    const barcodeList = vi.fn(async () => NOT_FOUND("barcode-list"));
    const barcodesDb = vi.fn(async () => FOUND("barcodesdatabase", { barcode: "0710535945560" }));
    const spider = vi.fn(async () => NOT_FOUND("barcodespider"));
    const result = await lookupProductByBarcode("0710535945560", {
      adapters: { primary, google, "barcode-list": barcodeList, barcodesdatabase: barcodesDb, barcodespider: spider },
    });
    expect(result.success).toBe(true);
    expect(result.source).toBe("barcodesdatabase");
    expect(spider).not.toHaveBeenCalled();
  });

  it("barcodesdatabase fails -> barcodespider is attempted", async () => {
    const primary = vi.fn(async () => NOT_FOUND("none"));
    const google = vi.fn(async () => NOT_FOUND("google"));
    const barcodeList = vi.fn(async () => NOT_FOUND("barcode-list"));
    const barcodesDb = vi.fn(async () => NOT_FOUND("barcodesdatabase"));
    const spider = vi.fn(async () => FOUND("barcodespider", { barcode: "0710535945561" }));
    const result = await lookupProductByBarcode("0710535945561", {
      adapters: { primary, google, "barcode-list": barcodeList, barcodesdatabase: barcodesDb, barcodespider: spider },
    });
    expect(result.success).toBe(true);
    expect(result.source).toBe("barcodespider");
  });

  it("all barcode sources fail -> OCR/product-name fallback is attempted", async () => {
    const primary = vi.fn(async () => NOT_FOUND("none"));
    const google = vi.fn(async () => NOT_FOUND("google"));
    const barcodeList = vi.fn(async () => NOT_FOUND("barcode-list"));
    const barcodesDb = vi.fn(async () => NOT_FOUND("barcodesdatabase"));
    const spider = vi.fn(async () => NOT_FOUND("barcodespider"));
    const ocrGoogle = vi.fn(async () => FOUND("ocr-google", { barcode: "8901491361027", confidence: 0.55 }));
    const result = await lookupProductByBarcode("8901491361027", {
      context: { productName: "Kurkure Masala Munch", ocrText: "corn flour palm oil" },
      adapters: { primary, google, "barcode-list": barcodeList, barcodesdatabase: barcodesDb, barcodespider: spider, "ocr-google": ocrGoogle },
    });
    expect(result.success).toBe(true);
    expect(result.source).toBe("ocr-google");
    expect(ocrGoogle).toHaveBeenCalledTimes(1);
  });

  it("ocr fallback is skipped without product-name/OCR context", async () => {
    const primary = vi.fn(async () => NOT_FOUND("none"));
    const google = vi.fn(async () => NOT_FOUND("google"));
    const barcodeList = vi.fn(async () => NOT_FOUND("barcode-list"));
    const ocrGoogle = vi.fn(async () => FOUND("ocr-google"));
    const result = await lookupProductByBarcode("8901491361028", {
      adapters: { primary, google, "barcode-list": barcodeList, "ocr-google": ocrGoogle },
    });
    expect(result.success).toBe(false);
    expect(ocrGoogle).not.toHaveBeenCalled();
  });

  it("completely unknown barcode -> PRODUCT_NOT_FOUND outcome", async () => {
    const primary = vi.fn(async () => NOT_FOUND("none"));
    const google = vi.fn(async () => NOT_FOUND("google"));
    const barcodeList = vi.fn(async () => NOT_FOUND("barcode-list"));
    const barcodesDb = vi.fn(async () => NOT_FOUND("barcodesdatabase"));
    const spider = vi.fn(async () => NOT_FOUND("barcodespider"));
    const result = await lookupProductByBarcode("8900000000001", {
      adapters: { primary, google, "barcode-list": barcodeList, barcodesdatabase: barcodesDb, barcodespider: spider },
    });
    expect(result.success).toBe(false);
    expect(result.source).toBe("none");
    expect(result.confidence).toBe(0);
  });

  it("timeout from one provider -> next provider executes", async () => {
    const primary = vi.fn(async () => {
      throw new Error("ETIMEDOUT");
    });
    const google = vi.fn(async () => FOUND("google", { barcode: "8901491361029" }));
    const result = await lookupProductByBarcode("8901491361029", {
      adapters: { primary, google },
    });
    expect(result.success).toBe(true);
    expect(result.source).toBe("google");
  });

  it("google timeout -> barcode-list still attempted", async () => {
    const primary = vi.fn(async () => NOT_FOUND("none"));
    const google = vi.fn(async () => {
      throw new Error("aborted");
    });
    const barcodeList = vi.fn(async () => FOUND("barcode-list", { barcode: "8901491361030" }));
    const result = await lookupProductByBarcode("8901491361030", {
      adapters: { primary, google, "barcode-list": barcodeList },
    });
    expect(result.success).toBe(true);
    expect(result.source).toBe("barcode-list");
  });

  it("invalid barcode -> rejected before any external requests", async () => {
    const primary = vi.fn(async () => FOUND("indian_dataset"));
    await expect(
      lookupProductByBarcode("12", { adapters: { primary } }),
    ).rejects.toThrow("Invalid barcode format");
    await expect(
      lookupProductByBarcode("abc-def", { adapters: { primary } }),
    ).rejects.toThrow("Invalid barcode format");
    await expect(
      lookupProductByBarcode("   ", { adapters: { primary } }),
    ).rejects.toThrow("Invalid barcode format");
    expect(primary).not.toHaveBeenCalled();
  });

  it("duplicate scans -> cached result is returned, no repeated adapter calls", async () => {
    const primary = vi.fn(async () => FOUND("indian_dataset", { barcode: "8901491361031" }));
    const google = vi.fn(async () => FOUND("google", { barcode: "8901491361031" }));
    const barcode = "8901491361031";

    const first = await lookupProductByBarcode(barcode, {
      adapters: { primary, google },
    });
    expect(first.cached).toBe(false);
    expect(first.source).toBe("indian_dataset");

    const second = await lookupProductByBarcode(barcode, {
      adapters: { primary, google },
    });
    expect(second.cached).toBe(true);
    expect(second.source).toBe("indian_dataset");
    expect(primary).toHaveBeenCalledTimes(1);
    expect(google).not.toHaveBeenCalled();
  });

  it("partial product data from high-confidence local source skips slow enrichment", async () => {
    // When the Indian dataset returns a product with confidence >= 0.9,
    // the fast-path skips external enrichment to avoid 30+ second latency.
    // Missing fields are NOT filled synchronously — this is intentional.
    const primary = vi.fn(async () =>
      FOUND("indian_dataset", {
        barcode: "8901491361034",
        name: "Kurkure Masala Munch",
        brand: "Kurkure",
        ingredients: undefined,
        nutrition: undefined,
        confidence: 0.95,
      }),
    );
    const google = vi.fn(async () => NOT_FOUND("google", "8901491361034"));
    const barcodeList = vi.fn(async () =>
      FOUND("barcode-list", {
        barcode: "8901491361034",
        name: "KURKURE MASALA MUNCH 100G",
        brand: "KURKURE",
        ingredients: "Corn Flour, Palm Oil, Salt, Sugar",
      }),
    );
    const result = await lookupProductByBarcode("8901491361034", {
      adapters: { primary, google, "barcode-list": barcodeList },
    });
    expect(result.success).toBe(true);
    expect(result.source).toBe("indian_dataset");
    expect(result.product?.name).toBe("Kurkure Masala Munch");
    expect(result.product?.brand).toBe("Kurkure");
    // High-confidence local fast-path: enrichment adapters are NOT called
    expect(google).not.toHaveBeenCalled();
    expect(barcodeList).not.toHaveBeenCalled();
    expect(result.mergedFrom).toHaveLength(0);
  });

  it("partial product data from low-confidence source triggers enrichment", async () => {
    // When the primary source has confidence < 0.9, enrichment IS attempted.
    const primary = vi.fn(async () =>
      FOUND("openfoodfacts", {
        barcode: "8901491361035",
        name: "Kurkure Masala Munch",
        brand: "Kurkure",
        ingredients: undefined,
        nutrition: undefined,
        confidence: 0.6,
      }),
    );
    const barcodeList = vi.fn(async () =>
      FOUND("barcode-list", {
        barcode: "8901491361035",
        name: "KURKURE MASALA MUNCH 100G",
        brand: "KURKURE",
        ingredients: "Corn Flour, Palm Oil, Salt, Sugar",
      }),
    );
    const result = await lookupProductByBarcode("8901491361035", {
      adapters: { primary, "barcode-list": barcodeList },
    });
    expect(result.success).toBe(true);
    expect(result.source).toBe("openfoodfacts");
    expect(result.product?.ingredients).toBe("Corn Flour, Palm Oil, Salt, Sugar");
    expect(result.mergedFrom).toContain("barcode-list");
  });

  it("incorrect barcode match -> result rejected, chain continues", async () => {
    const primary = vi.fn(async () => NOT_FOUND("none"));
    const google = vi.fn(async () => FOUND("google", { barcode: "9999999999999" }));
    const barcodeList = vi.fn(async () => FOUND("barcode-list", { barcode: "8901491361032" }));
    const result = await lookupProductByBarcode("8901491361032", {
      adapters: { primary, google, "barcode-list": barcodeList },
    });
    expect(result.success).toBe(true);
    expect(result.source).toBe("barcode-list");
    expect(google).toHaveBeenCalledTimes(1);
  });

  it("low-confidence result -> rejected, chain continues", async () => {
    const primary = vi.fn(async () => NOT_FOUND("none"));
    const google = vi.fn(async () => FOUND("google", { confidence: 0.3 }));
    const barcodeList = vi.fn(async () => FOUND("barcode-list", { barcode: "8901491361033" }));
    const result = await lookupProductByBarcode("8901491361033", {
      adapters: { primary, google, "barcode-list": barcodeList },
    });
    expect(result.success).toBe(true);
    expect(result.source).toBe("barcode-list");
  });
});

describe("barcode-list parser", () => {
  const SAMPLE_PAGE = `<!doctype html><html><head><title>KURKURE 95G MASALA MUNCH NAMKEEN - Barcode: 8901491100519</title></head>
<body>
<table><tr><td>Nr</td><td>Barcode</td><td>Product Name</td><td>Measure</td><td>Rating</td></tr>
<tr><td>1</td><td>8901491100519</td><td>KURKURE 95G MASALA MUNCH NAMKEEN</td><td>ITEM</td><td>26</td></tr>
<tr><td>2</td><td>8901491100519</td><td>KURKURE MASALA MUNCH 100GRM</td><td>PC</td><td>1</td></tr>
</table></body></html>`;

  it("extracts the product name from the title", () => {
    expect(parseBarcodeListPage(SAMPLE_PAGE, "8901491100519")).toBe(
      "KURKURE 95G MASALA MUNCH NAMKEEN",
    );
  });

  it("rejects pages that do not mention the requested barcode", () => {
    expect(parseBarcodeListPage(SAMPLE_PAGE, "8901491361026")).toBeNull();
  });

  it("rejects empty or not-found pages", () => {
    expect(parseBarcodeListPage("<html><title>Not Found</title></html>", "8901491100519")).toBeNull();
    expect(parseBarcodeListPage("<html></html>", "8901491100519")).toBeNull();
  });
});

describe("barcodes-database parser", () => {
  it("returns null on Cloudflare challenge pages", () => {
    const challenge =
      '<html><head><title>Just a moment...</title></head><body><div class="main-content">Enable JavaScript and cookies to continue</div></body></html>';
    expect(parseBarcodesDatabasePage(challenge, "8901491100519")).toBeNull();
  });

  it("extracts the product name from a real page title", () => {
    const page =
      '<html><head><title>Kurkure Masala Munch - Barcode Database</title></head><body>Barcode 8901491100519 data</body></html>';
    expect(parseBarcodesDatabasePage(page, "8901491100519")).toBe("Kurkure Masala Munch");
  });

  it("rejects pages without the requested barcode", () => {
    const page = '<html><head><title>Kurkure Masala Munch - Barcode Database</title></head></html>';
    expect(parseBarcodesDatabasePage(page, "0710535945560")).toBeNull();
  });
});

describe("google fallback parser", () => {
  const barcode = "8901491361026";
  const result = (title: string, url: string, snippet = "") => ({
    title,
    url,
    snippet,
    domain: new URL(url).hostname.replace(/^www\./, ""),
    retrievedAt: "2026-01-01T00:00:00.000Z",
    provider: "searxng",
  });

  it("extracts a product from a title containing the barcode", () => {
    const parsed = parseGoogleResultsForBarcode(
      [result("Kurkure Masala Munch 100g - Barcode: 8901491361026", "https://example.com/product")],
      barcode,
    );
    expect(parsed?.found).toBe(true);
    expect(parsed?.name).toBe("Kurkure Masala Munch 100g");
    expect(parsed?.source).toBe("google");
  });

  it("ignores results from barcode lookup databases (handled later in the chain)", () => {
    const parsed = parseGoogleResultsForBarcode(
      [result("Kurkure 8901491361026", "https://www.barcode-list.com/barcode/EN/barcode-8901491361026/Search.htm")],
      barcode,
    );
    expect(parsed).toBeNull();
  });

  it("ignores junk pages even when they mention the barcode", () => {
    const parsed = parseGoogleResultsForBarcode(
      [result("No results for 8901491361026", "https://example.com/search")],
      barcode,
    );
    expect(parsed).toBeNull();
  });

  it("returns null when no result mentions the barcode", () => {
    const parsed = parseGoogleResultsForBarcode(
      [result("Some unrelated product", "https://example.com/other")],
      barcode,
    );
    expect(parsed).toBeNull();
  });

  it("rejects marketplace listings that merely echo the barcode", () => {
    const parsed = parseGoogleResultsForBarcode(
      [
        result(
          "1 adet Beyaz Lahana (1000-1500 gr arasi) - Ejder Meyvesi Alanya",
          "https://example.com/listing/8901491361026",
          "urun kodu 8901491361026",
        ),
      ],
      barcode,
    );
    expect(parsed).toBeNull();
  });

  it("accepts a product title with a pack size", () => {
    const parsed = parseGoogleResultsForBarcode(
      [result("Kurkure Masala Munch 100g - 8901491361026", "https://example.com/p/8901491361026")],
      barcode,
    );
    expect(parsed?.found).toBe(true);
    expect(parsed?.name).toBe("Kurkure Masala Munch 100g");
  });

  it("rejects dataset pages whose snippet merely contains the barcode", () => {
    const parsed = parseGoogleResultsForBarcode(
      [
        result(
          "Grocery products dataset with barcode number",
          "https://example.com/dataset",
          "row 8900000000001: Kurkure",
        ),
      ],
      "8900000000001",
    );
    expect(parsed).toBeNull();
  });

  it("rejects calculator/number-conversion pages", () => {
    const parsed = parseGoogleResultsForBarcode(
      [
        result(
          "Write 8900000000001 in English Words - Calculator Online",
          "https://example.com/words-calculator",
        ),
      ],
      "8900000000001",
    );
    expect(parsed).toBeNull();
  });
});

describe("mergeLookupResults", () => {
  it("fills only missing fields, never overwrites primary data", () => {
    const base = FOUND("indian_dataset", {
      name: "Kurkure",
      brand: "Kurkure",
      ingredients: undefined,
      nutrition: undefined,
      confidence: 0.95,
    });
    const extra = FOUND("barcode-list", {
      name: "WRONG NAME",
      brand: "WRONG",
      ingredients: "Corn Flour, Palm Oil",
    });
    const merged = mergeLookupResults(base, extra);
    expect(merged.name).toBe("Kurkure");
    expect(merged.brand).toBe("Kurkure");
    expect(merged.ingredients).toBe("Corn Flour, Palm Oil");
  });
});

describe("validateLookupResult", () => {
  it("rejects a mismatched barcode", () => {
    const r = FOUND("google", { barcode: "9999999999999" });
    expect(validateLookupResult(r, "8901491100519").valid).toBe(false);
  });

  it("rejects results without a name or brand", () => {
    const r: ProductLookupResult = { found: true, barcode: "8901491100519", source: "google", confidence: 0.7 };
    expect(validateLookupResult(r, "8901491100519").valid).toBe(false);
  });

  it("accepts a well-formed result", () => {
    expect(validateLookupResult(FOUND("barcode-list"), "8901491100519").valid).toBe(true);
  });

  it("rejects test/placeholder entries from public datasets", () => {
    const r = FOUND("openfoodfacts", {
      barcode: "8901491100519",
      name: "Diagnostic Test Product DELETE ME",
    });
    const verdict = validateLookupResult(r, "8901491100519");
    expect(verdict.valid).toBe(false);
    expect(verdict.reason).toBe("test_or_placeholder_entry");
  });
});