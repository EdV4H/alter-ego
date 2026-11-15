# 装着物の反映 + ペア slot セット選択 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Photo to Avatar でメガネ等の装着物が必ず反映され、左右・前後で分かれる slot が同番号のセットで選ばれるようにする。

**Architecture:** プロンプト（prompt.ts、両プロバイダ共有）に装着物の有無判定とセット選択の指示を追加し、LLM の揺れに依存しないよう `normalize.ts`（新設）で validateSeed 後にコード正規化する。両 adapter の `validateSeed()` 直後に適用。

**Tech Stack:** TypeScript 5.x (strict), Vitest 3 (happy-dom)。

**Spec:** `docs/superpowers/specs/2026-06-11-perceive-accessories-pairs-design.md`

**Branch:** `feat/perceive-prompt-accessories-pairs`（作成済み、設計書 commit 済み）

---

## File Structure

| ファイル | 操作 | 責務 |
|---|---|---|
| `packages/perceive/src/prompt.ts` | Modify | SYSTEM_PROMPT に装着物文言、buildUserPrompt に判定指示・セット指示セクション追加 |
| `packages/perceive/src/prompt.test.ts` | Create | プロンプト出力の単体テスト |
| `packages/perceive/src/normalize.ts` | Create | ペア slot の正規化（内部モジュール、index.ts から export しない） |
| `packages/perceive/src/normalize.test.ts` | Create | 正規化ルールの単体テスト |
| `packages/perceive/src/openai.ts` | Modify | validateSeed 直後に normalizePairSelections 適用 |
| `packages/perceive/src/gemini.ts` | Modify | 同上 |
| `packages/perceive/src/openai.test.ts` | Modify | 正規化適用の統合テスト 1 件追加 |
| `packages/perceive/src/gemini.test.ts` | Modify | 同上 |

---

### Task 1: prompt.ts 改善（TDD）

**Files:**
- Test: `packages/perceive/src/prompt.test.ts`
- Modify: `packages/perceive/src/prompt.ts`

- [ ] **Step 1: 失敗するテストを書く**

`packages/perceive/src/prompt.test.ts` を新規作成:

```ts
import { describe, expect, it } from "vitest";
import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";

// 任意 slot (glasses) を含む schema
const schemaWithOptional: AvatarSchema = {
  schemaVersion: "1.0",
  metadata: { name: "t" },
  slots: [
    { id: "face", name: "顔", zIndex: 10, required: true },
    { id: "glasses", name: "メガネ", zIndex: 60 },
    { id: "accessory_front", name: "アクセサリ (前)", zIndex: 70 },
  ],
  parts: [
    { id: "face-01", slotId: "face", name: "F1", assetId: "a-1" },
    { id: "glasses-01", slotId: "glasses", name: "G1", assetId: "a-2" },
    { id: "accessory-front-01", slotId: "accessory_front", name: "A1", assetId: "a-3" },
  ],
  assets: [
    { id: "a-1", kind: "svg", src: "f.svg" },
    { id: "a-2", kind: "svg", src: "g.svg" },
    { id: "a-3", kind: "svg", src: "a.svg" },
  ],
};

// 必須 slot のみの schema
const schemaRequiredOnly: AvatarSchema = {
  schemaVersion: "1.0",
  metadata: { name: "t" },
  slots: [{ id: "face", name: "顔", zIndex: 10, required: true }],
  parts: [{ id: "face-01", slotId: "face", name: "F1", assetId: "a-1" }],
  assets: [{ id: "a-1", kind: "svg", src: "f.svg" }],
};

describe("SYSTEM_PROMPT", () => {
  it("装着物を必ず反映する指示を含む", () => {
    expect(SYSTEM_PROMPT).toContain("装着物");
    expect(SYSTEM_PROMPT).toContain("必ず反映");
  });
});

describe("buildUserPrompt", () => {
  it("任意 slot の有無判定指示と slot 名を含む", () => {
    const p = buildUserPrompt(schemaWithOptional);
    expect(p).toContain("【装着物・任意パーツの判定指示】");
    expect(p).toContain("glasses, accessory_front");
    expect(p).toContain("写っていない場合は省略");
  });

  it("任意 slot が無い schema では判定指示セクションを出さない", () => {
    const p = buildUserPrompt(schemaRequiredOnly);
    expect(p).not.toContain("【装着物・任意パーツの判定指示】");
  });

  it("セット選択の指示を含む", () => {
    const p = buildUserPrompt(schemaWithOptional);
    expect(p).toContain("【セット選択の指示】");
    expect(p).toContain("_left / _right");
    expect(p).toContain("hair_back");
    expect(p).toContain("片側のみ");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm vitest run packages/perceive/src/prompt.test.ts 2>&1 | tail -8`
