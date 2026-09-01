import { afterEach, describe, expect, it, vi } from "vitest";
import {
  searchByVector,
  searchSimilarByImage,
  visualSearchAvailable,
} from "@/lib/visual-search";

function okResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errResponse(status: number, body?: unknown): Response {
  return new Response(JSON.stringify(body ?? { error: { message: "boom", code: "INTERNAL" } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubVisualSearch(
  handler: (url: string, init: RequestInit) => Response | Promise<Response>,
): ReturnType<typeof vi.fn> {
  const mock = vi.fn(async (url: string, init: RequestInit) => handler(url, init));
  vi.stubGlobal("fetch", mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const BASE = "http://127.0.0.1:8001";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("searchSimilarByImage", () => {
  it("returns camelCased similar products from the snake_case service", async () => {
    const fetchMock = stubVisualSearch((url, init) => {
      expect(url).toBe(`${BASE}/api/v1/search`);
      expect(init.method).toBe("POST");
      expect(init.body).toBeInstanceOf(FormData);
      const form = init.body as FormData;
      expect(form.get("top_k")).toBe("5");
      expect(form.get("image")).toBeInstanceOf(Blob);
      return okResponse({
        query: "label.png",
        results: [
          {
            rank: 1,
            product_name: "Kellogg's Corn Flakes 300g",
            product_id: "Kellogg's Corn Flakes 300g_5008",
            score: 20.48,
            image_path: "products_images/X/image_1.jpg",
          },
          {
            rank: 2,
            product_name: "Kellogg's Corn Flakes Original 475g",
            score: 21.16,
          },
        ],
      });
    });

    const res = await searchSimilarByImage(PNG, "label.png", "image/png", 5);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.results).toHaveLength(2);
    expect(res.results[0]).toEqual({
      rank: 1,
      productName: "Kellogg's Corn Flakes 300g",
      productId: "Kellogg's Corn Flakes 300g_5008",
      score: 20.48,
      imagePath: "products_images/X/image_1.jpg",
    });
    expect(res.results[1]).toEqual({
      rank: 2,
      productName: "Kellogg's Corn Flakes Original 475g",
      score: 21.16,
      imagePath: undefined,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns serviceUnavailable on network failure", async () => {
    stubVisualSearch(() => {
      throw new TypeError("fetch failed");
    });
    const res = await searchSimilarByImage(PNG, "a.png", "image/png");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.serviceUnavailable).toBe(true);
  });

  it("returns code/message on HTTP error response", async () => {
    stubVisualSearch(() => errResponse(422, { error: { code: "INVALID_INPUT", message: "bad image" } }));
    const res = await searchSimilarByImage(PNG, "a.png", "image/png");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.serviceUnavailable).toBe(false);
    expect(res.code).toBe("INVALID_INPUT");
  });

  it("returns empty results when the service returns none", async () => {
    stubVisualSearch(() => okResponse({ query: "label.png", results: [] }));
    const res = await searchSimilarByImage(PNG, "a.png", "image/png");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.results).toEqual([]);
  });
});

describe("searchByVector", () => {
  const VECTOR = Array.from({ length: 512 }, (_, i) => i / 1000);

  it("POSTs the raw 512-d embedding to /search_by_vector and camelCases results", async () => {
    const fetchMock = stubVisualSearch((url, init) => {
      expect(url).toBe(`${BASE}/api/v1/search_by_vector`);
      expect(init.method).toBe("POST");
      expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
      const body = JSON.parse(init.body as string);
      expect(body.vector).toHaveLength(512);
      expect(body.vector).toEqual(VECTOR);
      expect(body.top_k).toBe(5);
      return okResponse({
        query: "vector_search",
        results: [
          {
            rank: 1,
            product_name: "Kimchi Ramyun Bowl 86G",
            product_id: "Kimchi Ramyun Bowl 86G_10086",
            score: 0.0001,
            image_path: "products_images/X/1.jpg",
          },
        ],
      });
    });

    const res = await searchByVector(VECTOR, 5);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.results[0]).toEqual({
      rank: 1,
      productName: "Kimchi Ramyun Bowl 86G",
      productId: "Kimchi Ramyun Bowl 86G_10086",
      score: 0.0001,
      imagePath: "products_images/X/1.jpg",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns serviceUnavailable on network failure", async () => {
    stubVisualSearch(() => {
      throw new TypeError("fetch failed");
    });
    const res = await searchByVector(VECTOR);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.serviceUnavailable).toBe(true);
  });

  it("returns code/message on 422 validation error", async () => {
    stubVisualSearch(() =>
      errResponse(422, { error: { code: "INVALID_INPUT", message: "'vector' must contain exactly 512 numbers (got 10)" } }),
    );
    const res = await searchByVector([1, 2, 3], 5);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.serviceUnavailable).toBe(false);
    expect(res.code).toBe("INVALID_INPUT");
  });
});

describe("visualSearchAvailable", () => {
  it("returns true when the runtime is ready", async () => {
    stubVisualSearch(() => okResponse({ status: "ok", runtime_ready: true, vectors: 13671 }));
    await expect(visualSearchAvailable()).resolves.toBe(true);
  });

  it("returns false when the service is unreachable", async () => {
    stubVisualSearch(() => {
      throw new TypeError("connect ECONNREFUSED");
    });
    await expect(visualSearchAvailable()).resolves.toBe(false);
  });

  it("returns false when runtime is not ready", async () => {
    stubVisualSearch(() => okResponse({ status: "ok", runtime_ready: false }));
    await expect(visualSearchAvailable()).resolves.toBe(false);
  });
});
