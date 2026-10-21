import { describe, expect, it } from "vitest";
import { parseJsonBody, readFormDataLimited } from "@/lib/http";
import { errorToHttp, AppError, ErrorCodes } from "@/lib/errors";

describe("parseJsonBody", () => {
  it("returns the parsed value for valid JSON", async () => {
    const request = new Request("http://localhost/x", {
      method: "POST",
      body: JSON.stringify({ a: 1 }),
    });
    expect(await parseJsonBody(request)).toEqual({ a: 1 });
  });

  it("returns null for an empty body", async () => {
    const request = new Request("http://localhost/x", { method: "POST", body: "" });
    expect(await parseJsonBody(request)).toBeNull();
  });

  it("maps malformed JSON to a 400 VALIDATION_ERROR instead of a 500", async () => {
    const request = new Request("http://localhost/x", { method: "POST", body: "{not json" });
    await expect(parseJsonBody(request)).rejects.toMatchObject({
      code: ErrorCodes.VALIDATION_ERROR,
      status: 400,
    });
  });

  it("rejects an oversized body with 413 before JSON.parse", async () => {
    const request = new Request("http://localhost/x", {
      method: "POST",
      body: JSON.stringify({ text: "x".repeat(2048) }),
    });
    await expect(parseJsonBody(request, { maxBytes: 1024 })).rejects.toMatchObject({
      code: ErrorCodes.PAYLOAD_TOO_LARGE,
      status: 413,
    });
  });

  it("counts streamed bytes when content-length is absent", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(600)));
        controller.enqueue(new TextEncoder().encode("x".repeat(600)));
        controller.close();
      },
    });
    const request = new Request("http://localhost/x", {
      method: "POST",
      body: stream,
      // @ts-expect-error Node requires duplex for streaming request bodies.
      duplex: "half",
    });
    await expect(parseJsonBody(request, { maxBytes: 1024 })).rejects.toMatchObject({
      code: ErrorCodes.PAYLOAD_TOO_LARGE,
      status: 413,
    });
  });
});

describe("readFormDataLimited", () => {
  it("rejects non-multipart bodies", async () => {
    const request = new Request("http://localhost/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    await expect(readFormDataLimited(request, 1024)).rejects.toMatchObject({
      code: ErrorCodes.VALIDATION_ERROR,
      status: 400,
    });
  });

  it("rejects a multipart body above the cap", async () => {
    const boundary = "test-boundary";
    const body =
      `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="image"; filename="a.jpg"\r\n' +
      "Content-Type: image/jpeg\r\n\r\n" +
      "x".repeat(2048) +
      `\r\n--${boundary}--\r\n`;
    const request = new Request("http://localhost/x", {
      method: "POST",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      body,
    });
    await expect(readFormDataLimited(request, 512)).rejects.toMatchObject({
      code: ErrorCodes.PAYLOAD_TOO_LARGE,
      status: 413,
    });
  });
});

describe("errorToHttp database error mapping", () => {
  it("maps Prisma P2002 to a generic 409 without leaking the driver message", () => {
    const { status, body } = errorToHttp({
      code: "P2002",
      message: "Unique constraint failed on the fields: (`email`)",
    });
    expect(status).toBe(409);
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).not.toContain("Unique constraint");
    expect(body.error.message).not.toContain("email");
  });

  it("maps other Prisma errors to a generic 500 DATABASE_ERROR", () => {
    const { status, body } = errorToHttp({
      code: "P2025",
      message: 'An operation failed because it depends on one or more records that were required but not found. {model: "User"}',
    });
    expect(status).toBe(500);
    expect(body.error.code).toBe(ErrorCodes.DATABASE_ERROR);
    expect(body.error.message).not.toContain("model");
  });

  it("still passes through AppError details", () => {
    const { status, body } = errorToHttp(new AppError(ErrorCodes.FORBIDDEN, "nope", 403));
    expect(status).toBe(403);
    expect(body.error).toEqual({ code: ErrorCodes.FORBIDDEN, message: "nope" });
  });
});