Expected: FAIL（SYSTEM_PROMPT に「装着物」が無い、buildUserPrompt にセクションが無い）。

- [ ] **Step 3: prompt.ts を修正**

`SYSTEM_PROMPT` を以下に変更（4 行目の装着物文言を追加）:

```ts
/** OpenAI / Gemini 両 adapter で共有するシステムプロンプト */
export const SYSTEM_PROMPT = [
  "あなたはアバター生成アシスタントです。",
  "写真の人物を識別する顕著特徴を 2〜3 個選び、",
  "それを最も強調する partId と color、 必要なら slotTransforms を出力してください。",
  "ただしメガネ・ヒゲ・帽子などの装着物は顕著特徴の個数に数えず、 写真に写っていれば必ず反映してください。",
  "残りはデフォルトで構いません。 出力は JSON のみで、 説明文を含めないでください。",
  "schema に存在しない partId は使わないでください。",
].join(" ");
```

`buildUserPrompt()` の「色の推定指示」ブロックの後（`lines.push("");` と `lines.push("出力 JSON スキーマ:");` の間）に以下を挿入:

```ts
  const optionalSlots = schema.slots.filter((s) => !s.required);
  if (optionalSlots.length > 0) {
    lines.push("");
    lines.push("【装着物・任意パーツの判定指示】");
    lines.push(
      `次の slot は写真に対応する要素が写っているかを必ず判定してください: ${optionalSlots.map((s) => s.id).join(", ")}`,
    );
    lines.push(
      "写っている場合は必ず該当する partId を設定し、 写っていない場合は省略してください。",
    );
    lines.push(
      "特にメガネ・帽子・アクセサリなどの装着物は見落とさないでください。",
    );
  }
  lines.push("");
  lines.push("【セット選択の指示】");
  lines.push(
    "_left / _right で分かれる slot は同じ番号のパーツを選んでください (例: eye-left-03 と eye-right-03)。",
  );
  lines.push(
    "hair_back を選ぶ場合は hair_front と同じ番号にしてください。 対応する番号が無い場合は片側のみで構いません。",
  );
```

- [ ] **Step 4: テストが通ることを確認（既存含む）**

Run: `pnpm test 2>&1 | tail -4`
Expected: 122 tests PASS（既存 118 + prompt 4）。

- [ ] **Step 5: Commit**

```bash
git add packages/perceive/src/prompt.ts packages/perceive/src/prompt.test.ts
git commit -m "✨ feat(perceive): プロンプトに装着物の有無判定とセット選択の指示を追加"
```

---

### Task 2: normalize.ts — ペア slot の正規化（TDD）

**Files:**
- Test: `packages/perceive/src/normalize.test.ts`
- Create: `packages/perceive/src/normalize.ts`

- [ ] **Step 1: 失敗するテストを書く**

`packages/perceive/src/normalize.test.ts` を新規作成:

