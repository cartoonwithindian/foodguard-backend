import { describe, it, expect } from "vitest";
import {
  resolveProductImageUrlByBarcode,
  resolveProductImageUrl,
} from "@/lib/product-image-resolver";

describe("resolveProductImageUrlByBarcode", () => {
  it("resolves an exact barcode hit from the prebuilt index", () => {
    // 8901491100519 is "Kurkure" — the product that showed "No image" in the
    // grid while its detail page had a photo.
    const url = resolveProductImageUrlByBarcode("8901491100519");
    expect(url).toBeTruthy();
    expect(url).toMatch(/^https:\/\//);
  });

  it("never invents a match for an unknown barcode", () => {
    expect(resolveProductImageUrlByBarcode("0000000000000")).toBeNull();
  });

  it("rejects malformed barcodes without touching the index", () => {
    for (const bad of ["", "   ", "abc", "123", "890149110051x", "89014911005191234567"]) {
      expect(resolveProductImageUrlByBarcode(bad)).toBeNull();
    }
    expect(resolveProductImageUrlByBarcode(null)).toBeNull();
    expect(resolveProductImageUrlByBarcode(undefined)).toBeNull();
  });

  it("tolerates surrounding whitespace", () => {
    expect(resolveProductImageUrlByBarcode("  8901491100519  ")).toBe(
      resolveProductImageUrlByBarcode("8901491100519"),
    );
  });

  it("never returns a non-http URL", () => {
    const url = resolveProductImageUrlByBarcode("8901491100519");
    expect(url === null || url.startsWith("https://") || url.startsWith("http://")).toBe(true);
  });
});

describe("resolveProductImageUrl (name/brand fallback)", () => {
  it("keeps resolving by name so the barcode index is additive", () => {
    // A name the map actually keys on; must still work alongside the barcode index.
    expect(resolveProductImageUrl("Bisk Farm Rich Marie Biscuits", "Bisk Farm")).toBeTruthy();
    expect(
      resolveProductImageUrl("Bisk Farm Rich Marie Biscuits 250g", "Bisk Farm"),
    ).toBeTruthy();
  });

  it("returns null instead of guessing for an unknown product", () => {
    expect(resolveProductImageUrl("Zzqx Nonexistent Widget 9000g", "Zzqx")).toBeNull();
  });
});