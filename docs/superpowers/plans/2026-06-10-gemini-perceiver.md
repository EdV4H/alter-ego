# Gemini Perceiver + プロバイダ選択 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Photo to Avatar の推定プロバイダとして Gemini を追加し、上書き確認ダイアログで ChatGPT / Gemini を選択可能にする。

**Architecture:** `packages/perceive` に openai.ts と同型の `createGeminiPerceiver` を追加（共有プロンプトは `prompt.ts` に抽出）。Vite dev server の `/api/perceive` middleware に `/api/perceive/gemini` 分岐を追加し、`GEMINI_API_KEY` を server side で付与。App.tsx の確認ダイアログにラジオを置き、選択に応じて perceiver を構築する。

**Tech Stack:** TypeScript 5.x (strict), Vitest 3 (happy-dom), fetch 直接呼び出し（SDK なし）, Vite 6 dev middleware, React 19。

**Spec:** `docs/superpowers/specs/2026-06-10-gemini-perceiver-design.md`

**Branch:** `feat/perceive-gemini-provider`（作成済み、設計書 commit 済み）

---

## File Structure

| ファイル | 操作 | 責務 |
|---|---|---|
| `packages/perceive/src/prompt.ts` | Create | SYSTEM_PROMPT / buildUserPrompt の共有モジュール |
| `packages/perceive/src/openai.ts` | Modify | prompt.ts から import するよう変更（ロジック変更なし） |
| `packages/perceive/src/gemini.ts` | Create | createGeminiPerceiver（Gemini generateContent adapter） |
| `packages/perceive/src/gemini.test.ts` | Create | gemini adapter の単体テスト |
| `packages/perceive/src/index.ts` | Modify | createGeminiPerceiver を export |
| `apps/react-web/vite.config.ts` | Modify | /api/perceive/gemini proxy 分岐を追加 |
| `apps/react-web/.env.example` | Modify | GEMINI_API_KEY / GEMINI_MODEL を追記 |
| `apps/react-web/src/App.tsx` | Modify | ダイアログにプロバイダ選択ラジオ + perceiver 切替 |

---

### Task 1: prompt.ts 抽出（リファクタ、挙動変更なし）

**Files:**
- Create: `packages/perceive/src/prompt.ts`
- Modify: `packages/perceive/src/openai.ts`

- [ ] **Step 1: prompt.ts を作成**

openai.ts の `SYSTEM_PROMPT`（11-17 行）と `buildUserPrompt()`（129-176 行）を**そのまま**移動する。

```ts
// packages/perceive/src/prompt.ts
import type { AvatarSchema } from "@edv4h/alter-ego-schema";

/** OpenAI / Gemini 両 adapter で共有するシステムプロンプト */
export const SYSTEM_PROMPT = [
  "あなたはアバター生成アシスタントです。",
  "写真の人物を識別する顕著特徴を 2〜3 個選び、",
  "それを最も強調する partId と color、 必要なら slotTransforms を出力してください。",
  "残りはデフォルトで構いません。 出力は JSON のみで、 説明文を含めないでください。",
  "schema に存在しない partId は使わないでください。",
].join(" ");

/**
 * schema から利用可能な slot + partId 一覧をプロンプトに組み込む。
 * 不明な partId を出さないよう、 各 slot の選択肢を明示する。
 * "JSON" の文字列を含めることで OpenAI の json_object mode の制約を満たす。
 */
export function buildUserPrompt(schema: AvatarSchema): string {
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
  lines.push("【色の推定指示】");
  lines.push(
    "写真から以下の色を抽出し、 各 slot の color に '#RRGGBB' 形式で必ず設定してください:",
  );
  lines.push(
    "- face.color = 肌の色 (写真の顔の代表的な肌色を 1 色サンプリング)",
  );
  lines.push(
    "- hair_front.color = 髪の色 (写真の髪のメイン色)",
  );
  lines.push(
    "- hair_back.color = 髪の色 (hair_front.color と同じ値で構わない)",
  );
  lines.push(
    "- eye_left.color / eye_right.color = 瞳の色 (虹彩。 判別困難なら茶系で)",
  );
  lines.push(
    "色は写真から直接読み取ること。 schema のパレットに縛られず自然な色を返してよい。",
  );
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

- [ ] **Step 2: openai.ts を prompt.ts 参照に変更**

openai.ts から `SYSTEM_PROMPT` 定義と `buildUserPrompt()` 関数（およびその JSDoc）を削除し、import に置き換える:

```ts
// openai.ts 冒頭の import に追加
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";
```

`AvatarSchema` の import は `OpenAIPerceiverOptions` の型で使い続けるので残す。

- [ ] **Step 3: テストが通ることを確認（リグレッションチェック）**

Run: `pnpm test 2>&1 | tail -4`
Expected: `Tests 105 passed (105)` — prompt の挙動は不変なので全 PASS。

- [ ] **Step 4: Commit**

```bash
git add packages/perceive/src/prompt.ts packages/perceive/src/openai.ts
git commit -m "♻️ refactor(perceive): SYSTEM_PROMPT / buildUserPrompt を prompt.ts に抽出"
```

---

### Task 2: createGeminiPerceiver（TDD）

**Files:**
- Test: `packages/perceive/src/gemini.test.ts`
- Create: `packages/perceive/src/gemini.ts`
- Modify: `packages/perceive/src/index.ts`

- [ ] **Step 1: 失敗するテストを書く**

```ts
// packages/perceive/src/gemini.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import { createGeminiPerceiver } from "./gemini.js";
import { PerceiveError } from "./errors.js";

