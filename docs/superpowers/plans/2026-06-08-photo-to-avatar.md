# Photo to Avatar 実装 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (推奨) または superpowers:executing-plans を使い、 タスクごとに進める。 ステップは `- [ ]` チェックボックスで進捗管理する。

**Goal:** ユーザーが写真をアップロードすると OpenAI Vision (gpt-4o) が `AvatarSeed` を推定し、 既存 alter-ego の selections + slotTransforms を完全上書きして編集 UI に流し込む機能を追加する。

**Architecture:** 新規 `packages/perceive` パッケージ (型 + `Perceiver` interface + OpenAI 実装) を追加し、 `apps/react-web` 側にヘッダーボタン・上書き確認ダイアログ・overlay UI と `applySeedToEngine` ヘルパを追加する。 3 段パイプライン (Perception → Composition → Render) のうち Stage A を新規パッケージで担い、 Stage B/C は既存の `engine.select()/deselect()` と `plugins/renderer-svg` を再利用する。

**Tech Stack:** TypeScript 5.7 (strict), pnpm workspace, tsdown (lib build), Vite 6 (app), Vitest 3, React 19, zod (バリデーション、 新規依存), OpenAI Vision API (gpt-4o、 fetch 直接呼び出し)。

**前提仕様書:** `docs/superpowers/specs/2026-06-05-photo-to-avatar-design.md`

---

## ブレスト時の確定事項 (再掲)

| 項目 | 確定内容 |
|---|---|
| AI 出力スキーマ | `AvatarSeed = { selections?, slotTransforms?, salientFeatures? }` — 既存 state と直結 |
| API 呼び出し | クライアントから直接 OpenAI を fetch。 PoC のため `.env.local` の `VITE_OPENAI_API_KEY` |
| 既定モデル | `gpt-4o` (env override 可能) |
| UI 入口 | ヘッダー右側、 Download PNG の **左** に新規ボタン |
| seed 反映 | **完全上書き** — required slot は seed の partId に置換 (無ければ schema 既定)、 optional slot は seed に無ければ deselect |
| 上書き確認 | 常に確認ダイアログ (初期状態かどうかの判定はしない) |
| Perceiver | adapter 化 (`Perceiver` interface + `createOpenAIPerceiver`)、 schema は構築時に固定 (PerceiveContext は使わない) |
| 画像縮小 | long-edge 1024px、 client-side `<canvas>` で実施 |
| 写真形式 | jpeg / png / webp、 上限 5MB (縮小前) |
| バリデーション | zod を新規追加、 schema に無い partId / 不正 hex / 範囲外 transform を除外 |
| 背景・動画・onDevice | スコープ外 |

> ⚠️  **セキュリティ警告**: `VITE_OPENAI_API_KEY` は `pnpm build` の出力 (dist/) に **平文で焼き付けられる**。 dist を public ホスティングに展開すると API キーが漏出する。 PoC / ローカル開発専用とし、 本番デプロイ前に必ず `.env.local` を削除し、 dist 内に `sk-` 等のキー文字列が残っていないか grep で確認すること。

---

## File Structure (新規・変更ファイル)

### 新規ファイル

| ファイル | 責務 |
|---|---|
| `packages/perceive/package.json` | パッケージマニフェスト (`@edv4h/alter-ego-perceive`) |
| `packages/perceive/tsconfig.json` | TS 設定 (core を参考) |
| `packages/perceive/tsdown.config.ts` | ビルド設定 |
| `packages/perceive/README.md` | 公開 API ドキュメント |
| `packages/perceive/src/index.ts` | 公開 API の re-export |
| `packages/perceive/src/types.ts` | `AvatarSeed` 型 (selections / slotTransforms / salientFeatures) |
| `packages/perceive/src/errors.ts` | `PerceiveError` クラス + `PerceiveErrorKind` |
| `packages/perceive/src/perceiver.ts` | `Perceiver` interface + `PerceiveOptions` |
| `packages/perceive/src/validate.ts` | 任意 JSON → 安全な `AvatarSeed` 変換 (zod, schema-aware) |
| `packages/perceive/src/validate.test.ts` | validate のテスト |
| `packages/perceive/src/resize.ts` | 写真を long-edge 1024px に縮小して Blob 化 |
| `packages/perceive/src/resize.test.ts` | resize のテスト (happy-dom 環境) |
| `packages/perceive/src/openai.ts` | `createOpenAIPerceiver()` 本体 |
| `packages/perceive/src/openai.test.ts` | OpenAI perceiver のテスト (fetch mock) |
| `packages/perceive/src/errors.test.ts` | `PerceiveError` のテスト |
| `apps/react-web/src/photo-to-avatar.ts` | `applySeedToEngine` ヘルパ (完全上書き semantics) |
| `apps/react-web/src/photo-to-avatar.test.ts` | applySeedToEngine のテスト (happy-dom) |
| `apps/react-web/src/PhotoToAvatarOverlay.tsx` | overlay コンポーネント (推定中 / エラー / 再試行) |
| `apps/react-web/.env.example` | 環境変数のテンプレ |

### 変更ファイル

| ファイル | 変更内容 |
|---|---|
| `vitest.config.ts` | 新規 alias `@edv4h/alter-ego-perceive` を追加。 happy-dom プロジェクトの include に `packages/perceive/src/**/{resize,openai}.test.ts` と `apps/react-web/src/**/*.test.ts` を追加 |
| `apps/react-web/package.json` | dependencies に `@edv4h/alter-ego-perceive: workspace:*` を追加 |
| `apps/react-web/src/vite-env.d.ts` | `VITE_OPENAI_API_KEY`, `VITE_OPENAI_MODEL` の型定義を追加 |
| `apps/react-web/src/App.tsx` | (a) Photo to Avatar ボタンをヘッダーに追加、 (b) 上書き確認ダイアログ、 (c) overlay 表示、 (d) `applySeedToEngine` を呼ぶ handler |

### 既存パターンとの整合

- `packages/perceive` は `packages/core` と同じ skeleton: `tsdown` + `tsconfig` extends `../../tsconfig.base.json` + `pnpm -r run build` で拾われる
- 命名は ADR 0002 に従う: パッケージとして `@edv4h/alter-ego-perceive` (将来別 VLM 実装は `plugins/perceiver-<name>`)
- vitest の env: `validate.test.ts` `errors.test.ts` は node 環境 / `resize.test.ts` `openai.test.ts` は happy-dom 環境 (FileReader / canvas / Image を使うため)
- React コンポーネント分割: App.tsx (現在 1321 行) をこれ以上肥大化させないため、 overlay と applySeedToEngine は別ファイルに切り出す

---

## ブランチ・PR 戦略

- ブランチ: `feat/photo-to-avatar` (main から切る)
- PR は **1 本**、 `--reviewer EdV4H --label "🤖 claude-code"` 付き
- ファイルが多いので Task 1〜10 ごとに細かく commit (Conventional Commits + gitmoji)

---

## Task 1: packages/perceive スカフォールド

**Files:**
- Create: `packages/perceive/package.json`
- Create: `packages/perceive/tsconfig.json`
- Create: `packages/perceive/tsdown.config.ts`
- Create: `packages/perceive/README.md`
- Create: `packages/perceive/src/index.ts`

- [ ] **Step 1: ブランチ作成**

```bash
git checkout main && git pull
git checkout -b feat/photo-to-avatar
```

- [ ] **Step 2: package.json を作成**

```json
{
  "name": "@edv4h/alter-ego-perceive",
  "version": "0.0.0",
  "description": "Perception layer for alter-ego — photo → AvatarSeed via VLM.",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist", "src"],
  "scripts": {
    "build": "tsdown",
    "dev": "tsdown --watch",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@edv4h/alter-ego-schema": "workspace:*",
    "zod": "~3.23.0"
  },
  "devDependencies": {
    "happy-dom": "^15.0.0",
    "tsdown": "^0.21.9",
    "typescript": "^5.7.0"
  },
  "publishConfig": { "access": "public" },
  "sideEffects": false
}
```

- [ ] **Step 3: tsconfig.json を作成 (core を参考)**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "paths": {
      "@edv4h/alter-ego-schema": ["../schema/src/index.ts"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "**/*.test.ts"]
}
```

- [ ] **Step 4: tsdown.config.ts を作成**

```ts
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
});
```

- [ ] **Step 5: 最小の src/index.ts を作成 (まだ何も export しない placeholder)**

```ts
// 公開 API は順次このファイルから re-export する
export {};
```

- [ ] **Step 6: README.md を作成 (最小)**

````markdown
# @edv4h/alter-ego-perceive

写真から `AvatarSeed` (alter-ego の selections + slotTransforms と互換な構造) を推定する Perception 層。 OpenAI Vision (gpt-4o) を既定実装として提供する。

## 公開 API

- `Perceiver` — `perceive(file, options?): Promise<AvatarSeed>` を持つ interface
- `createOpenAIPerceiver(opts)` — OpenAI Vision API を使った既定実装
- `PerceiveError` — `kind: "network" | "parse" | "validate" | "auth" | "cancelled"` を持つエラー

## 使用例

```ts
import { createOpenAIPerceiver } from "@edv4h/alter-ego-perceive";

