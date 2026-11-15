import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  // package.json の exports (dist/index.js, dist/index.d.ts) と出力拡張子を揃える
  fixedExtension: false,
  external: ["react", "react-dom"],
});