// resize を stub: happy-dom で Image.onload が発火しない問題を回避する
// (openai.test.ts と同じ理由・同じ stub)
vi.mock("./resize.js", () => ({
  resizeImageBlob: async (b: Blob) => b,
  blobToDataUrl: async (b: Blob) =>
    `data:${b.type};base64,${btoa("stub")}`,
  calcTargetSize: (w: number, h: number) => ({ width: w, height: h }),
}));

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

// Gemini generateContent 形式の成功レスポンス
const mockOkResponse = (json: unknown): Response =>
  new Response(
    JSON.stringify({
      candidates: [
        { content: { parts: [{ text: JSON.stringify(json) }] } },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

describe("createGeminiPerceiver", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("成功時に AvatarSeed を返す", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockOkResponse({ selections: { face: { partId: "face-01" } } }),
    );
    const perceiver = createGeminiPerceiver({ apiKey: "g-test", schema });
    const seed = await perceiver.perceive(dummyBlob());
    expect(seed.selections).toEqual({ face: { partId: "face-01" } });
  });

  it("既定モデル gemini-2.5-flash-lite が URL に入る", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockOkResponse({ selections: { face: { partId: "face-01" } } }),
    );
    const perceiver = createGeminiPerceiver({ apiKey: "g", schema });
    await perceiver.perceive(dummyBlob());
    const url = String(fetchSpy.mock.calls[0]![0]);
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent",
    );
  });

  it("opts.model で URL のモデルを override 可能", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockOkResponse({ selections: { face: { partId: "face-01" } } }),
    );
    const perceiver = createGeminiPerceiver({
      apiKey: "g",
      schema,
      model: "gemini-3.5-flash",
    });
    await perceiver.perceive(dummyBlob());
    const url = String(fetchSpy.mock.calls[0]![0]);
    expect(url).toContain("/models/gemini-3.5-flash:generateContent");
  });

  it("endpoint 指定時はその URL にそのまま POST する (proxy モード)", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockOkResponse({ selections: { face: { partId: "face-01" } } }),
    );
    const perceiver = createGeminiPerceiver({
      schema,
      endpoint: "/api/perceive/gemini",
    });
    await perceiver.perceive(dummyBlob());
    expect(String(fetchSpy.mock.calls[0]![0])).toBe("/api/perceive/gemini");
  });

  it("apiKey 指定時は x-goog-api-key ヘッダーを付ける", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockOkResponse({ selections: { face: { partId: "face-01" } } }),
    );
    const perceiver = createGeminiPerceiver({ apiKey: "g-key", schema });
    await perceiver.perceive(dummyBlob());
    const headers = fetchSpy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe("g-key");
  });

  it("apiKey 未指定のとき x-goog-api-key ヘッダーを付けない (proxy モード)", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockOkResponse({ selections: { face: { partId: "face-01" } } }),
    );
    const perceiver = createGeminiPerceiver({
      schema,
      endpoint: "/api/perceive/gemini",
    });
    await perceiver.perceive(dummyBlob());
    const headers = fetchSpy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBeUndefined();
    expect(headers["content-type"]).toBe("application/json");
  });

  it("リクエスト body が Gemini generateContent 形式になっている", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockOkResponse({ selections: { face: { partId: "face-01" } } }),
    );
    const perceiver = createGeminiPerceiver({ apiKey: "g", schema });
    await perceiver.perceive(dummyBlob());
    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body.systemInstruction.parts[0].text).toContain("アバター生成アシスタント");
    expect(body.contents[0].parts[0].text).toContain("face-01");
    expect(body.contents[0].parts[1].inline_data.mime_type).toBe("image/jpeg");
    expect(body.contents[0].parts[1].inline_data.data).toBe(btoa("stub"));
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });

  it("401 で auth エラーを投げる", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("unauth", { status: 401 }));
    const perceiver = createGeminiPerceiver({ apiKey: "bad", schema });
    await expect(perceiver.perceive(dummyBlob())).rejects.toMatchObject({
      kind: "auth",
    });
  });

  it("403 でも auth エラーを投げる (Gemini は無効キーで 403 を返すことがある)", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("forbidden", { status: 403 }));
    const perceiver = createGeminiPerceiver({ apiKey: "bad", schema });
    await expect(perceiver.perceive(dummyBlob())).rejects.toMatchObject({
      kind: "auth",
    });
  });

  it("500 系で network エラーを投げる", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("oops", { status: 500 }));
    const perceiver = createGeminiPerceiver({ apiKey: "g", schema });
    await expect(perceiver.perceive(dummyBlob())).rejects.toMatchObject({
      kind: "network",
    });
  });

  it("candidates の text が JSON でないと parse エラー", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "not json" }] } }],
        }),
        { status: 200 },
      ),
    );
    const perceiver = createGeminiPerceiver({ apiKey: "g", schema });
    await expect(perceiver.perceive(dummyBlob())).rejects.toMatchObject({
      kind: "parse",
    });
  });

  it("空 seed (schema に無い partId だけ) なら validate エラー", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockOkResponse({ selections: { face: { partId: "face-99" } } }),
    );
    const perceiver = createGeminiPerceiver({ apiKey: "g", schema });
    await expect(perceiver.perceive(dummyBlob())).rejects.toMatchObject({
      kind: "validate",
    });
  });

  it("AbortSignal を fetch に渡し、 abort 時は cancelled エラー", async () => {
    const controller = new AbortController();
    fetchSpy.mockImplementationOnce(
      (_url, init) =>
        new Promise((_, reject) => {
          const signal = init?.signal as AbortSignal;
          if (signal.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
          }
          signal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    const perceiver = createGeminiPerceiver({ apiKey: "g", schema });
    controller.abort();
    const p = perceiver.perceive(dummyBlob(), { signal: controller.signal });
    await expect(p).rejects.toBeInstanceOf(PerceiveError);
    await expect(p).rejects.toMatchObject({ kind: "cancelled" });
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm vitest run packages/perceive/src/gemini.test.ts 2>&1 | tail -5`
Expected: FAIL — `Cannot find module './gemini.js'` 相当のエラー。

- [ ] **Step 3: gemini.ts を実装**

```ts
// packages/perceive/src/gemini.ts
import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import { PerceiveError } from "./errors.js";
import type { Perceiver, PerceiveOptions } from "./perceiver.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";
import { blobToDataUrl, resizeImageBlob } from "./resize.js";
import type { AvatarSeed } from "./types.js";
import { validateSeed } from "./validate.js";

const DEFAULT_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_ENDPOINT_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

export interface GeminiPerceiverOptions {
  /** 省略時は x-goog-api-key ヘッダーを送らない (proxy モード、 server side でキー付与する想定) */
  apiKey?: string;
  /** perceiver が認識する slot/partId の根拠 */
  schema: AvatarSchema;
  /** 既定 "gemini-2.5-flash-lite"。 endpoint 指定時は無視される (モデルは proxy 側の責務) */
  model?: string;
  /** 指定時はこの URL にそのまま POST する (proxy モード用フック) */
  endpoint?: string;
}

export function createGeminiPerceiver(
  opts: GeminiPerceiverOptions,
): Perceiver {
  const { apiKey, schema } = opts;
  const model = opts.model ?? DEFAULT_MODEL;
  // Gemini はモデル名が URL パスに入るため、 endpoint 指定時はモデル選択を
  // 呼び出し先 (proxy) に委ねる
  const endpoint =
    opts.endpoint ?? `${DEFAULT_ENDPOINT_BASE}/${model}:generateContent`;

  return {
    async perceive(file: Blob, options?: PerceiveOptions): Promise<AvatarSeed> {
      try {
        const resized = await resizeImageBlob(file);
        const dataUrl = await blobToDataUrl(resized);
        const { mimeType, base64 } = splitDataUrl(dataUrl);

        const body = {
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [
            {
              role: "user",
              parts: [
                { text: buildUserPrompt(schema) },
                { inline_data: { mime_type: mimeType, data: base64 } },
              ],
            },
          ],
          generationConfig: { responseMimeType: "application/json" },
        };

        const headers: Record<string, string> = {
          "content-type": "application/json",
        };
        if (apiKey) {
          headers["x-goog-api-key"] = apiKey;
        }

        const res = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: options?.signal,
        });

        // Gemini は無効キーで 400/403 を返すことがあるが、 400 は
        // リクエスト不正と区別できないため auth 扱いは 401/403 のみとする
        if (res.status === 401 || res.status === 403) {
          throw new PerceiveError("auth", `Gemini returned ${res.status}`, {
            status: res.status,
          });
        }
        if (!res.ok) {
          throw new PerceiveError(
            "network",
            `Gemini returned ${res.status}`,
            { status: res.status },
          );
        }

        const json = (await res.json()) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
          }>;
        };
        const content = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!content) {
          throw new PerceiveError("parse", "Gemini response missing content");
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

/** data URL から MIME type と base64 部分を取り出す (inline_data 形式用) */
function splitDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!m) {
    throw new PerceiveError("parse", "unexpected data URL format");
  }
  return { mimeType: m[1]!, base64: m[2]! };
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm vitest run packages/perceive/src/gemini.test.ts 2>&1 | tail -5`
Expected: 13 tests PASS。

- [ ] **Step 5: index.ts に export を追加**

`packages/perceive/src/index.ts` の末尾（openai export の直後）に追加:

```ts
export { createGeminiPerceiver } from "./gemini.js";
export type { GeminiPerceiverOptions } from "./gemini.js";
```

- [ ] **Step 6: 全テスト + typecheck**

Run: `pnpm test 2>&1 | tail -4 && pnpm typecheck 2>&1 | tail -3`
Expected: 118 tests PASS（105 + 13）、typecheck 全 PASS。

- [ ] **Step 7: Commit**

```bash
git add packages/perceive/src/gemini.ts packages/perceive/src/gemini.test.ts packages/perceive/src/index.ts
git commit -m "✨ feat(perceive): createGeminiPerceiver を追加 (gemini-2.5-flash-lite 既定)"
```

---

### Task 3: proxy に /api/perceive/gemini 分岐を追加

**Files:**
- Modify: `apps/react-web/vite.config.ts`
- Modify: `apps/react-web/.env.example`

- [ ] **Step 1: vite.config.ts の perceiveProxyPlugin を 2 プロバイダ対応に書き換え**

`perceiveProxyPlugin()` 全体を以下に置き換える（`connect.use("/api/perceive", ...)` は prefix を strip するため、handler 内の `req.url` は `/`（OpenAI）か `/gemini` になる）:

```ts
// /api/perceive (OpenAI) と /api/perceive/gemini (Gemini) を proxy する
// dev server middleware。 .env.local 等の API キーを server side でヘッダーに
// 足し、 クライアントにはキーを露出させない。 production build (vite build)
// では middleware は含まれないので、 別途 backend が必要 (現状は dev 専用)。
//
// 注意: Vite は VITE_ prefix 無しの env を自動では process.env に展開しない。
// `loadEnv(mode, root, "")` で prefix なし全件を明示的に読み込む必要がある。
function perceiveProxyPlugin(): Plugin {
  let openaiKey: string | undefined;
  let geminiKey: string | undefined;
  let geminiModel = "gemini-2.5-flash-lite";
  return {
    name: "perceive-proxy",
    config(_config, { mode }) {
      // apps/react-web/.env* および process.env の両方からキーを取得
      const env = loadEnv(mode, process.cwd(), "");
      openaiKey = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      geminiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
      geminiModel =
        env.GEMINI_MODEL || process.env.GEMINI_MODEL || geminiModel;
    },
    configureServer(server) {
      const handler: Connect.NextHandleFunction = async (req, res, next) => {
        if (req.method !== "POST") return next();

        // use("/api/perceive") は prefix を strip するため、
        // req.url は "/" (OpenAI) または "/gemini" (Gemini) になる
        const isGemini = req.url === "/gemini";
        const apiKey = isGemini ? geminiKey : openaiKey;
        const keyName = isGemini ? "GEMINI_API_KEY" : "OPENAI_API_KEY";

        if (!apiKey) {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              error: {
                message: `${keyName} が dev server の env に設定されていません`,
              },
            }),
          );
          return;
        }

        try {
          // request body を読み出す
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(chunk as Buffer);
          }
          const body = Buffer.concat(chunks).toString("utf8");

          const upstream = await fetch(
            isGemini
              ? `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`
              : "https://api.openai.com/v1/chat/completions",
            {
              method: "POST",
              headers: isGemini
                ? {
                    "content-type": "application/json",
                    "x-goog-api-key": apiKey,
                  }
                : {
                    "content-type": "application/json",
                    authorization: `Bearer ${apiKey}`,
                  },
              body,
            },
          );

          res.statusCode = upstream.status;
          res.setHeader(
            "content-type",
            upstream.headers.get("content-type") ?? "application/json",
          );
          res.end(await upstream.text());
        } catch (e) {
          console.error("[perceive-proxy] forward failed:", e);
          res.statusCode = 502;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              error: { message: "perceive proxy forward failed" },
            }),
          );
        }
      };

      server.middlewares.use("/api/perceive", handler);
    },
  };
}
```

- [ ] **Step 2: .env.example に Gemini を追記 + stale な gpt-4o 記述を修正**

`apps/react-web/.env.example` の末尾に追記し、12 行目のコメントを修正する:

```
# 既定モデル (省略時 gpt-5.4-mini)、 こちらは VITE_ prefix が必要 (client 側で使う)
# VITE_OPENAI_MODEL=gpt-5.4-mini