const perceiver = createOpenAIPerceiver({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  schema, // AvatarSchema
});

const seed = await perceiver.perceive(file, { signal: ctrl.signal });
```
````

- [ ] **Step 7: 依存をインストール + zod version 確認 + ビルド + typecheck**

```bash
pnpm install
# zod は ~3.23.0 で patch 互換のみ許可。 z.record(KeySchema, ValueSchema) 2 引数 API を使うため。
# minor が上がって API 挙動が変わった場合は Task 3 のテストが落ちて検知できる。
pnpm -r --filter @edv4h/alter-ego-perceive list zod
pnpm -r --filter @edv4h/alter-ego-perceive run build
pnpm -r --filter @edv4h/alter-ego-perceive run typecheck
```

Expected: zod が 3.23.x の patch、 build + typecheck PASS、 `packages/perceive/dist/index.js` が生成される

**Note**: もし Task 3 で `z.record(z.string(), Schema)` が型エラーになる場合は、 zod v3.23 では `z.record(Schema)` (1 引数、 key は string 固定) にフォールバックする。 動作は等価。

- [ ] **Step 8: commit**

```bash
git add packages/perceive pnpm-lock.yaml
git commit -m "🎉 feat: scaffold @edv4h/alter-ego-perceive package"
```

---

## Task 2: AvatarSeed 型 + PerceiveError + Perceiver interface

**Files:**
- Create: `packages/perceive/src/types.ts`
- Create: `packages/perceive/src/errors.ts`
- Create: `packages/perceive/src/perceiver.ts`
- Create: `packages/perceive/src/errors.test.ts`
- Modify: `packages/perceive/src/index.ts`

- [ ] **Step 1: types.ts を作成**

```ts
/**
 * AI 知覚層の出力。 写真から推定したアバターの初期構成。
 * 既存 alter-ego の state (selections + slotTransforms) と互換。
 * 全フィールド optional: AI が省略した部分は呼び出し側でデフォルト処理する。
 */
export interface AvatarSeed {
  /** スロットごとのパーツ選択 */
  selections?: Record<string, { partId: string; color?: string }>;
  /** スロットごとの位置・サイズ・回転 (基準値からの差分) */
  slotTransforms?: Record<string, AvatarSlotTransformSeed>;
  /** AI が選定した顕著特徴のメタ情報 (デバッグ・UI 説明用) */
  salientFeatures?: Array<{ slot: string; reason: string }>;
}

export interface AvatarSlotTransformSeed {
  dx?: number;
  dy?: number;
  /** scale は安全側で clamp する: 0.3 〜 3.0 */
  scale?: number;
  /** rotation は deg、 -180 〜 180 で clamp */
  rotation?: number;
}
```

- [ ] **Step 2: errors.ts を作成**

```ts
export type PerceiveErrorKind =
  | "network"
  | "parse"
  | "validate"
  | "auth"
  | "cancelled";

/**
 * Perception 層が throw するエラー。
 * kind で UI 側の分岐 (再試行ボタンを出すか等) を決める。
 */
export class PerceiveError extends Error {
  override readonly name = "PerceiveError";
  constructor(
    public readonly kind: PerceiveErrorKind,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
  }
}
```

- [ ] **Step 3: perceiver.ts を作成**

```ts
import type { AvatarSeed } from "./types.js";

export interface PerceiveOptions {
  /** AbortSignal で fetch をキャンセル可能にする */
  signal?: AbortSignal;
}

export interface Perceiver {
  /**
   * 写真ファイルから AvatarSeed を推定する。
   * 失敗時は PerceiveError を throw する。
   */
  perceive(file: Blob, options?: PerceiveOptions): Promise<AvatarSeed>;
}
```

- [ ] **Step 4: errors.test.ts を作成 (失敗するテスト)**

```ts
import { describe, expect, it } from "vitest";
import { PerceiveError } from "./errors.js";

describe("PerceiveError", () => {
  it("kind と message を保持する", () => {
    const e = new PerceiveError("network", "timeout");
    expect(e.kind).toBe("network");
    expect(e.message).toBe("timeout");
    expect(e.name).toBe("PerceiveError");
  });

  it("cause を保持できる", () => {
    const cause = new Error("inner");
    const e = new PerceiveError("parse", "bad json", cause);
    expect(e.cause).toBe(cause);
  });
});
```

- [ ] **Step 5: テストが PASS することを確認**

```bash
pnpm test packages/perceive
```

Expected: 2/2 passed

- [ ] **Step 6: index.ts を更新して公開**

```ts
export type {
  AvatarSeed,
  AvatarSlotTransformSeed,
} from "./types.js";
export type { Perceiver, PerceiveOptions } from "./perceiver.js";
export { PerceiveError } from "./errors.js";
export type { PerceiveErrorKind } from "./errors.js";
```

- [ ] **Step 7: ビルド + typecheck**

```bash
pnpm -r --filter @edv4h/alter-ego-perceive run build
pnpm -r --filter @edv4h/alter-ego-perceive run typecheck
```

Expected: PASS

- [ ] **Step 8: commit**

```bash
git add packages/perceive/src
git commit -m "✨ feat(perceive): add AvatarSeed / Perceiver / PerceiveError types"
```

---

## Task 3: validateSeed (zod + schema-aware バリデーション)

**Files:**
- Create: `packages/perceive/src/validate.ts`
- Create: `packages/perceive/src/validate.test.ts`
- Modify: `packages/perceive/src/index.ts`
- Modify: `vitest.config.ts`

このタスクの目的: 任意の JSON (AI 出力) を **安全な `AvatarSeed`** に変換する。

- 不正な partId (schema に存在しない) を除外する
- 不正な hex color (`#RRGGBB` 形式以外) を除外する
- transform の数値の正規化:
  - `scale`: `<= 0` は **除外** (パーツを「消す」意図と区別がつかないため安全側で破棄)、 `> 0` のみ 0.3〜3.0 で clamp
  - `rotation`: -180〜180 で clamp
  - `dx` / `dy`: そのまま (上限なしで base placement 側で吸収)
- 全 selection が捨てられた結果 `selections` が空オブジェクトになれば `undefined` にして「seed なし」を表現

- [ ] **Step 1: vitest.config.ts に alias を追加**

`vitest.config.ts` の alias オブジェクトに 1 行追加する:

```ts
const alias = {
  "@edv4h/alter-ego-schema": r("./packages/schema/src/index.ts"),
  "@edv4h/alter-ego-core": r("./packages/core/src/index.ts"),
  "@edv4h/alter-ego-perceive": r("./packages/perceive/src/index.ts"), // 追加
};
```

happy-dom プロジェクトの include に `packages/perceive/src/**/{resize,openai}.test.ts` を追加 (Task 4/5 で使う):

```ts
{
  resolve: { alias },
  test: {
    name: "happy-dom",
    include: [
      "plugins/renderer-svg/src/**/*.test.ts",
      "packages/perceive/src/**/{resize,openai}.test.ts", // 追加
    ],
    environment: "happy-dom",
    globals: false,
  },
},
```

node 環境の include はそのまま (`packages/*/src/**/*.test.ts` で perceive の他のテストを拾う)。

- [ ] **Step 2: validate.test.ts を作成 (失敗するテスト)**

