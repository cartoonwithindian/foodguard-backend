import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./src/stubs/server-only.ts", import.meta.url)),
      // Mirrors the tsconfig.json path mapping: `next` is deliberately not a
      // dependency of this standalone backend (see src/stubs/next-server.ts).
      "next/server": fileURLToPath(new URL("./src/stubs/next-server.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    pool: "forks",
    // A few pipelines deliberately probe live providers (FSSAI, DuckDuckGo,
    // legal metrology) and can take tens of seconds when one is rate-limiting.
    // The old 5s default failed otherwise-correct assertions on a slow network.
    testTimeout: 30_000,
    env: {
      // config.ts defaults the visual-search client to the production Render
      // URL; the client tests assert against the local service default.
      VISUAL_SEARCH_API_URL: "http://127.0.0.1:8001",
    },
  },
});