```ts
import { describe, expect, it } from "vitest";
import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import { normalizePairSelections } from "./normalize.js";

// eye_left/right は 01,02 が 1:1。 hair_front は 01,02、 hair_back は 01 のみ
// (= front-02 に対応する back が無い) というセット設計を模した fixture
const schema: AvatarSchema = {
  schemaVersion: "1.0",
  metadata: { name: "t" },
  slots: [
    { id: "face", name: "顔", zIndex: 10, required: true },
    { id: "eye_left", name: "目 (左)", zIndex: 30, required: true },
    { id: "eye_right", name: "目 (右)", zIndex: 30, required: true },
    { id: "hair_front", name: "髪 (前)", zIndex: 45, required: true },
    { id: "hair_back", name: "髪 (後)", zIndex: 5 },
  ],
  parts: [
    { id: "face-01", slotId: "face", name: "F1", assetId: "a" },
    { id: "eye-left-01", slotId: "eye_left", name: "EL1", assetId: "a" },
    { id: "eye-left-02", slotId: "eye_left", name: "EL2", assetId: "a" },
    { id: "eye-right-01", slotId: "eye_right", name: "ER1", assetId: "a" },
    { id: "eye-right-02", slotId: "eye_right", name: "ER2", assetId: "a" },
    { id: "hair-front-01", slotId: "hair_front", name: "HF1", assetId: "a" },
    { id: "hair-front-02", slotId: "hair_front", name: "HF2", assetId: "a" },
    { id: "hair-back-01", slotId: "hair_back", name: "HB1", assetId: "a" },
  ],
  assets: [{ id: "a", kind: "svg", src: "x.svg" }],
};

describe("normalizePairSelections", () => {
  it("左右の番号不一致は左に揃え、 右の color は維持する", () => {
    const seed = normalizePairSelections(
      {
        selections: {
          eye_left: { partId: "eye-left-01", color: "#111111" },
          eye_right: { partId: "eye-right-02", color: "#222222" },
        },
      },
      schema,
    );
    expect(seed.selections!.eye_right).toEqual({
      partId: "eye-right-01",
      color: "#222222",
    });
    expect(seed.selections!.eye_left).toEqual({
      partId: "eye-left-01",
      color: "#111111",
    });
  });

  it("左のみ選択なら右を同番号で補完し、 color をコピーする", () => {
    const seed = normalizePairSelections(
      { selections: { eye_left: { partId: "eye-left-02", color: "#333333" } } },
      schema,
    );
    expect(seed.selections!.eye_right).toEqual({
      partId: "eye-right-02",
      color: "#333333",
    });
  });

  it("右のみ選択なら左を同番号で補完する (color なし)", () => {
    const seed = normalizePairSelections(
      { selections: { eye_right: { partId: "eye-right-01" } } },
      schema,
    );
    expect(seed.selections!.eye_left).toEqual({ partId: "eye-left-01" });
  });

  it("hair_back の番号不一致は front と同番号の back に置換する", () => {
    const seed = normalizePairSelections(
      {
        selections: {
          hair_front: { partId: "hair-front-01" },
          hair_back: { partId: "hair-back-01", color: "#444444" },
        },
      },
      schema,
    );
    // front-01 と back-01 は一致しているので無変更のケースも兼ねる
    expect(seed.selections!.hair_back).toEqual({
      partId: "hair-back-01",
      color: "#444444",
    });
  });

  it("front と同番号の back が無ければ hair_back を空にする (選択から除外)", () => {
    const seed = normalizePairSelections(
      {
        selections: {
          hair_front: { partId: "hair-front-02" },
          hair_back: { partId: "hair-back-01" },
        },
      },
      schema,
    );
    expect(seed.selections!.hair_back).toBeUndefined();
    expect(seed.selections!.hair_front).toEqual({ partId: "hair-front-02" });
  });

  it("hair_back のみ (front 未選択) は基準が無いため変更しない", () => {
    const seed = normalizePairSelections(
      { selections: { hair_back: { partId: "hair-back-01" } } },
      schema,
    );
    expect(seed.selections!.hair_back).toEqual({ partId: "hair-back-01" });
  });

  it("ペア対象が無い selections は無変更", () => {
    const seed = normalizePairSelections(
      { selections: { face: { partId: "face-01", color: "#555555" } } },
      schema,
    );
    expect(seed.selections).toEqual({
      face: { partId: "face-01", color: "#555555" },
    });
  });

  it("末尾番号の取れない partId は正規化対象外", () => {
    const seed = normalizePairSelections(
      {
        selections: {
          eye_left: { partId: "eye-left-special" },
          eye_right: { partId: "eye-right-01" },
        },
      },
      schema,
    );
    expect(seed.selections!.eye_left).toEqual({ partId: "eye-left-special" });
    expect(seed.selections!.eye_right).toEqual({ partId: "eye-right-01" });
  });

  it("selections が無い seed はそのまま返す", () => {
    const seed = normalizePairSelections({ salientFeatures: [] }, schema);
    expect(seed).toEqual({ salientFeatures: [] });
  });

  it("slotTransforms には触れない", () => {
    const seed = normalizePairSelections(
      {
        selections: { eye_left: { partId: "eye-left-01" } },
        slotTransforms: { eye_left: { dx: 1 } },
      },
      schema,
    );
    expect(seed.slotTransforms).toEqual({ eye_left: { dx: 1 } });
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm vitest run packages/perceive/src/normalize.test.ts 2>&1 | tail -5`
Expected: FAIL — `Cannot find module './normalize.js'` 相当。

