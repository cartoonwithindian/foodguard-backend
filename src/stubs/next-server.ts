/**
 * Standalone shim for `next/server`.
 *
 * The FoodGuard route handlers are written against Next.js App Router types
 * (`NextRequest` / `NextResponse`) but only ever use the standard Web APIs
 * that `Request` / `Response` already provide (`.json()`, `.url`, `.text()`,
 * `.formData()`, `.headers`, `.status`, ...). `server.ts` mounts them on a
 * plain Hono server and passes it a standard `Request` object.
 *
 * This shim lets the standalone backend bundle without depending on the
 * `next` package, which is not installed here and is unavailable on Render.
 */

export class NextRequest extends Request {}

export class NextResponse extends Response {
  static json(body: unknown, init?: ResponseInit): NextResponse {
    return new NextResponse(JSON.stringify(body), {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  }
}
