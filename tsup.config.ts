import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: false,
  treeshake: true,
  // Keep native/worker-heavy deps external so their __dirname / worker paths
  // resolve inside node_modules at runtime (tesseract.js, sharp, prisma).
  external: [
    "@prisma/client",
    "prisma",
    "sharp",
    "tesseract.js",
    "tesseract.js-core",
    "ioredis",
    "bcryptjs",
    "jose",
  ],
  // Route modules are loaded dynamically at runtime (see src/server.ts).
  // They reference @/ with tsconfig paths, so keep them out of the initial
  // bundle by leaving the fs-based dataset reads intact.
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
});
