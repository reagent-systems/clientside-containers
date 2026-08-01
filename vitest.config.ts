import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests cover the pure logic in lib/ — policy evaluation, the preset catalogs,
// and the container factory. They run in Node and need no browser.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