- [ ] **Step 3: normalize.ts を実装**

`packages/perceive/src/normalize.ts` を新規作成:

```ts
import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import type { AvatarSeed } from "./types.js";

// 内部モジュール: validateSeed 後の selections をペア整合に正規化する。
// パッケージの公開 API ではないため index.ts からは export しない。

const LEFT_SUFFIX = "_left";
const RIGHT_SUFFIX = "_right";
const HAIR_FRONT = "hair_front";
const HAIR_BACK = "hair_back";

type Selection = { partId: string; color?: string };

/** partId 末尾の数字部分。 取れない場合は null (正規化対象外) */
function partNumber(partId: string): string | null {
  const m = /(\d+)$/.exec(partId);
  return m?.[1] ?? null;
}

/** slot 内で末尾番号が number に一致する partId。 無ければ null */
function findPartIdByNumber(
  schema: AvatarSchema,
  slotId: string,
  number: string,
): string | null {
  const hit = schema.parts.find(
    (p) => p.slotId === slotId && partNumber(p.id) === number,
  );
  return hit?.id ?? null;
}

/** _left/_right ペア: 番号不一致は左基準で右を置換、 片側のみは同番号で補完 */
function normalizeLeftRight(
  selections: Record<string, Selection>,
  schema: AvatarSchema,
): void {
  const bases = new Set<string>();
  for (const slotId of Object.keys(selections)) {
    if (slotId.endsWith(LEFT_SUFFIX)) {
      bases.add(slotId.slice(0, -LEFT_SUFFIX.length));
    } else if (slotId.endsWith(RIGHT_SUFFIX)) {
      bases.add(slotId.slice(0, -RIGHT_SUFFIX.length));
    }
  }
  for (const base of bases) {
    const leftId = `${base}${LEFT_SUFFIX}`;
    const rightId = `${base}${RIGHT_SUFFIX}`;
    const left = selections[leftId];
    const right = selections[rightId];

    if (left && right) {
      // 両方選択済み: 左の番号に右を揃える (置換時は右の color を維持)
      const leftNum = partNumber(left.partId);
      if (leftNum && leftNum !== partNumber(right.partId)) {
        const replaced = findPartIdByNumber(schema, rightId, leftNum);
        if (replaced) {
          selections[rightId] = { ...right, partId: replaced };
        }
      }
    } else if (left || right) {
      // 片側のみ: 同番号でもう片方を補完 (ペア元の color をコピー)
      const src = (left ?? right) as Selection;
      const missingId = left ? rightId : leftId;
      const srcNum = partNumber(src.partId);
      if (srcNum) {
        const complemented = findPartIdByNumber(schema, missingId, srcNum);
        if (complemented) {
          selections[missingId] = {
            partId: complemented,
            ...(src.color ? { color: src.color } : {}),
          };
        }
      }
    }
  }
}

/** hair_back を hair_front と同番号に揃える。 同番号の back が無ければ back を空にする */
function normalizeHair(
  selections: Record<string, Selection>,
  schema: AvatarSchema,
): void {
  const front = selections[HAIR_FRONT];
  const back = selections[HAIR_BACK];
  // front 未選択の場合は基準が無いため正規化しない
  if (!front || !back) return;

  const frontNum = partNumber(front.partId);
  if (!frontNum || frontNum === partNumber(back.partId)) return;

  const replaced = findPartIdByNumber(schema, HAIR_BACK, frontNum);
  if (replaced) {
    selections[HAIR_BACK] = { ...back, partId: replaced };
  } else {
    delete selections[HAIR_BACK];
  }
}

/**
 * 左右ペア slot (_left/_right) と hair_front/hair_back のパーツ番号をセットに揃える。
 * 対応番号のパーツが schema に無い場合や番号の取れない partId は変更しない。
 * 詳細ルールは docs/superpowers/specs/2026-06-11-perceive-accessories-pairs-design.md を参照。
 */
export function normalizePairSelections(
  seed: AvatarSeed,
  schema: AvatarSchema,
): AvatarSeed {
  if (!seed.selections) return seed;

  const selections: Record<string, Selection> = structuredClone(
    seed.selections,
  );
  normalizeLeftRight(selections, schema);
  normalizeHair(selections, schema);
  return { ...seed, selections };
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm vitest run packages/perceive/src/normalize.test.ts 2>&1 | tail -5`
Expected: 10 tests PASS。