```ts
import { describe, expect, it } from "vitest";
import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import { validateSeed } from "./validate.js";

const schema: AvatarSchema = {
  schemaVersion: "1.0",
  metadata: { name: "t" },
  slots: [
    { id: "face", name: "顔", zIndex: 10, required: true },
    { id: "hair_front", name: "髪 (前)", zIndex: 45 },
  ],
  parts: [
    { id: "face-01", slotId: "face", name: "F1", assetId: "a-face-01" },
    { id: "hair-front-01", slotId: "hair_front", name: "H1", assetId: "a-hf-01" },
  ],
  assets: [
    { id: "a-face-01", kind: "svg", src: "face-01.svg" },
    { id: "a-hf-01", kind: "svg", src: "hair-front-01.svg" },
  ],
};

describe("validateSeed", () => {
  it("空オブジェクトを {} で受け入れる", () => {
    expect(validateSeed({}, schema)).toEqual({});
  });

  it("正常な selections をそのまま通す", () => {
    const seed = validateSeed(
      { selections: { face: { partId: "face-01", color: "#ffeebb" } } },
      schema,
    );
    expect(seed.selections).toEqual({
      face: { partId: "face-01", color: "#ffeebb" },
    });
  });

  it("schema に無い partId は selection ごと除外", () => {
    const seed = validateSeed(
      {
        selections: {
          face: { partId: "face-99" },
          hair_front: { partId: "hair-front-01" },
        },
      },
      schema,
    );
    expect(seed.selections).toEqual({
      hair_front: { partId: "hair-front-01" },
    });
  });

  it("slotId と partId.slotId が一致しない selection は除外", () => {
    const seed = validateSeed(
      { selections: { face: { partId: "hair-front-01" } } },
      schema,
    );
    expect(seed.selections).toBeUndefined();
  });

  it("不正な color (#RRGGBB でない) は color のみ落とし partId は残す", () => {
    const seed = validateSeed(
      { selections: { face: { partId: "face-01", color: "red" } } },
      schema,
    );
    expect(seed.selections).toEqual({ face: { partId: "face-01" } });
  });

  it("scale を 0.3〜3.0 に clamp", () => {
    const seed = validateSeed(
      { slotTransforms: { face: { scale: 5 } } },
      schema,
    );
    expect(seed.slotTransforms).toEqual({ face: { scale: 3 } });
  });

  it("scale <= 0 は除外 (パーツ消失意図と区別不能なため)", () => {
    const seed = validateSeed(
      {
        slotTransforms: {
          face: { scale: 0, dx: 10 },
          hair_front: { scale: -1 },
        },
      },
      schema,
    );
    // face は dx だけ残る、 hair_front は scale 1 件しか無いので空 transform になる
    expect(seed.slotTransforms?.face).toEqual({ dx: 10 });
    expect(seed.slotTransforms?.hair_front).toEqual({});
  });

  it("rotation を -180〜180 に clamp", () => {
    const seed = validateSeed(
      { slotTransforms: { face: { rotation: 999 } } },
      schema,
    );
    expect(seed.slotTransforms).toEqual({ face: { rotation: 180 } });
  });

  it("schema に無い slot の slotTransforms を除外", () => {
    const seed = validateSeed(
      { slotTransforms: { unknown_slot: { dx: 10 } } },
      schema,
    );
    expect(seed.slotTransforms).toBeUndefined();
  });

  it("型が破滅的に違う (null) なら {} を返す", () => {
    expect(validateSeed(null, schema)).toEqual({});
    expect(validateSeed("oops", schema)).toEqual({});
    expect(validateSeed(42, schema)).toEqual({});
  });

  it("salientFeatures は配列ならそのまま通す", () => {
    const seed = validateSeed(
      { salientFeatures: [{ slot: "face", reason: "丸顔" }] },
      schema,
    );
    expect(seed.salientFeatures).toEqual([{ slot: "face", reason: "丸顔" }]);
  });
});
```

- [ ] **Step 3: validate.ts を実装**

```ts
import { z } from "zod";
import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import type { AvatarSeed, AvatarSlotTransformSeed } from "./types.js";

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const SelectionEntrySchema = z.object({
  partId: z.string(),
  color: z.string().optional(),
});

const SlotTransformSchema = z.object({
  dx: z.number().finite().optional(),
  dy: z.number().finite().optional(),
  scale: z.number().finite().optional(),
  rotation: z.number().finite().optional(),
});

const SeedSchema = z
  .object({
    selections: z.record(z.string(), SelectionEntrySchema).optional(),
    slotTransforms: z.record(z.string(), SlotTransformSchema).optional(),
    salientFeatures: z
      .array(z.object({ slot: z.string(), reason: z.string() }))
      .optional(),
  })
  .passthrough();

const SCALE_MIN = 0.3;
const SCALE_MAX = 3.0;
const ROTATION_MIN = -180;
const ROTATION_MAX = 180;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function sanitizeTransform(
  t: AvatarSlotTransformSeed,
): AvatarSlotTransformSeed {
  const out: AvatarSlotTransformSeed = {};
  if (t.dx !== undefined) out.dx = t.dx;
  if (t.dy !== undefined) out.dy = t.dy;
  // scale: <= 0 は除外 (パーツ消失意図と区別不能、 安全側で破棄)、 > 0 のみ clamp
  if (t.scale !== undefined && t.scale > 0)
    out.scale = clamp(t.scale, SCALE_MIN, SCALE_MAX);
  if (t.rotation !== undefined)
    out.rotation = clamp(t.rotation, ROTATION_MIN, ROTATION_MAX);
  return out;
}

/**
 * 任意の JSON 入力を安全な AvatarSeed に変換する。
 * - 構造が破滅的に違えば {} を返す
 * - schema に無い partId / slot は除外
 * - 不正な color (#RRGGBB でない) は捨てる (partId は残す)
 * - transform は範囲外なら clamp
 * - 全 selection / slotTransform が落ちて空になった場合は undefined にする
 */
export function validateSeed(
  input: unknown,
  schema: AvatarSchema,
): AvatarSeed {
  const parsed = SeedSchema.safeParse(input);
  if (!parsed.success) return {};
  const raw = parsed.data;

  const seed: AvatarSeed = {};

  if (raw.selections) {
    const sel: NonNullable<AvatarSeed["selections"]> = {};
    for (const [slotId, entry] of Object.entries(raw.selections)) {
      const slot = schema.slots.find((s) => s.id === slotId);
      if (!slot) continue;
      const part = schema.parts.find(
        (p) => p.id === entry.partId && p.slotId === slotId,
      );
      if (!part) continue;
      sel[slotId] = {
        partId: entry.partId,
        ...(entry.color && HEX_COLOR_RE.test(entry.color)
          ? { color: entry.color }
          : {}),
      };
    }
    if (Object.keys(sel).length > 0) seed.selections = sel;
  }

  if (raw.slotTransforms) {
    const tr: NonNullable<AvatarSeed["slotTransforms"]> = {};
    for (const [slotId, t] of Object.entries(raw.slotTransforms)) {
      if (!schema.slots.some((s) => s.id === slotId)) continue;
      tr[slotId] = sanitizeTransform(t);
    }
    if (Object.keys(tr).length > 0) seed.slotTransforms = tr;
  }

  if (raw.salientFeatures && raw.salientFeatures.length > 0) {
    seed.salientFeatures = raw.salientFeatures;
  }

  return seed;
}
```

- [ ] **Step 4: テストを実行**

```bash
pnpm test packages/perceive
```

Expected: 13/13 passed (errors.test 2 + validate.test 11)

- [ ] **Step 5: index.ts に validateSeed を追加**

```ts
export { validateSeed } from "./validate.js";
```

(Task 2 の export 群の末尾に追加)

- [ ] **Step 6: ビルド + typecheck**

```bash
pnpm -r --filter @edv4h/alter-ego-perceive run build
pnpm -r --filter @edv4h/alter-ego-perceive run typecheck
```

Expected: PASS

- [ ] **Step 7: commit**

```bash
git add packages/perceive vitest.config.ts pnpm-lock.yaml
git commit -m "✨ feat(perceive): add validateSeed with schema-aware sanitization"
```

---

## Task 4: resize (写真の long-edge 1024px 縮小)

**Files:**
- Create: `packages/perceive/src/resize.ts`
- Create: `packages/perceive/src/resize.test.ts`
- Modify: `packages/perceive/src/index.ts`

このタスクの目的: 5MB 上限の写真をクライアント側で `<canvas>` 経由で **long-edge 1024px** に縮小し、 OpenAI に送る base64 文字列のサイズを抑える。

**テスト戦略上の注意**: happy-dom v15 は `HTMLCanvasElement.toBlob` と `Image` を完全実装していない (toBlob は stub、 onload は実画像をデコードしない)。 そのため `resizeImageBlob` 本体の vitest テストは書かず、 **純関数 `calcTargetSize` と `blobToDataUrl` のみを検証** する。 `resizeImageBlob` 本体は Task 10 Step 5 の手動 E2E で動作確認する。 これは「テスト工数を意図的に削る」のではなく、 ブラウザ環境必須の機能を node テストで擬似化しても得られる保証が薄いため。

- [ ] **Step 1: resize.test.ts を作成 (失敗するテスト)**

```ts
import { describe, expect, it } from "vitest";
import { blobToDataUrl, calcTargetSize } from "./resize.js";

describe("blobToDataUrl", () => {
  it("Blob を data URL に変換する", async () => {
    const blob = new Blob(["hello"], { type: "text/plain" });
    const url = await blobToDataUrl(blob);
    expect(url.startsWith("data:text/plain")).toBe(true);
    expect(url).toContain("base64,");
  });
});

describe("calcTargetSize", () => {
  it("long-edge が limit 以下ならそのまま", () => {
    expect(calcTargetSize(800, 600, 1024)).toEqual({ width: 800, height: 600 });
  });

  it("横長は width=limit、 height を比率縮小", () => {
    expect(calcTargetSize(2048, 1024, 1024)).toEqual({
      width: 1024,
      height: 512,
    });
  });

  it("縦長は height=limit、 width を比率縮小", () => {
    expect(calcTargetSize(1024, 2048, 1024)).toEqual({
      width: 512,
      height: 1024,
    });
  });

  it("同じ辺長なら limit にスナップ", () => {
    expect(calcTargetSize(2048, 2048, 1024)).toEqual({
      width: 1024,
      height: 1024,
    });
  });
});
```

- [ ] **Step 2: resize.ts を実装**

