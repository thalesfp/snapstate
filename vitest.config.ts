import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

export default defineConfig({
  oxc: false,
  plugins: [
    swc.vite({
      jsc: {
        parser: {
          syntax: "typescript",
          tsx: true,
          decorators: true,
        },
        transform: {
          decoratorVersion: "2022-03",
        },
      },
    }),
  ],
  test: {
    globals: true,
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
  },
  bench: {
    include: ["tests/bench.bench.ts"],
  },
});
