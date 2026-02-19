import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
  },
  bench: {
    include: ["tests/bench.bench.ts"],
  },
});