```ts
const MAX_LONG_EDGE = 1024;
const OUTPUT_MIME = "image/jpeg";
const OUTPUT_QUALITY = 0.9;

/**
 * long-edge を limit に揃える target size を計算する。
 * 既に limit 以下なら元のサイズをそのまま返す。
 */
export function calcTargetSize(
  width: number,
  height: number,
  limit: number = MAX_LONG_EDGE,
): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= limit) return { width, height };
  const ratio = limit / long;
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}

/** Blob を data URL (base64) に変換する。 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("FileReader returned non-string"));
    reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
    reader.readAsDataURL(blob);
  });
}

/**
 * 画像 Blob を long-edge 1024px に縮小して新しい Blob を返す。
 * 失敗時は元の Blob を返す (フォールバック)。
 */
export async function resizeImageBlob(file: Blob): Promise<Blob> {
  try {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const { width, height } = calcTargetSize(
        img.naturalWidth,
        img.naturalHeight,
      );
      if (width === img.naturalWidth && height === img.naturalHeight) {
        return file;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(img, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, OUTPUT_MIME, OUTPUT_QUALITY),
      );
      return blob ?? file;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return file;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}
```

- [ ] **Step 3: テストを実行**

```bash
pnpm test packages/perceive
```

Expected: 18/18 passed (前回 13 + resize 5)

- [ ] **Step 4: index.ts に追加**

```ts
export { blobToDataUrl, calcTargetSize, resizeImageBlob } from "./resize.js";
```

- [ ] **Step 5: ビルド + typecheck**

```bash
pnpm -r --filter @edv4h/alter-ego-perceive run build
pnpm -r --filter @edv4h/alter-ego-perceive run typecheck
```

Expected: PASS

- [ ] **Step 6: commit**

```bash
git add packages/perceive
git commit -m "✨ feat(perceive): add image resize to long-edge 1024px"
```

---

## Task 5: createOpenAIPerceiver

**Files:**
- Create: `packages/perceive/src/openai.ts`
- Create: `packages/perceive/src/openai.test.ts`
- Modify: `packages/perceive/src/index.ts`

このタスクの目的: OpenAI Vision API を `fetch` で叩き、 結果を `validateSeed` で安全な `AvatarSeed` に変換する `Perceiver` 実装。

### プロンプト設計

- system プロンプト: 「写真の人物を識別する顕著特徴 2-3 を選び、 それを最も強調する partId / color / slotTransforms を選んでください。 残りはデフォルトで構いません。」
- user メッセージ: schema から生成した「利用可能な slot 一覧 + 各 slot の partId 候補と name」 + 画像 (data URL)
- response_format: `{ type: "json_object" }`

**OpenAI 制約**: `response_format: { type: "json_object" }` mode は **messages のどこかに文字列 "json" を含む必要がある** (含まないと API が 400 を返す)。 SYSTEM_PROMPT と buildUserPrompt の両方に「JSON」を複数回入れているのでクリアしているが、 将来プロンプトを編集する際は必ず「JSON」の語を残すこと。

- [ ] **Step 1: openai.test.ts を作成 (失敗するテスト)**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import { createOpenAIPerceiver } from "./openai.js";
import { PerceiveError } from "./errors.js";

const schema: AvatarSchema = {
  schemaVersion: "1.0",
  metadata: { name: "t" },
  slots: [
    { id: "face", name: "顔", zIndex: 10, required: true },
    { id: "hair_front", name: "髪 (前)", zIndex: 45 },
  ],
  parts: [
    { id: "face-01", slotId: "face", name: "F1", assetId: "a-face-01" },
    { id: "hair-front-01", slotId: "hair_front", name: "H1", assetId: "a-hf-01" },
  ],
  assets: [
    { id: "a-face-01", kind: "svg", src: "face-01.svg" },
    { id: "a-hf-01", kind: "svg", src: "hair-front-01.svg" },
  ],
};

const dummyBlob = () => new Blob(["x"], { type: "image/jpeg" });

const mockOkResponse = (json: unknown): Response =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(json) } }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

describe("createOpenAIPerceiver", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("成功時に AvatarSeed を返す", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockOkResponse({
        selections: { face: { partId: "face-01" } },
      }),
    );
    const perceiver = createOpenAIPerceiver({ apiKey: "sk-test", schema });
    const seed = await perceiver.perceive(dummyBlob());
    expect(seed.selections).toEqual({ face: { partId: "face-01" } });
  });

  it("401 で auth エラーを投げる", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("unauth", { status: 401 }));
    const perceiver = createOpenAIPerceiver({ apiKey: "bad", schema });
    await expect(perceiver.perceive(dummyBlob())).rejects.toMatchObject({
      kind: "auth",
    });
  });

  it("500 系で network エラーを投げる", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("oops", { status: 500 }));
    const perceiver = createOpenAIPerceiver({ apiKey: "sk", schema });
    await expect(perceiver.perceive(dummyBlob())).rejects.toMatchObject({
      kind: "network",
    });
  });

  it("レスポンス content が JSON でないと parse エラー", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "not json" } }] }),
        { status: 200 },
      ),
    );
    const perceiver = createOpenAIPerceiver({ apiKey: "sk", schema });
    await expect(perceiver.perceive(dummyBlob())).rejects.toMatchObject({
      kind: "parse",
    });
  });

  it("空 seed (schema に無い partId だけ) なら validate エラー", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockOkResponse({ selections: { face: { partId: "face-99" } } }),
    );
    const perceiver = createOpenAIPerceiver({ apiKey: "sk", schema });
    await expect(perceiver.perceive(dummyBlob())).rejects.toMatchObject({
      kind: "validate",
    });
  });

  it("AbortSignal を fetch に渡し、 abort 時は cancelled エラー", async () => {
    const controller = new AbortController();
    fetchSpy.mockImplementationOnce(
      (_url, init) =>
        new Promise((_, reject) => {
          (init?.signal as AbortSignal).addEventListener("abort", () => {
            const err = new DOMException("Aborted", "AbortError");
            reject(err);
          });
        }),
    );
    const perceiver = createOpenAIPerceiver({ apiKey: "sk", schema });
    const p = perceiver.perceive(dummyBlob(), { signal: controller.signal });
    controller.abort();
    await expect(p).rejects.toBeInstanceOf(PerceiveError);
    await expect(p).rejects.toMatchObject({ kind: "cancelled" });
  });

  it("既定モデルは gpt-4o", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockOkResponse({ selections: { face: { partId: "face-01" } } }),
    );
    const perceiver = createOpenAIPerceiver({ apiKey: "sk", schema });
    await perceiver.perceive(dummyBlob());
    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body.model).toBe("gpt-4o");
  });

  it("opts.model で override 可能", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockOkResponse({ selections: { face: { partId: "face-01" } } }),
    );
    const perceiver = createOpenAIPerceiver({
      apiKey: "sk",
      schema,
      model: "gpt-5",
    });
    await perceiver.perceive(dummyBlob());
    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body.model).toBe("gpt-5");
  });
});
```

- [ ] **Step 2: openai.ts を実装**

```ts
import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import { PerceiveError } from "./errors.js";
import type { Perceiver, PerceiveOptions } from "./perceiver.js";
import { blobToDataUrl, resizeImageBlob } from "./resize.js";
import type { AvatarSeed } from "./types.js";
import { validateSeed } from "./validate.js";

const DEFAULT_MODEL = "gpt-4o";
const DEFAULT_ENDPOINT = "https://api.openai.com/v1/chat/completions";

const SYSTEM_PROMPT = [
  "あなたはアバター生成アシスタントです。",
  "写真の人物を識別する顕著特徴を 2〜3 個選び、",
  "それを最も強調する partId と color、 必要なら slotTransforms を出力してください。",
  "残りはデフォルトで構いません。 出力は JSON のみで、 説明文を含めないでください。",
  "schema に存在しない partId は使わないでください。",
].join(" ");

export interface OpenAIPerceiverOptions {
  apiKey: string;
  /** perceiver が認識する slot/partId の根拠 */
  schema: AvatarSchema;
  /** 既定 "gpt-4o" */
  model?: string;
  /** 既定 OpenAI 標準エンドポイント */
  endpoint?: string;
}

export function createOpenAIPerceiver(
  opts: OpenAIPerceiverOptions,
): Perceiver {
  const { apiKey, schema } = opts;
  const model = opts.model ?? DEFAULT_MODEL;
  const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;

  return {
    async perceive(file: Blob, options?: PerceiveOptions): Promise<AvatarSeed> {
      try {
        const resized = await resizeImageBlob(file);
        const dataUrl = await blobToDataUrl(resized);
        const userText = buildUserPrompt(schema);

        const body = {
          model,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "text", text: userText },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            },
          ],
        };

        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal: options?.signal,
        });

        if (res.status === 401) {
          throw new PerceiveError("auth", "OpenAI returned 401");
        }
        if (!res.ok) {
          throw new PerceiveError(
            "network",
            `OpenAI returned ${res.status}`,
          );
        }

        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = json.choices?.[0]?.message?.content;
        if (!content) {
          throw new PerceiveError("parse", "OpenAI response missing content");
        }

        let raw: unknown;
        try {
          raw = JSON.parse(content);
        } catch (e) {
          throw new PerceiveError("parse", "content is not JSON", e);
        }

        const seed = validateSeed(raw, schema);
        if (
          !seed.selections &&
          !seed.slotTransforms &&
          !seed.salientFeatures
        ) {
          throw new PerceiveError(
            "validate",
            "seed is empty after validation",
          );
        }
        return seed;
      } catch (e) {
        if (e instanceof PerceiveError) throw e;
        if (e instanceof DOMException && e.name === "AbortError") {
          throw new PerceiveError("cancelled", "request aborted", e);
        }
        if (e instanceof Error && /abort/i.test(e.message)) {
          throw new PerceiveError("cancelled", "request aborted", e);
        }
        throw new PerceiveError(
          "network",
          e instanceof Error ? e.message : String(e),
          e,
        );
      }
    },
  };
}

