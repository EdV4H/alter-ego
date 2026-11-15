import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createAvatarEngine } from "@edv4h/alter-ego-core";
import { validate } from "@edv4h/alter-ego-schema";
import { deriveCategories } from "../editor/categories.js";
import { ALL_DEMO_SCHEMAS, applyInitialSelections, DEFAULT_DEMO_SCHEMA, DEMO_SCHEMAS, humanEnabled } from "./config.js";

const publicAssets = join(dirname(fileURLToPath(import.meta.url)), "../../public/assets/");

describe("DEMO_SCHEMAS", () => {
  it("id と metadata.name が重ならない（URL と保存先に使うため）", () => {
    expect(new Set(ALL_DEMO_SCHEMAS.map((d) => d.id)).size).toBe(ALL_DEMO_SCHEMAS.length);
    expect(new Set(ALL_DEMO_SCHEMAS.map((d) => d.schema.metadata.name)).size).toBe(ALL_DEMO_SCHEMAS.length);
    expect(DEMO_SCHEMAS).toContain(DEFAULT_DEMO_SCHEMA);
  });

  it("人の素材はリポジトリに無いので、指定しない限りマスコットだけを出す", () => {
    expect(humanEnabled({})).toBe(false);
    expect(humanEnabled({ VITE_DEMO_HUMAN: "true" })).toBe(true);
    expect(DEMO_SCHEMAS.map((d) => d.id)).toEqual(humanEnabled() ? ["human", "mascot"] : ["mascot"]);
  });

  // 画面に出すスキーマは、素材のファイルが揃っていなければならない
  describe.each(DEMO_SCHEMAS.map((d) => [d.id, d] as const))("%s", (_, demo) => {
    it("すべてのアセットのファイルがある", () => {
      const missing = demo.schema.assets.filter((a) => !existsSync(join(publicAssets, a.src))).map((a) => a.src);
      expect(missing).toEqual([]);
    });
  });

  describe.each(ALL_DEMO_SCHEMAS.map((d) => [d.id, d] as const))("%s", (_, demo) => {
    it("スキーマとして正しい", () => {
      const result = validate(demo.schema);
      expect(result.ok ? [] : result.errors).toEqual([]);
    });

    it("カテゴリが作れる", () => {
      expect(deriveCategories(demo.schema).length).toBeGreaterThan(0);
    });

    it("初期の選択をエラーなく当てられる", () => {
      const engine = createAvatarEngine({ schema: demo.schema, plugins: [] });
      applyInitialSelections(engine);
      for (const [slot, { part, color }] of Object.entries(demo.initial ?? {})) {
        const sel = engine.state.selections[slot];
        if (part) expect(sel?.partId).toBe(part);
        if (color) expect(sel?.color).toBe(color);
      }
    });
  });
});
