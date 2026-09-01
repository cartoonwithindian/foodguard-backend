import { describe, it, expect, afterEach, vi } from "vitest";
import {
  fetchWithTimeout,
  httpJson,
  withDedup,
  RequestTimeoutError,
} from "@/lib/network/request-manager";
import {
  getNetworkQuality,
  isOnline,
  NETWORK_TIMEOUTS,
} from "@/lib/network/network-status";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("network status", () => {
  it("reports offline when navigator.onLine is false", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(isOnline()).toBe(false);
    expect(getNetworkQuality()).toBe("offline");
  });

  it("reports online (normal) in non-browser environments", () => {
    expect(isOnline()).toBe(true);
    expect(getNetworkQuality()).not.toBe("offline");
  });

  it("exposes sensible timeout buckets", () => {
    expect(NETWORK_TIMEOUTS.lookup).toBe(8000);
    expect(NETWORK_TIMEOUTS.analysis).toBe(30000);
  });
});

describe("fetchWithTimeout", () => {
  it("rejects with RequestTimeoutError when a plain GET hangs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    await expect(fetchWithTimeout("/hang", {}, 30)).rejects.toMatchObject({
      name: RequestTimeoutError.name,
    });
  });

  it("passes plain GETs through as a single-argument fetch call", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchWithTimeout("/plain", {}, 1000);
    expect(fetchMock).toHaveBeenCalledWith("/plain");
  });
});

describe("httpJson retry behavior", () => {
  it("retries transient connection errors", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("ECONNRESET"))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await httpJson("/retry", { retries: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  it("does not retry non-retryable statuses like 404", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("nf", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await httpJson("/nf", { retries: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(404);
  });

  it("retries temporary server statuses like 503 up to the cap", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("s", { status: 503 }))
      .mockResolvedValueOnce(new Response("s", { status: 503 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await httpJson("/svc", { retries: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(res.status).toBe(200);
  });

  it("aborts non-bare requests on timeout (POST)", async () => {
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      httpJson("/upload", { method: "POST", body: new FormData(), timeoutMs: 30 }),
    ).rejects.toMatchObject({ name: RequestTimeoutError.name });
  });
});

describe("withDedup", () => {
  it("shares the same in-flight promise for identical keys", async () => {
    let runs = 0;
    const fn = async () => {
      runs += 1;
      await new Promise((r) => setTimeout(r, 5));
      return "done";
    };
    const [a, b] = [withDedup("k", fn), withDedup("k", fn)];
    expect(a).toBe(b);
    expect(await Promise.all([a, b])).toEqual(["done", "done"]);
    expect(runs).toBe(1);
  });

  it("dedupes concurrent identical httpJson requests", async () => {
    let resolveResponse: ((r: Response) => void) | null = null;
    const deferred = new Promise<Response>((r) => {
      resolveResponse = r;
    });
    const fetchMock = vi.fn().mockReturnValue(deferred);
    vi.stubGlobal("fetch", fetchMock);

    const p1 = httpJson("/same", { dedupeKey: "same", timeoutMs: 1000 });
    const p2 = httpJson("/same", { dedupeKey: "same", timeoutMs: 1000 });
    resolveResponse!(new Response("ok", { status: 200 }));

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
  });
});