/**
 * schema から利用可能な slot + partId 一覧をプロンプトに組み込む。
 * 不明な partId を出さないよう、 各 slot の選択肢を明示する。
 */
function buildUserPrompt(schema: AvatarSchema): string {
  const lines: string[] = [
    "次の写真からアバターの構成を推定してください。",
    "schema に存在する以下の slot / partId のみを使ってください。",
    "",
  ];
  for (const slot of schema.slots) {
    const parts = schema.parts
      .filter((p) => p.slotId === slot.id)
      .map((p) => `${p.id} (${p.name})`);
    lines.push(`- ${slot.id} (${slot.name}): ${parts.join(", ")}`);
  }
  lines.push("");
  lines.push("出力 JSON スキーマ:");
  lines.push(
    "{ selections?: Record<slotId, { partId: string, color?: '#RRGGBB' }>,",
  );
  lines.push(
    "  slotTransforms?: Record<slotId, { dx?: number, dy?: number, scale?: number, rotation?: number }>,",
  );
  lines.push("  salientFeatures?: Array<{ slot: string, reason: string }> }");
  return lines.join("\n");
}
```

- [ ] **Step 3: テストを実行**

```bash
pnpm test packages/perceive
```

Expected: 26/26 passed (前回 18 + openai 8)

- [ ] **Step 4: index.ts に追加**

```ts
export { createOpenAIPerceiver } from "./openai.js";
export type { OpenAIPerceiverOptions } from "./openai.js";
```

- [ ] **Step 5: ビルド + typecheck**

```bash
pnpm -r --filter @edv4h/alter-ego-perceive run build
pnpm -r --filter @edv4h/alter-ego-perceive run typecheck
```

Expected: PASS

- [ ] **Step 6: commit**

```bash
git add packages/perceive
git commit -m "✨ feat(perceive): add createOpenAIPerceiver (gpt-4o default)"
```

---

## Task 6: apps/react-web に perceive 依存を追加 + env 設定

**Files:**
- Modify: `apps/react-web/package.json`
- Create: `apps/react-web/.env.example`
- Modify: `apps/react-web/src/vite-env.d.ts`

- [ ] **Step 1: package.json の dependencies に追加**

```json
"dependencies": {
  "@edv4h/alter-ego-core": "workspace:*",
  "@edv4h/alter-ego-perceive": "workspace:*",
  "@edv4h/alter-ego-plugin-loader-http": "workspace:*",
  "@edv4h/alter-ego-plugin-renderer-svg": "workspace:*",
  "react": "^19.0.0",
  "react-dom": "^19.0.0"
}
```

- [ ] **Step 2: pnpm install で workspace 反映**

```bash
pnpm install
```

Expected: lockfile が更新される。 `apps/react-web/node_modules/@edv4h/alter-ego-perceive` が symlink される

- [ ] **Step 3: .env.example を作成**

```
# OpenAI Vision API key — Photo to Avatar 機能で使う
# .env.local にコピーして自分のキーを入れる
#
# ⚠️  セキュリティ警告 (重要):
# - VITE_ prefix の env は `pnpm build` の出力 (dist/) に
#   **平文で焼き付けられる** ため、 dist を public ホスティング
#   (GitHub Pages / Vercel preview 等) にデプロイすると API キーが漏出する。
# - この機能は PoC / ローカル開発専用。 本番運用ではサーバ経由
#   (バックエンド proxy) に切り替えること。
# - 本番デプロイ前に必ず .env.local を削除し、 dist を grep して
#   "sk-" 等のキー文字列が残っていないか確認する。
#
VITE_OPENAI_API_KEY=

# 既定モデル (省略時 gpt-4o)
# VITE_OPENAI_MODEL=gpt-4o
```

- [ ] **Step 4: vite-env.d.ts を確認・更新**

`apps/react-web/src/vite-env.d.ts` の中身を以下に置き換える:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENAI_API_KEY?: string;
  readonly VITE_OPENAI_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 5: typecheck**

```bash
pnpm -r --filter @alter-ego/app-react-web run typecheck
```

Expected: PASS

- [ ] **Step 6: commit**

```bash
git add apps/react-web/package.json apps/react-web/.env.example apps/react-web/src/vite-env.d.ts pnpm-lock.yaml
git commit -m "🔧 chore(app): wire @edv4h/alter-ego-perceive + VITE_OPENAI_API_KEY env"
```

---

## Task 7: applySeedToEngine ヘルパ (完全上書き semantics)

**Files:**
- Create: `apps/react-web/src/photo-to-avatar.ts`
- Create: `apps/react-web/src/photo-to-avatar.test.ts`
- Modify: `vitest.config.ts`

このタスクの目的: `AvatarSeed` を engine と React state に完全上書き反映する。

**完全上書きの正確な定義** (確定事項):
- required slot (face / mouth / eye_left / eye_right / eyebrow_left / eyebrow_right): seed の partId に置換。 seed に該当 slot が無ければ schema の **先頭 part** に戻す
- optional slot (hair_back / hair_front / accessory_back / accessory_front / glasses / nose): seed に該当 slot があれば select、 無ければ deselect (required check は engine が内部で行う)
- slotTransforms: **全 slot で IDENTITY にリセット → seed の transform をマージ**
- color: seed の selection に color があれば設定、 無ければ既存色は捨てる (上書きなので)

- [ ] **Step 1: vitest.config.ts の happy-dom include に apps/react-web を追加**

```ts
{
  resolve: { alias },
  test: {
    name: "happy-dom",
    include: [
      "plugins/renderer-svg/src/**/*.test.ts",
      "packages/perceive/src/**/{resize,openai}.test.ts",
      "apps/react-web/src/**/*.test.ts", // 追加
    ],
    environment: "happy-dom",
    globals: false,
  },
},
```

- [ ] **Step 2: photo-to-avatar.test.ts を作成 (失敗するテスト)**

**Note**: テスト schema は **本番 `avatar.schema.json` と同じ required slot 群** (`face / mouth / eye_left / eye_right / eyebrow_left / eyebrow_right`) を含む。 本番 schema と乖離して「テストは通るが本番で `Unknown slot` が出る」事故を防ぐ。

```ts
import { describe, expect, it } from "vitest";
import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import type { AvatarEngine } from "@edv4h/alter-ego-core";
import { createAvatarEngine } from "@edv4h/alter-ego-core";
import type { AvatarSeed } from "@edv4h/alter-ego-perceive";
import {
  applySeedToEngine,
  IDENTITY_TRANSFORM,
  type SlotTransform,
} from "./photo-to-avatar.js";

// 本番 schema の required slot 群を模倣 (face / mouth / eye_left / eye_right / eyebrow_left / eyebrow_right)
// + optional の hair_front を加えて「optional は seed に無ければ deselect」も同時にテストできる形に。
const schema: AvatarSchema = {
  schemaVersion: "1.0",
  metadata: { name: "t" },
  slots: [
    { id: "face", name: "顔", zIndex: 10, required: true },
    { id: "mouth", name: "口", zIndex: 15, required: true },
    { id: "eye_left", name: "目 (左)", zIndex: 30, required: true },
    { id: "eye_right", name: "目 (右)", zIndex: 20, required: true },
    { id: "eyebrow_left", name: "眉 (左)", zIndex: 40, required: true },
    { id: "eyebrow_right", name: "眉 (右)", zIndex: 35, required: true },
    { id: "hair_front", name: "髪 (前)", zIndex: 45 },
  ],
  parts: [
    { id: "face-01", slotId: "face", name: "F1", assetId: "a-face-01" },
    { id: "face-02", slotId: "face", name: "F2", assetId: "a-face-02" },
    { id: "mouth-01", slotId: "mouth", name: "M1", assetId: "a-m-01" },
    { id: "eye-left-01", slotId: "eye_left", name: "EL1", assetId: "a-el-01" },
    { id: "eye-right-01", slotId: "eye_right", name: "ER1", assetId: "a-er-01" },
    { id: "eyebrow-left-01", slotId: "eyebrow_left", name: "BL1", assetId: "a-bl-01" },
    { id: "eyebrow-right-01", slotId: "eyebrow_right", name: "BR1", assetId: "a-br-01" },
    { id: "hair-front-01", slotId: "hair_front", name: "H1", assetId: "a-hf-01" },
  ],
  assets: [
    { id: "a-face-01", kind: "svg", src: "face-01.svg" },
    { id: "a-face-02", kind: "svg", src: "face-02.svg" },
    { id: "a-m-01", kind: "svg", src: "mouth-01.svg" },
    { id: "a-el-01", kind: "svg", src: "eye-left-01.svg" },
    { id: "a-er-01", kind: "svg", src: "eye-right-01.svg" },
    { id: "a-bl-01", kind: "svg", src: "eyebrow-left-01.svg" },
    { id: "a-br-01", kind: "svg", src: "eyebrow-right-01.svg" },
    { id: "a-hf-01", kind: "svg", src: "hair-front-01.svg" },
  ],
};

