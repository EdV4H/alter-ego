import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const alias = {
  // ビルド前でもテストを通すため、workspace パッケージは src を直接参照させる
  "@edv4h/alter-ego-schema": r("./packages/schema/src/index.ts"),
  "@edv4h/alter-ego-core": r("./packages/core/src/index.ts"),
  "@edv4h/alter-ego-perceive": r("./packages/perceive/src/index.ts"),
  "@edv4h/alter-ego-react": r("./packages/react/src/index.ts"),
};

export default defineConfig({
  test: {
    projects: [
      {
        // packages/* と renderer-svg 以外の plugins は node 環境
        resolve: { alias },
        test: {
          name: "node",
          include: [
            "packages/*/src/**/*.test.ts",
            "plugins/!(renderer-svg)/src/**/*.test.ts",
          ],
          // happy-dom 環境が必要なテストを除外する
          exclude: [
            "packages/perceive/src/**/{resize,openai}.test.ts",
          ],
          environment: "node",
          globals: false,
        },
      },
      {
        // renderer-svg は DOM が必要なため happy-dom 環境
        resolve: { alias },
        test: {
          name: "happy-dom",
          include: [
            "plugins/renderer-svg/src/**/*.test.ts",
            "packages/perceive/src/**/{resize,openai}.test.ts",
            "apps/react-web/src/**/*.test.ts",
            "packages/react/src/**/*.test.tsx",
          ],
          environment: "happy-dom",
          globals: false,
        },
      },
    ],
  },
});