- [ ] **Step 5: 全テスト + typecheck**

Run: `pnpm test 2>&1 | tail -4 && pnpm typecheck 2>&1 | tail -3`
Expected: 132 tests PASS（122 + normalize 10）、typecheck 全 PASS。

- [ ] **Step 6: Commit**

```bash
git add packages/perceive/src/normalize.ts packages/perceive/src/normalize.test.ts
git commit -m "✨ feat(perceive): ペア slot のセット選択を保証する normalizePairSelections を追加"
```

---

### Task 3: adapter への正規化適用

**Files:**
- Modify: `packages/perceive/src/openai.ts`
- Modify: `packages/perceive/src/gemini.ts`
- Modify: `packages/perceive/src/openai.test.ts`
- Modify: `packages/perceive/src/gemini.test.ts`

- [ ] **Step 1: 失敗する統合テストを書く（openai 側）**

`packages/perceive/src/openai.test.ts` の schema fixture に eye slot / parts を追加する。既存 fixture の `slots` 配列を:

```ts
  slots: [
    { id: "face", name: "顔", zIndex: 10, required: true },
    { id: "hair_front", name: "髪 (前)", zIndex: 45 },
    { id: "eye_left", name: "目 (左)", zIndex: 30, required: true },
    { id: "eye_right", name: "目 (右)", zIndex: 30, required: true },
  ],
```

に、`parts` 配列を:

```ts
  parts: [
    { id: "face-01", slotId: "face", name: "F1", assetId: "a-face-01" },
    { id: "hair-front-01", slotId: "hair_front", name: "H1", assetId: "a-hf-01" },
    { id: "eye-left-01", slotId: "eye_left", name: "EL1", assetId: "a-face-01" },
    { id: "eye-left-02", slotId: "eye_left", name: "EL2", assetId: "a-face-01" },
    { id: "eye-right-01", slotId: "eye_right", name: "ER1", assetId: "a-face-01" },
    { id: "eye-right-02", slotId: "eye_right", name: "ER2", assetId: "a-face-01" },
  ],
```

