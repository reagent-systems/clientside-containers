import { defineConfig } from "vitest/config";

// The agent engine is environment-agnostic (fetch and the filesystem are
// injected), so the Node test environment is sufficient. Tests live in test/
// and import the engine module directly from public/workers/.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.{js,mjs}"],
  },
});
