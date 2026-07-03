import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const packageEntry = (name: string) =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@snapstore/core": packageEntry("core"),
      "@snapstore/url": packageEntry("url"),
      "@snapstore/react": packageEntry("react"),
      "@snapstore/form": packageEntry("form"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
  },
  bench: {
    include: ["tests/bench.bench.ts"],
  },
});