# Gemini API key — Photo to Avatar のプロバイダ切替 (Gemini 選択時) で使う。
# /api/perceive/gemini middleware が server side で x-goog-api-key に足す。
GEMINI_API_KEY=

# Gemini 側の既定モデル (省略時 gemini-2.5-flash-lite)。 server side で使う。
# GEMINI_MODEL=gemini-2.5-flash-lite
```

（既存 12-13 行目の `gpt-4o` 記述は上記 1-2 行目の内容で置き換える）

- [ ] **Step 3: typecheck**

Run: `pnpm typecheck 2>&1 | tail -3`
Expected: 全 PASS。

- [ ] **Step 4: Commit**

```bash
git add apps/react-web/vite.config.ts apps/react-web/.env.example
git commit -m "✨ feat(app): /api/perceive/gemini proxy を追加 (GEMINI_API_KEY を server side 付与)"
```

---

### Task 4: App.tsx — ダイアログにプロバイダ選択を追加

**Files:**
- Modify: `apps/react-web/src/App.tsx`

- [ ] **Step 1: import と型を追加**

19 行目付近の import を変更:

```ts
import {
  createGeminiPerceiver,
  createOpenAIPerceiver,
  PerceiveError,
} from "@edv4h/alter-ego-perceive";
```

モジュールレベル（コンポーネント外、CATEGORIES 等の定義の近く）に型を追加:

```ts
/** Photo to Avatar の推定プロバイダ */
type PerceiveProvider = "openai" | "gemini";
```

- [ ] **Step 2: provider state を追加し perceiver 構築を切り替え**

`showOverwriteConfirm` state の近くに追加:

```ts
const [perceiveProvider, setPerceiveProvider] =
  useState<PerceiveProvider>("openai");
