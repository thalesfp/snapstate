import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
  },
  {
    entry: { "react/index": "src/react/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    external: ["react"],
  },
  {
    entry: { "form/index": "src/form/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    external: ["react", "zod"],
  },
]);
