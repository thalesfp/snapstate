import { defineConfig } from "tsup";
import type { Plugin } from "esbuild";

const pkg = "@thalesfp/snapstate";

const rewriteCore: Plugin = {
  name: "rewrite-core-imports",
  setup(build) {
    build.onResolve({ filter: /\.\.\/core\/(base|types)\.js$/ }, () => ({
      path: pkg,
      external: true,
    }));
  },
};

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
    esbuildPlugins: [rewriteCore],
  },
  {
    entry: { "form/index": "src/form/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    external: ["react", "zod"],
    esbuildPlugins: [rewriteCore],
  },
  {
    entry: { "url/index": "src/url/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    external: ["qs"],
  },
]);