const makeEngine = (): AvatarEngine =>
  createAvatarEngine({ schema, plugins: [] });

/** test 用に React state を模倣する updater */
const makeCapture = () => {
  let current: Record<string, SlotTransform> = {};
  const set = (
    next:
      | Record<string, SlotTransform>
      | ((prev: Record<string, SlotTransform>) => Record<string, SlotTransform>),
  ) => {
    current = typeof next === "function" ? next(current) : next;
  };
  return { set, get: () => current, seed: (v: Record<string, SlotTransform>) => { current = v; } };
};

describe("applySeedToEngine", () => {
  it("required slot は seed の partId に置換される", () => {
    const engine = makeEngine();
    expect(engine.state.selections.face?.partId).toBe("face-01");

    const seed: AvatarSeed = {
      selections: { face: { partId: "face-02" } },
    };
    const cap = makeCapture();
    applySeedToEngine(engine, seed, cap.set);
    expect(engine.state.selections.face?.partId).toBe("face-02");
  });

  it("optional slot は seed に無ければ deselect される", () => {
    const engine = makeEngine();
    engine.select({ slot: "hair_front", part: "hair-front-01" });
    expect(engine.state.selections.hair_front).toBeDefined();

    applySeedToEngine(engine, {}, makeCapture().set);
    expect(engine.state.selections.hair_front).toBeUndefined();
  });

  it("required slot が seed に無ければ schema の先頭 part に戻る", () => {
    const engine = makeEngine();
    engine.select({ slot: "face", part: "face-02", color: "#abcdef" });
    expect(engine.state.selections.face?.partId).toBe("face-02");

    applySeedToEngine(engine, {}, makeCapture().set);
    expect(engine.state.selections.face?.partId).toBe("face-01");
    expect(engine.state.selections.face?.color).toBeUndefined();
  });

  it("seed が一部 required slot のみ埋め、 残りの required は schema 先頭に戻る", () => {
    const engine = makeEngine();
    // 事前に face と mouth を 02 系に変える (mouth は part が 1 つしかないので face のみ変える)
    engine.select({ slot: "face", part: "face-02" });

    // seed は eye_left だけ指定。 face / mouth / eye_right / eyebrow_* は schema 先頭に戻るべき
    applySeedToEngine(
      engine,
      { selections: { eye_left: { partId: "eye-left-01" } } },
      makeCapture().set,
    );
    expect(engine.state.selections.face?.partId).toBe("face-01");
    expect(engine.state.selections.mouth?.partId).toBe("mouth-01");
    expect(engine.state.selections.eye_left?.partId).toBe("eye-left-01");
    expect(engine.state.selections.eye_right?.partId).toBe("eye-right-01");
    expect(engine.state.selections.eyebrow_left?.partId).toBe("eyebrow-left-01");
    expect(engine.state.selections.eyebrow_right?.partId).toBe("eyebrow-right-01");
  });

  it("seed の color が selection に反映される", () => {
    const engine = makeEngine();
    applySeedToEngine(
      engine,
      { selections: { face: { partId: "face-01", color: "#ffeebb" } } },
      makeCapture().set,
    );
    expect(engine.state.selections.face?.color).toBe("#ffeebb");
  });

  it("slotTransforms は IDENTITY にリセット → seed のものをマージ", () => {
    const engine = makeEngine();
    const cap = makeCapture();
    cap.seed({ face: { dx: 99, dy: 0, scale: 1, rotation: 0 } });
    applySeedToEngine(
      engine,
      { slotTransforms: { face: { scale: 1.2 } } },
      cap.set,
    );
    expect(cap.get().face).toEqual({
      ...IDENTITY_TRANSFORM,
      scale: 1.2,
    });
  });

  it("seed.slotTransforms が無ければ transforms は空にリセット", () => {
    const engine = makeEngine();
    const cap = makeCapture();
    cap.seed({ face: { dx: 10, dy: 10, scale: 2, rotation: 30 } });
    applySeedToEngine(engine, {}, cap.set);
    expect(cap.get()).toEqual({});
  });
});
```

- [ ] **Step 3: photo-to-avatar.ts を実装**

```ts
import type { AvatarEngine } from "@edv4h/alter-ego-core";
import type { AvatarSeed } from "@edv4h/alter-ego-perceive";

/** apps/react-web 側で使う slotTransform の形 */
export interface SlotTransform {
  dx: number;
  dy: number;
  scale: number;
  rotation: number;
}

export const IDENTITY_TRANSFORM: SlotTransform = {
  dx: 0,
  dy: 0,
  scale: 1,
  rotation: 0,
};

export type SlotTransformsUpdater = (
  next:
    | Record<string, SlotTransform>
    | ((prev: Record<string, SlotTransform>) => Record<string, SlotTransform>),
) => void;

/**
 * AvatarSeed を engine の selections と外部の slotTransforms 状態に完全上書き反映する。
 *
 * 完全上書きの定義:
 * - required slot: seed の partId に置換、 seed に無ければ schema の先頭 part に戻す
 * - optional slot: seed にあれば select、 無ければ deselect
 * - slotTransforms: 全 slot を IDENTITY にリセット → seed のものをマージ
 * - color: seed の color があれば設定、 無ければ既存色を捨てる
 */
export function applySeedToEngine(
  engine: AvatarEngine,
  seed: AvatarSeed,
  setSlotTransforms: SlotTransformsUpdater,
): void {
  const schema = engine.schema;
  const seedSelections = seed.selections ?? {};

  for (const slot of schema.slots) {
    const sel = seedSelections[slot.id];
    if (sel) {
      engine.select({
        slot: slot.id,
        part: sel.partId,
        ...(sel.color ? { color: sel.color } : {}),
      });
      continue;
    }
    if (slot.required) {
      // seed に無い required slot は schema の先頭 part に戻す
      const firstPart = schema.parts.find((p) => p.slotId === slot.id);
      if (firstPart) {
        engine.select({ slot: slot.id, part: firstPart.id });
      }
    } else {
      // optional slot は deselect (要素自体を消す)
      if (engine.state.selections[slot.id]) {
        engine.deselect(slot.id);
      }
    }
  }

  // slotTransforms は全リセット → seed のものをマージ
  const nextTransforms: Record<string, SlotTransform> = {};
  if (seed.slotTransforms) {
    for (const [slotId, t] of Object.entries(seed.slotTransforms)) {
      nextTransforms[slotId] = { ...IDENTITY_TRANSFORM, ...t };
    }
  }
  setSlotTransforms(nextTransforms);
}
```

- [ ] **Step 4: テストを実行**

```bash
pnpm test apps/react-web
```

Expected: 7/7 passed

- [ ] **Step 5: commit**

```bash
git add apps/react-web/src/photo-to-avatar.ts apps/react-web/src/photo-to-avatar.test.ts vitest.config.ts
git commit -m "✨ feat(app): add applySeedToEngine helper (full-overwrite semantics)"
```

---

## Task 8: PhotoToAvatarOverlay コンポーネント

**Files:**
- Create: `apps/react-web/src/PhotoToAvatarOverlay.tsx`

このタスクの目的: アバターパネル上の半透明 overlay。 「推定中」「エラー + 再試行」「キャンセル」の 3 状態を表示する。

- [ ] **Step 1: PhotoToAvatarOverlay.tsx を実装**

```tsx
import type { CSSProperties } from "react";

export type OverlayStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string };

export interface PhotoToAvatarOverlayProps {
  status: OverlayStatus;
  onCancel: () => void;
  onRetry: () => void;
}

