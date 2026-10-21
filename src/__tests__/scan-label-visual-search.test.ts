import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Regression guard for the visual-search wiring in POST /api/scan/label.
 *
 * The route used to host the uploaded photo at a short-lived
 * `GET /api/temp/:id` URL and hand that URL to `/api/v1/search_by_url`. That
 * only works when this process is publicly reachable. On `localhost` the
 * remote service received an address it could not fetch, found zero matches,
 * and the route answered `422 OCR_FAILED` -- so image search silently did
 * nothing outside the tunnel. The bytes are now streamed as multipart instead.
 */

const searchByVector = vi.fn();
const searchSimilarByImage = vi.fn();
const searchByImageUrl = vi.fn();

vi.mock("@/lib/visual-search", () => ({
  searchByVector: (...args: unknown[]) => searchByVector(...args),
  searchSimilarByImage: (...args: unknown[]) => searchSimilarByImage(...args),
  searchByImageUrl: (...args: unknown[]) => searchByImageUrl(...args),
}));

// OCR is irrelevant here; keep the real mime validation but stop it from
// reaching Tesseract or the network.
vi.mock("@/lib/ocr", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ocr")>();
  return {
    ...actual,
    getOCRProvider: () => ({
      recognize: async () => ({
        text: "",
        status: "not_found",
        confidence: 0,
        needsReview: false,
      }),
    }),
  };
});

// Barcode detection must miss so the route reaches the visual-search branch.
vi.mock("@/services/barcode.service", () => ({
  detectBarcode: async () => ({ value: null, format: null, status: "not_found" }),
}));

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

function labelRequest(): NextRequest {
  const form = new FormData();
  form.append("image", new Blob([JPEG], { type: "image/jpeg" }), "photo.jpg");
  return new NextRequest("http://127.0.0.1:3001/api/scan/label", { method: "POST", body: form });
}

async function loadRoute() {
  return (await import("@/app/api/scan/label/route")) as typeof import("@/app/api/scan/label/route");
}

beforeEach(() => {
  vi.clearAllMocks();
  searchByVector.mockResolvedValue({ ok: false, results: [] });
  searchSimilarByImage.mockResolvedValue({ ok: false, results: [] });
  searchByImageUrl.mockResolvedValue({ ok: false, results: [] });
});

afterEach(() => {
  vi.resetModules();
});

describe("POST /api/scan/label visual search", () => {
  it("uploads the image bytes instead of asking the service to fetch a local URL", async () => {
    const { POST } = await loadRoute();
    await POST(labelRequest());

    // The regression: the remote service was handed an unreachable localhost URL.
    expect(searchByImageUrl).not.toHaveBeenCalled();

    expect(searchSimilarByImage).toHaveBeenCalledTimes(1);
    const [data, filename, mimeType] = searchSimilarByImage.mock.calls[0] as [
      Uint8Array,
      string,
      string,
    ];
    expect(filename).toBe("upload.jpg");
    expect(mimeType).toBe("image/jpeg");
    // Real bytes, not an empty or placeholder buffer.
    expect(data.byteLength).toBeGreaterThan(0);
  });

  it("does not try a second visual lookup when a client embedding is supplied", async () => {
    const { POST } = await loadRoute();
    const form = new FormData();
    form.append("image", new Blob([JPEG], { type: "image/jpeg" }), "photo.jpg");
    form.append("embedding", JSON.stringify(new Array(512).fill(0.01)));
    const request = new NextRequest("http://127.0.0.1:3001/api/scan/label", {
      method: "POST",
      body: form,
    });

    await POST(request);

    expect(searchByVector).toHaveBeenCalledTimes(1);
    expect(searchSimilarByImage).not.toHaveBeenCalled();
    expect(searchByImageUrl).not.toHaveBeenCalled();
  });

  it("returns similarProducts with a visual_search source when the service matches", async () => {
    searchSimilarByImage.mockResolvedValue({
      ok: true,
      results: [
        {
          rank: 1,
          productName: "Bisk Farm Rich Marie Biscuits",
          productId: "Bisk Farm Rich Marie Biscuits_7043",
          score: 2.04,
          imagePath: "products_images/Bisk Farm Rich Marie Biscuits/image_1.jpg",
        },
      ],
    });

    const { POST } = await loadRoute();
    const response = await POST(labelRequest());
    const payload = (await response.json()) as {
      success: boolean;
      data: { similarProducts: unknown[]; sources: string[] } | null;
    };

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data?.sources).toContain("visual_search");
    expect(payload.data?.similarProducts).toHaveLength(1);
  });
});