に変更し、describe 末尾に統合テストを追加:

```ts
  it("左右の目の番号不一致は正規化されて左に揃う", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockOkResponse({
        selections: {
          eye_left: { partId: "eye-left-01" },
          eye_right: { partId: "eye-right-02" },
        },
      }),
    );
    const perceiver = createOpenAIPerceiver({ apiKey: "sk", schema });
    const seed = await perceiver.perceive(dummyBlob());
    expect(seed.selections!.eye_right).toEqual({ partId: "eye-right-01" });
  });
```

- [ ] **Step 2: 同じ統合テストを gemini 側にも書く**

`packages/perceive/src/gemini.test.ts` の schema fixture にも同じ slots / parts 変更を適用し、describe 末尾に追加:

```ts
  it("左右の目の番号不一致は正規化されて左に揃う", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockOkResponse({
        selections: {
          eye_left: { partId: "eye-left-01" },
          eye_right: { partId: "eye-right-02" },
        },
      }),
    );
    const perceiver = createGeminiPerceiver({ apiKey: "g", schema });
    const seed = await perceiver.perceive(dummyBlob());
    expect(seed.selections!.eye_right).toEqual({ partId: "eye-right-01" });
  });
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `pnpm vitest run packages/perceive/src/openai.test.ts packages/perceive/src/gemini.test.ts 2>&1 | tail -8`
Expected: 新規 2 件のみ FAIL（`eye-right-02` のまま返るため）。既存テストは PASS。

- [ ] **Step 4: 両 adapter に正規化を適用**

`packages/perceive/src/openai.ts`:

import に追加: `import { normalizePairSelections } from "./normalize.js";`

`const seed = validateSeed(raw, schema);` を以下に変更:

```ts
        const seed = normalizePairSelections(validateSeed(raw, schema), schema);
```

`packages/perceive/src/gemini.ts` にも同一の変更を適用する（import 追加 + validateSeed 行の置換）。

- [ ] **Step 5: 全テスト + typecheck**

Run: `pnpm test 2>&1 | tail -4 && pnpm typecheck 2>&1 | tail -3`
Expected: 134 tests PASS（132 + 統合 2）、typecheck 全 PASS。

- [ ] **Step 6: Commit**

```bash
git add packages/perceive/src/openai.ts packages/perceive/src/gemini.ts packages/perceive/src/openai.test.ts packages/perceive/src/gemini.test.ts
git commit -m "✨ feat(perceive): 両 adapter の validateSeed 直後にペア正規化を適用"
```

---

### Task 4: E2E 検証 + PR 作成

- [ ] **Step 1: dev server でメガネあり写真を両プロバイダ検証**

```bash
pnpm dev
```

メガネあり顔写真（AI 生成）を ChatGPT / Gemini 両方に投入し、以下を確認:
- glasses slot が反映される（両プロバイダ）
- 左右の目・眉が同番号で揃っている

- [ ] **Step 2: push + PR 作成**

```bash
git push -u origin feat/perceive-prompt-accessories-pairs
gh pr create \
  --title "✨ feat(perceive): 装着物の必須反映 + ペア slot のセット選択" \
  --reviewer EdV4H \
  --label "🤖 claude-code" \
  --body "(設計書 docs/superpowers/specs/2026-06-11-perceive-accessories-pairs-design.md にもとづく実装。背景: PR #50 の E2E で両プロバイダがメガネを反映しない問題を確認。変更点・正規化ルール表・Test plan を本文に記載)"
```

PR 本文には以下を含める: 背景（メガネ反映漏れ）、プロンプト変更点、正規化ルール表（spec から転記）、Test plan（自動 134 PASS + E2E 結果スクリーンショット）。
