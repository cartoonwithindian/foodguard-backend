import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  fetchPublicUrl,
  readBytesLimited,
  readTextLimited,
  __nodeTransportForTests,
  __setSafeFetchResolverForTests,
  __setSafeFetchTransportForTests,
} from "@/lib/safe-fetch";

afterEach(() => {
  __setSafeFetchTransportForTests();
  __setSafeFetchResolverForTests();
  vi.restoreAllMocks();
});

function addressOf(server: Server): number {
  return (server.address() as AddressInfo).port;
}

describe("fetchPublicUrl URL/address validation", () => {
  it("rejects private, loopback and metadata literals before any transport", async () => {
    const transport = vi.fn();
    __setSafeFetchTransportForTests(transport);

    for (const url of [
      "http://127.0.0.1:3000/x",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/x",
      "http://localhost/x",
      "http://metadata.google.internal/x",
      "file:///etc/passwd",
      "http://2130706433/", // decimal 127.0.0.1 (normalised by URL)
      "http://0x7f.1/", // hex 127.0.0.1
      "http://[::ffff:127.0.0.1]/x", // IPv4-mapped IPv6 (dotted)
      "http://[::ffff:7f00:1]/x", // IPv4-mapped IPv6 (hex)
      "http://[64:ff9b::127.0.0.1]/x", // NAT64
      "http://[2002:7f00:1::]/x", // 6to4
      "http://0177.0.0.1/", // octal 127.0.0.1
    ]) {
      await expect(fetchPublicUrl(url)).rejects.toThrow();
    }
    expect(transport).not.toHaveBeenCalled();
  });

  it("rejects a public-looking hostname whose DNS answers are private", async () => {
    const transport = vi.fn();
    __setSafeFetchTransportForTests(transport);
    __setSafeFetchResolverForTests(async () => [
      { address: "10.0.0.7", family: 4 },
      { address: "8.8.8.8", family: 4 },
    ]);

    await expect(fetchPublicUrl("https://attacker.test/x")).rejects.toThrow(/public host/i);
    expect(transport).not.toHaveBeenCalled();
  });

  it("passes only validated addresses to the pinned transport", async () => {
    const transport = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    __setSafeFetchTransportForTests(transport);
    __setSafeFetchResolverForTests(async () => [{ address: "93.184.216.34", family: 4 }]);

    await fetchPublicUrl("https://example.com/page");

    expect(transport).toHaveBeenCalledTimes(1);
    const init = transport.mock.calls[0][1];
    expect(init.addresses).toEqual([{ address: "93.184.216.34", family: 4 }]);
    // The URL hostname is preserved (TLS SNI/cert validation), only the
    // address is pinned at the socket layer.
    expect((transport.mock.calls[0][0] as URL).hostname).toBe("example.com");
  });
});

describe("fetchPublicUrl redirects", () => {
  it("re-validates every hop and blocks a redirect to a private literal", async () => {
    const transport = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data/" },
      }),
    );
    __setSafeFetchTransportForTests(transport);

    await expect(fetchPublicUrl("https://8.8.8.8/start")).rejects.toThrow(/public host/i);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("blocks a redirect to a public-looking hostname that resolves privately", async () => {
    const transport = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "https://rebind.test/next" } }),
    );
    __setSafeFetchTransportForTests(transport);
    __setSafeFetchResolverForTests(async () => [{ address: "127.0.0.1", family: 4 }]);

    await expect(fetchPublicUrl("https://8.8.8.8/start")).rejects.toThrow(/public host/i);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("follows a public redirect after resolving it too", async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 301, headers: { location: "https://ok.test/final" } }),
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    __setSafeFetchTransportForTests(transport);
    __setSafeFetchResolverForTests(async () => [{ address: "1.1.1.1", family: 4 }]);

    const response = await fetchPublicUrl("https://start.test/");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls[1][1].addresses).toEqual([{ address: "1.1.1.1", family: 4 }]);
  });

  it("stops after the redirect limit", async () => {
    const transport = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "https://9.9.9.9/again" } }),
    );
    __setSafeFetchTransportForTests(transport);

    await expect(fetchPublicUrl("https://8.8.8.8/start", { maxRedirects: 1 })).rejects.toThrow(
      /Too many redirects/i,
    );
  });
});

describe("pinned socket transport", () => {
  it("connects to the validated address instead of re-resolving the hostname", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("pinned");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

    try {
      // `rebind.test` does not resolve; if the transport re-resolved it the
      // request would fail. The pinned 127.0.0.1 address must be used.
      const response = await __nodeTransportForTests(new URL(`http://rebind.test:${addressOf(server)}/`), {
        method: "GET",
        headers: undefined,
        timeoutMs: 2000,
        addresses: [{ address: "127.0.0.1", family: 4 }],
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("pinned");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("aborts an outbound request after the timeout", async () => {
    const server = createServer((_req, res) => {
      setTimeout(() => {
        res.writeHead(200);
        res.end("late");
      }, 300);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

    try {
      await expect(
        __nodeTransportForTests(new URL(`http://slow.test:${addressOf(server)}/`), {
          method: "GET",
          headers: undefined,
          timeoutMs: 50,
          addresses: [{ address: "127.0.0.1", family: 4 }],
        }),
      ).rejects.toThrow(/timed out/i);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe("bounded body reads", () => {
  it("returns null when the streamed body exceeds the cap without content-length", async () => {
    const response = new Response("x".repeat(100));
    expect(await readTextLimited(response, 10)).toBeNull();
  });

  it("reads a body within the cap", async () => {
    const response = new Response("hello");
    expect(await readTextLimited(response, 1024)).toBe("hello");
  });

  it("honours a declared content-length above the cap", async () => {
    const response = new Response("hello", { headers: { "content-length": "5000" } });
    expect(await readTextLimited(response, 1024)).toBeNull();
  });

  it("caps binary bodies by counting streamed bytes", async () => {
    const small = new Response(new Uint8Array([1, 2, 3]));
    expect(Array.from((await readBytesLimited(small, 4)) ?? [])).toEqual([1, 2, 3]);

    const large = new Response(new Uint8Array(50));
    expect(await readBytesLimited(large, 10)).toBeNull();
  });
});