const styles: Record<string, CSSProperties> = {
  root: {
    position: "absolute",
    inset: 0,
    background: "rgba(255,255,255,0.85)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    fontSize: 14,
  },
  message: { fontWeight: 700, color: "#1a1a1a" },
  errorMessage: {
    fontWeight: 700,
    color: "#900",
    textAlign: "center",
    padding: "0 24px",
  },
  primaryBtn: {
    padding: "8px 16px",
    border: "2px solid #1a1a1a",
    borderRadius: 8,
    background: "#1a1a1a",
    color: "white",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  secondaryBtn: {
    padding: "8px 16px",
    border: "2px solid #1a1a1a",
    borderRadius: 8,
    background: "white",
    color: "#1a1a1a",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  spinner: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    border: "3px solid #ddd",
    borderTopColor: "#1a1a1a",
    animation: "ae-spin 1s linear infinite",
  },
};

const KEYFRAMES = "@keyframes ae-spin { to { transform: rotate(360deg); } }";

export function PhotoToAvatarOverlay({
  status,
  onCancel,
  onRetry,
}: PhotoToAvatarOverlayProps) {
  if (status.kind === "idle") return null;
  return (
    <div style={styles.root} role="status" aria-live="polite">
      <style>{KEYFRAMES}</style>
      {status.kind === "loading" ? (
        <>
          <div style={styles.spinner} aria-hidden />
          <div style={styles.message}>写真を解析中…</div>
          <button
            type="button"
            onClick={onCancel}
            style={styles.secondaryBtn}
          >
            キャンセル
          </button>
        </>
      ) : (
        <>
          <div style={styles.errorMessage}>{status.message}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onRetry} style={styles.primaryBtn}>
              再試行
            </button>
            <button
              type="button"
              onClick={onCancel}
              style={styles.secondaryBtn}
            >
              閉じる
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: typecheck**

```bash
pnpm -r --filter @alter-ego/app-react-web run typecheck
```

Expected: PASS (overlay は単体では import されないので未使用警告が出る場合がある → 次タスクで App.tsx から import するため OK)

- [ ] **Step 3: commit**

```bash
git add apps/react-web/src/PhotoToAvatarOverlay.tsx
git commit -m "✨ feat(app): add PhotoToAvatarOverlay component"
```

---

## Task 9: App.tsx に Photo to Avatar ボタン・ダイアログ・overlay 統合

**Files:**
- Modify: `apps/react-web/src/App.tsx`

このタスクの目的: ヘッダーに「Photo to Avatar」ボタンを追加し、 上書き確認 → ファイル選択 → perceive 呼び出し → applySeedToEngine 反映 → overlay 制御を実装。

**重要**: App.tsx は既存定義 `IDENTITY_TRANSFORM` (L246) と `interface SlotTransform` (L240) を持つ。 photo-to-avatar.ts と同形なので **既存定義をそのまま使い、 import はしない**。 App.tsx 内の既存 `setSlotTransforms` は React state の setter で、 `applySeedToEngine` の `SlotTransformsUpdater` シグネチャと互換 (React の SetStateAction を受け取れる)。

- [ ] **Step 1: import 文を追加**

`apps/react-web/src/App.tsx` の既存 import 群の末尾 (renderer-svg の import の後) に追加:

```ts
import { createOpenAIPerceiver, PerceiveError } from "@edv4h/alter-ego-perceive";
import type { Perceiver } from "@edv4h/alter-ego-perceive";
import { applySeedToEngine } from "./photo-to-avatar.js";
import {
  PhotoToAvatarOverlay,
  type OverlayStatus,
} from "./PhotoToAvatarOverlay.js";
```

既存 React import に `useMemo` を追加:

```ts
import { useEffect, useMemo, useRef, useState } from "react";
```

- [ ] **Step 2: errorMessageFor ヘルパを定数群の付近に追加**

定数群 (L80 あたり、 `FACE_DEFAULT_COLOR = "#ffffff";` の付近) に追加:

```ts
function errorMessageFor(e: PerceiveError): string {
  switch (e.kind) {
    case "network":
      return "ネットワークエラーが発生しました";
    case "auth":
      return "API キーが正しくありません";
    case "parse":
      return "結果の解釈に失敗しました";
    case "validate":
      return "写真からアバターを作れませんでした。 別の写真を試してください";
    case "cancelled":
      return "キャンセルされました";
    default: {
      // PerceiveErrorKind に新しい kind を追加した時、 ここが型エラーになる (堅牢化)
      const _exhaustive: never = e.kind;
      return "不明なエラーが発生しました";
    }
  }
}
```

- [ ] **Step 3: styles に headerButton とダイアログスタイルを追加**

`styles` オブジェクト (L348〜) の `downloadButton` の **直後** に追加:

```ts
headerButton: (disabled: boolean) =>
  ({
    padding: "10px 18px",
    border: "2px solid #1a1a1a",
    borderRadius: 10,
    background: disabled ? "#eee" : "white",
    color: "#1a1a1a",
    fontSize: 14,
    fontWeight: 700,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.6 : 1,
  } as const),
dialogBackdrop: {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
} as const,
dialogBox: {
  background: "white",
  borderRadius: 12,
  padding: 24,
  maxWidth: 400,
  display: "flex",
  flexDirection: "column",
  gap: 16,
} as const,
dialogTitle: { fontSize: 16, fontWeight: 700 } as const,
dialogBody: { fontSize: 14, lineHeight: 1.6 } as const,
dialogActions: {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
} as const,
dialogPrimaryBtn: {
  padding: "8px 16px",
  border: "2px solid #1a1a1a",
  borderRadius: 8,
  background: "#1a1a1a",
  color: "white",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
} as const,
dialogSecondaryBtn: {
  padding: "8px 16px",
  border: "2px solid #1a1a1a",
  borderRadius: 8,
  background: "white",
  color: "#1a1a1a",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
} as const,
```

`styles.avatarPanel` を確認し、 `position: "relative"` が無ければ追加する (overlay の `position: absolute` の基準にする):

```bash
grep -n "avatarPanel:" /Users/tetsuyatakeda/Sources/alter-ego/apps/react-web/src/App.tsx
```

該当箇所を読み、 `position: "relative"` が無ければそのオブジェクトに追加する。

- [ ] **Step 4: App コンポーネント内に state を追加**

L606 `export function App() {` の直後、 既存 useState 群 (`isExporting` の直後) に追加:

```ts
  // Photo to Avatar overlay state
  const [overlayStatus, setOverlayStatus] = useState<OverlayStatus>({
    kind: "idle",
  });
  // 直近の photo File (再試行用)
  const lastFileRef = useRef<File | null>(null);
  // 進行中の fetch を abort する AbortController
  const perceiveAbortRef = useRef<AbortController | null>(null);
  // 上書き確認ダイアログの開閉
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  // 隠し input ref
  const fileInputRef = useRef<HTMLInputElement>(null);
```

- [ ] **Step 5: Perceiver を useMemo で作る**

useEffect (engine セットアップ、 L624〜) の **後ろ**、 currentCategory の useMemo 付近に追加:

```ts
  const perceiver = useMemo<Perceiver | null>(() => {
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    if (!apiKey) return null;
    const model = import.meta.env.VITE_OPENAI_MODEL;
    return createOpenAIPerceiver({
      apiKey,
      schema,
      ...(model ? { model } : {}),
    });
  }, []);
```

- [ ] **Step 6: handler を追加**

既存 handler 群 (onUploadBgImage 付近、 L869〜) の **後ろ** に追加:

```ts
  // 「Photo to Avatar」ボタン押下: 常に上書き確認ダイアログを出す
  const onPhotoToAvatarClick = () => {
    if (!perceiver) return; // disabled なはずだが防御
    setShowOverwriteConfirm(true);
  };

  // ダイアログで OK: ファイル選択を開く
  const onConfirmOverwrite = () => {
    setShowOverwriteConfirm(false);
    fileInputRef.current?.click();
  };

  const onCancelOverwrite = () => {
    setShowOverwriteConfirm(false);
  };

  // ファイル選択完了 → 推定開始
  const onPhotoFileSelected = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 連続選択可能に
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setOverlayStatus({
        kind: "error",
        message: "写真サイズは 5MB 以下にしてください",
      });
      return;
    }
    lastFileRef.current = file;
    await runPerceive(file);
  };

  const runPerceive = async (file: File) => {
    const engine = engineRef.current;
    if (!engine || !perceiver) return;
    perceiveAbortRef.current?.abort();
    const controller = new AbortController();
    perceiveAbortRef.current = controller;
    setOverlayStatus({ kind: "loading" });
    try {
      const seed = await perceiver.perceive(file, {
        signal: controller.signal,
      });
      applySeedToEngine(engine, seed, setSlotTransforms);
      setOverlayStatus({ kind: "idle" });
    } catch (e) {
      if (e instanceof PerceiveError) {
        if (e.kind === "cancelled") {
          setOverlayStatus({ kind: "idle" });
          return;
        }
        setOverlayStatus({ kind: "error", message: errorMessageFor(e) });
      } else {
        setOverlayStatus({
          kind: "error",
          message: "不明なエラーが発生しました",
        });
      }
    } finally {
      perceiveAbortRef.current = null;
    }
  };

  const onOverlayCancel = () => {
    perceiveAbortRef.current?.abort();
    setOverlayStatus({ kind: "idle" });
  };

  const onOverlayRetry = () => {
    const file = lastFileRef.current;
    if (file) void runPerceive(file);
  };
```

- [ ] **Step 7: ヘッダーに Photo to Avatar ボタンを追加**

既存 header (L1069 付近) を以下に置き換える:

```tsx
<header style={styles.header}>
  <h1 style={styles.headerTitle}>Avatar? Avatar!</h1>
  <div style={{ display: "flex", gap: 8 }}>
    <button
      type="button"
      onClick={onPhotoToAvatarClick}
      disabled={!ready || !perceiver || overlayStatus.kind === "loading"}
      style={styles.headerButton(
        !ready || !perceiver || overlayStatus.kind === "loading",
      )}
      title={
        !perceiver
          ? "VITE_OPENAI_API_KEY を .env.local に設定してください"
          : undefined
      }
      aria-label="写真からアバターを生成"
    >
      Photo to Avatar
    </button>
    <button
      type="button"
      onClick={onDownloadPng}
      disabled={!ready || isExporting}
      style={styles.downloadButton(!ready || isExporting)}
      aria-label="アバターを PNG でダウンロード"
    >
      {isExporting ? "書き出し中…" : "Download PNG"}
    </button>
  </div>
</header>
<input
  ref={fileInputRef}
  type="file"
  accept="image/jpeg,image/png,image/webp"
  hidden
  onChange={onPhotoFileSelected}
/>
```

- [ ] **Step 8: avatar panel に overlay を追加**

L1138 付近の `<section style={{ ...styles.avatarPanel, ...backgroundStyle(background) }}>` の内側、 既存 `{!ready && <p style={styles.status}>loading…</p>}` の **後ろ** に追加:

```tsx
<PhotoToAvatarOverlay
  status={overlayStatus}
  onCancel={onOverlayCancel}
  onRetry={onOverlayRetry}
/>
```

- [ ] **Step 9: 上書き確認ダイアログを追加**

App コンポーネントの return の最後の `</div>` の **直前** に追加:

```tsx
{showOverwriteConfirm && (
  <div style={styles.dialogBackdrop} role="dialog" aria-modal="true">
    <div style={styles.dialogBox}>
      <div style={styles.dialogTitle}>現在の編集を上書きします</div>
      <div style={styles.dialogBody}>
        Photo to Avatar は現在のパーツ・色・配置をすべて置き換えます。
        続行しますか?
      </div>
      <div style={styles.dialogActions}>
        <button
          type="button"
          onClick={onCancelOverwrite}
          style={styles.dialogSecondaryBtn}
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={onConfirmOverwrite}
          style={styles.dialogPrimaryBtn}
        >
          続行
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 10: typecheck と build を実行**

```bash
pnpm -r --filter @alter-ego/app-react-web run typecheck
pnpm -r --filter @alter-ego/app-react-web run build
```

Expected: 両方 PASS

- [ ] **Step 11: commit**

```bash
git add apps/react-web/src/App.tsx
git commit -m "✨ feat(app): wire Photo to Avatar button + overlay + confirm dialog"
```

---

## Task 10: 全体テスト + 手動 E2E + PR

**Files:** (なし — テストと検証のみ)

- [ ] **Step 1: 全テストを実行**

```bash
pnpm test
```

Expected: 全テスト PASS。 perceive 関連 26 件 (errors 2 + validate 11 + resize 5 + openai 8) + photo-to-avatar 7 件 が追加されている。

- [ ] **Step 2: 全パッケージで build / typecheck**

```bash
pnpm build
pnpm typecheck
```

Expected: 両方 PASS

- [ ] **Step 3: lint**

```bash
pnpm lint
```

Expected: PASS (warning は許容、 error は無いこと)

- [ ] **Step 4: 手動 E2E — API キー未設定の挙動**

```bash
# .env.local は作らずに
pnpm -r --filter @alter-ego/app-react-web run dev
```

- ブラウザで `http://localhost:5173` を開く
- Photo to Avatar ボタンが **disabled** + tooltip 「VITE_OPENAI_API_KEY を .env.local に設定してください」
- Download PNG ボタンは引き続き動く

- [ ] **Step 5: 手動 E2E — API キー設定後の golden path**

```bash
cp apps/react-web/.env.example apps/react-web/.env.local
# .env.local に実際の OpenAI API キーを書く
pnpm -r --filter @alter-ego/app-react-web run dev
```

- Photo to Avatar ボタンが enabled になる
- クリック → 上書き確認ダイアログ
- 続行 → ファイル選択ダイアログ
- jpeg/png/webp を選ぶ → overlay「写真を解析中…」
- 数秒後 → overlay 消失 + selection 更新を目視確認
- 既存の左パネルでカテゴリを切り替え、 右カラムの編集 UI が seed の partId にあわせて表示されることを確認

- [ ] **Step 6: 手動 E2E — エラーケース**

- 6MB の jpeg → 「5MB 以下にしてください」エラー
- 顔の無い画像 (景色のみ) → validate エラー「別の写真を試してください」
- 推定中に overlay の「キャンセル」ボタンで abort されること
- ネットワーク断 (DevTools の offline) → network エラー、 再試行ボタンで復帰

- [ ] **Step 7: PR 作成**

```bash
git push -u origin feat/photo-to-avatar
gh pr create \
  --reviewer EdV4H \
  --label "🤖 claude-code" \
  --title "✨ feat: 写真からアバター推定 (Photo to Avatar)" \
  --body "$(cat <<'EOF'
## Summary

- 新規 `@edv4h/alter-ego-perceive` パッケージ: `Perceiver` interface + OpenAI Vision (gpt-4o) 実装
- `apps/react-web` にヘッダー「Photo to Avatar」ボタン + 上書き確認ダイアログ + overlay UI
- `applySeedToEngine`: AvatarSeed を engine.selections + slotTransforms に完全上書き反映
- バリデーション: zod でスキーマ存在チェック + clamp、 不正フィールドは安全に除外

## Spec / Plan

- `docs/superpowers/specs/2026-06-05-photo-to-avatar-design.md`
- `docs/superpowers/plans/2026-06-08-photo-to-avatar.md`

## Test plan

- [ ] `pnpm test` 全 PASS
- [ ] `pnpm typecheck` 全 PASS
- [ ] `pnpm build` 全 PASS
- [ ] API キー未設定: ボタン disabled + tooltip 表示
- [ ] API キー設定後: 写真→ダイアログ→解析→反映の golden path 動作
- [ ] エラーケース (5MB 超 / 顔なし / abort / ネット断) で overlay が適切に動作

## 注記

- `VITE_OPENAI_API_KEY` はビルドに焼き付くため **PoC 専用**。 本番運用はサーバ経由に切り替えること (spec の未決事項 5)
EOF
)"
```

- [ ] **Step 8: PR タスク完了マーク**

PR URL を確認、 自動化されたチェックがすべて通ったらレビュー待ちで終了。

---

## Self-Review (plan 完成後のチェック)

### Spec カバレッジ (`docs/superpowers/specs/2026-06-05-photo-to-avatar-design.md` の要件)

| Spec セクション | 対応タスク |
|---|---|
| 「AI 知覚は初期推定、 ユーザー手動仕上げ」 | Task 9 (applySeedToEngine 後はそのまま既存 UI に渡る) |
| 「AI 出力 = 既存 schema 直接」 | Task 2 (`AvatarSeed` 型) |
| 「クライアント直接 VLM API」 | Task 5 (createOpenAIPerceiver) |
| 「OpenAI gpt-4o」 | Task 5 (DEFAULT_MODEL) |
| 「ヘッダー右側ボタン」 | Task 9 (header に headerButton 追加) |
| 「完全上書き + 確認ダイアログ」 | Task 7 (applySeedToEngine) + Task 9 (確認ダイアログ) |
| 「背景推定は対象外」 | カバー (perceive は backgrounds を扱わない) |
| Perceiver interface 切り出し | Task 2 |
| zod バリデーション (schema partId / hex / clamp) | Task 3 |
| 5MB 上限 + 1024px 縮小 | Task 4 + Task 9 (5MB 判定) |
| PerceiveError kind 列挙 (network / auth / parse / validate / cancelled) | Task 2 + Task 5 |
| エラー UI (overlay + 再試行) | Task 8 + Task 9 |
| AbortSignal でキャンセル | Task 5 (signal 渡し) + Task 9 (controller.abort) |
| 写真形式 jpeg / png / webp | Task 9 (input の accept) |
| `.env.local` / `VITE_OPENAI_API_KEY` / disabled tooltip | Task 6 + Task 9 |

### Placeholder スキャン

- [x] TBD / TODO / 「実装する」だけのステップなし
- [x] すべての step に具体的なコード / コマンドあり
- [x] 「同じく Task N」「あとで」「適切に」等の曖昧表現なし

### スコープ外の付帯フィールド

- `AvatarSeed.salientFeatures` — spec L84 で「デバッグ / UI で確認するためのメタ情報」と定義されているが、 本 plan のスコープでは validate を通すだけで UI 表示はしない。 将来の Task で overlay の解析後表示や DevTools 表示に使う可能性あり。 dead field ではなく「将来のための placeholder」として残す。

### 型整合性

- `AvatarSeed.selections` の型: Task 2 で定義 → Task 3 で生成 → Task 5 で返却 → Task 7 で消費 — すべて同じ shape ✓
- `Perceiver.perceive(file, options)` の signature: Task 2 と Task 5 で一致 ✓
- `PerceiveError.kind` 列挙: Task 2 で定義 → Task 5 で throw → Task 9 で switch — 漏れなし ✓
- `applySeedToEngine(engine, seed, setSlotTransforms)` の signature: Task 7 で定義 → Task 9 で使用 — 一致 ✓
- `IDENTITY_TRANSFORM` / `SlotTransform`: photo-to-avatar.ts と App.tsx 既存定義が **完全に同形** (どちらも `{ dx, dy, scale, rotation }`)。 App.tsx 側は既存定義を使い続けるため import 衝突なし ✓
- `OverlayStatus` の `kind`: `"idle" | "loading" | "error"` — Task 8 で定義 → Task 9 で switch、 message プロパティは error のみ — 一致 ✓
