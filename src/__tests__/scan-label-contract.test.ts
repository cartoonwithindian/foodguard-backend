import { describe, expect, it, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";

// Keep the contract test deterministic and offline: mock OCR and visual search.
vi.mock("@/lib/ocr", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ocr")>();
  return {
    ...actual,
    getOCRProvider: () => ({
      extractText: async () => ({
        rawText: "Ingredients: Sugar, Water",
        confidence: 0.92,
        needsReview: false,
        provider: "mock",
        fallbackUsed: false,
      }),
    }),
  };
});

vi.mock("@/lib/visual-search", () => ({
  searchByVector: async () => ({ ok: false, code: "UNAVAILABLE", serviceUnavailable: true, results: [] }),
  searchByImageUrl: async () => ({ ok: false, code: "UNAVAILABLE", serviceUnavailable: true, results: [] }),
}));

let POST: typeof import("@/app/api/scan/label/route").POST;

beforeAll(async () => {
  ({ POST } = await import("@/app/api/scan/label/route"));
});

function scanRequest(withImage: boolean): NextRequest {
  const form = new FormData();
  if (withImage) {
    // 1x1 transparent PNG; OCR is mocked, barcode decoding fails gracefully.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      "base64",
    );
    form.append("image", new File([png], "label.png", { type: "image/png" }));
  }
  return new NextRequest("http://localhost/api/scan/label", {
    method: "POST",
    body: form,
  });
}

describe("POST /api/scan/label response contract", () => {
  it("returns the standard envelope with the scan payload under `data`", async () => {
    const response = await POST(scanRequest(true));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.error).toBeNull();
    expect(typeof body.meta.requestId).toBe("string");

    // The documented contract: scan fields live at `data.*`.
    expect(body.data).toBeTypeOf("object");
    expect(body.data.barcode).toBeTypeOf("object");
    expect(body.data.ocr).toBeTypeOf("object");
    expect(body.data.ocr).toHaveProperty("status");
    expect(typeof body.data.rawText).toBe("string");
    expect(Array.isArray(body.data.ingredients)).toBe(true);

    // There is no unwrapped copy at the envelope root. Consumers (including
    // the shared client helpers in this repo) must read `data` first.
    expect(body.barcode).toBeUndefined();
    expect(body.ocr).toBeUndefined();
    expect(body.ingredientsText).toBeUndefined();
  });

  it("returns a 400 error envelope when the image is missing", async () => {
    const response = await POST(scanRequest(false));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.data).toBeNull();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});