```

既存の perceiver useMemo（800-807 行）を置き換え:

```ts
// /api/perceive (OpenAI) / /api/perceive/gemini (Gemini) 経由で呼ぶ。
// API キーは server side で付与されるため、 クライアントは apiKey を渡さない。
const perceiver = useMemo<Perceiver>(() => {
  if (perceiveProvider === "gemini") {
    return createGeminiPerceiver({
      endpoint: "/api/perceive/gemini",
      schema,
    });
  }
  const model = import.meta.env.VITE_OPENAI_MODEL;
  return createOpenAIPerceiver({
    endpoint: "/api/perceive",
    schema,
    ...(model ? { model } : {}),
  });
}, [perceiveProvider]);
```

- [ ] **Step 3: ダイアログにラジオグループを追加**

確認ダイアログの `dialogBody` div と `dialogActions` div の間に挿入:

```tsx
<fieldset style={styles.providerFieldset}>
  <legend style={styles.providerLegend}>推定に使う AI</legend>
  <label style={styles.providerOption}>
    <input
      type="radio"
      name="perceive-provider"
      value="openai"
      checked={perceiveProvider === "openai"}
      onChange={() => setPerceiveProvider("openai")}
    />
    ChatGPT (gpt-5.4-mini)
  </label>
  <label style={styles.providerOption}>
    <input
      type="radio"
      name="perceive-provider"
      value="gemini"
      checked={perceiveProvider === "gemini"}
      onChange={() => setPerceiveProvider("gemini")}
    />
    Gemini (2.5 Flash-Lite)
  </label>
