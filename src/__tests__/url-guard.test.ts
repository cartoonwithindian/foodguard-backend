import { describe, expect, it } from "vitest";
import { assertPublicHttpUrl } from "@/lib/url-guard";

const MUST_BLOCK = [
  "http://127.0.0.1:8081/x", "http://[::1]:8081/x", "http://[::]/x",
  "http://[::ffff:127.0.0.1]:8081/x", "http://[::ffff:7f00:1]:8081/x",
  "http://[::ffff:a9fe:a9fe]/x", "http://[::ffff:a00:1]/x", "http://[::ffff:10.0.0.1]/x",
  "http://[2002:7f00:1::]/x", "http://[2002:a9fe:a9fe::]/x",
  "http://[64:ff9b::7f00:1]/x", "http://[64:ff9b::a9fe:a9fe]/x",
  "http://169.254.169.254/latest/", "http://[fe80::1]/x", "http://[fc00::1]/x",
  "http://[fd12:3456::1]/x", "http://2130706433/x", "http://0.0.0.0/x",
  "http://[::7f00:1]/x", "http://localhost:3000/x", "http://foo.internal/x",
  "http://metadata.google.internal/x", "http://[fec0::1]/x", "http://[ff02::1]/x",
];
const MUST_ALLOW = [
  "https://example.com/img.jpg", "https://images.openfoodfacts.org/a.jpg",
  "https://[::ffff:8.8.8.8]/x", "https://[2606:4700:4700::1111]/x",
  "https://8.8.8.8/x", "https://1.1.1.1/img.png",
];

describe("url-guard ipv6 ssrf hardening", () => {
  for (const url of MUST_BLOCK) {
    it(`blocks ${url}`, () => {
      expect(() => assertPublicHttpUrl(url)).toThrow();
    });
  }
  for (const url of MUST_ALLOW) {
    it(`allows ${url}`, () => {
      expect(() => assertPublicHttpUrl(url)).not.toThrow();
    });
  }
});