</fieldset>
```

- [ ] **Step 4: styles にラジオ用スタイルを追加**

`styles.dialogActions` の定義の近くに追加（既存の inline style 規約に合わせる）:

```ts
providerFieldset: {
  border: "1px solid #e0e0e0",
  borderRadius: 8,
  padding: "8px 12px",
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
} as const,
providerLegend: { fontSize: 12, color: "#666", padding: "0 4px" } as const,
providerOption: {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 14,
  cursor: "pointer",
} as const,
```

- [ ] **Step 5: 全テスト + typecheck**

Run: `pnpm test 2>&1 | tail -4 && pnpm typecheck 2>&1 | tail -3`
Expected: 118 tests PASS、typecheck 全 PASS。

- [ ] **Step 6: Commit**

```bash
git add apps/react-web/src/App.tsx
git commit -m "✨ feat(app): 上書き確認ダイアログにプロバイダ選択 (ChatGPT / Gemini) を追加"
```

---

### Task 5: 手動 E2E + PR 作成

- [ ] **Step 1: dev server で両プロバイダを検証**

```bash
# .env.local に OPENAI_API_KEY と GEMINI_API_KEY を設定したうえで
pnpm dev
```

確認項目:
- ChatGPT 選択 → 写真選択 → 推定 → アバター反映
- Gemini 選択 → 同じ写真 → 推定 → アバター反映
- GEMINI_API_KEY を一時的に外して Gemini 実行 → エラー overlay 表示
- Esc でダイアログが閉じる / ラジオ操作でフォーカスが壊れない

- [ ] **Step 2: push + PR 作成**

```bash
git push -u origin feat/perceive-gemini-provider
gh pr create \
  --title "✨ feat: Photo to Avatar に Gemini プロバイダ選択を追加" \
  --reviewer EdV4H \
  --label "🤖 claude-code" \
  --body "(設計書 docs/superpowers/specs/2026-06-10-gemini-perceiver-design.md にもとづく実装。変更点・Test plan を記載)"
```

PR 本文には以下を含める: 目的（2 プロバイダ比較検証）、変更ファイル一覧、proxy 構成図、Test plan（自動テスト 118 PASS + 手動 E2E チェックリスト）、dev 専用構成である旨の注意書き。
