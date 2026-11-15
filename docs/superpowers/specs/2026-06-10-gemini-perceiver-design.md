# Gemini Perceiver + プロバイダ選択 設計書

**日付:** 2026-06-10
**ステータス:** 承認済み
**前提:** PR #39 (Photo to Avatar app 統合, proxy 方式) / PR #49 (DEFAULT_MODEL = gpt-5.4-mini) merge 済み

## 目的

写真からのアバター推定 (Photo to Avatar) で、OpenAI に加えて Google Gemini を選択できるようにする。
アップロード時の上書き確認ダイアログでプロバイダを選び、同じ写真で 2 プロバイダの推定品質を比較検証できる状態を作る。

## 非目標

- responseSchema による厳密スキーマ強制（精度問題が出た場合の将来改善カード）
- `@google/generative-ai` SDK の導入（fetch 直接方式を維持）
- production proxy（既存どおり dev 専用 / PoC 構成）
- 推定結果の自動比較・スコアリング（検証は人間の目視）

## 設計

### 1. パッケージ層 (`packages/perceive`)

#### `prompt.ts`（新設・リファクタ）

`openai.ts` 内の `SYSTEM_PROMPT` と `buildUserPrompt()` を抽出して共有モジュール化する。
両 adapter が同一プロンプトを使うことで、プロバイダ間の品質比較が公平になる。

#### `gemini.ts`（新設）

```ts
export interface GeminiPerceiverOptions {
  /** 省略時は x-goog-api-key ヘッダーを送らない (proxy モード) */
  apiKey?: string;
  schema: AvatarSchema;
  /** 既定 "gemini-2.5-flash-lite"。endpoint 指定時は無視される（モデルは proxy 側の責務） */
  model?: string;
  /** 指定時はこの URL にそのまま POST する (proxy モード用フック) */
  endpoint?: string;
}

export function createGeminiPerceiver(opts: GeminiPerceiverOptions): Perceiver;
```

- 直接呼び出し時の URL: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
  - Gemini はモデル名が URL パスに入るため、`endpoint` 指定時はモデル選択を proxy 側に委ねる
- リクエスト形式:
  - `systemInstruction.parts[].text` = `SYSTEM_PROMPT`
  - `contents[0].parts` = `[{ text: buildUserPrompt(schema) }, { inline_data: { mime_type, data: base64 } }]`
  - `generationConfig.responseMimeType: "application/json"`
- 画像は既存 `resizeImageBlob()` で縮小後、base64 化（data URL から prefix を除去）
- レスポンス: `candidates[0].content.parts[0].text` → `JSON.parse` → `validateSeed()`
- エラーマッピング（openai.ts と同一体系）:
  - 401 / 403 → `auth`
  - その他非 2xx → `network`
  - abort → `cancelled`
  - JSON 不正 → `parse`、validateSeed 失敗 / 空 seed → `validate`
- `index.ts` から `createGeminiPerceiver` / `GeminiPerceiverOptions` を export

### 2. proxy 層 (`apps/react-web/vite.config.ts`)

- 既存 `POST /api/perceive`（→ OpenAI chat completions）は変更しない
- **`POST /api/perceive/gemini` を追加**:
  - forward 先: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
  - モデル: `GEMINI_MODEL` env（既定 `gemini-2.5-flash-lite`）
  - 認証: `x-goog-api-key: ${GEMINI_API_KEY}`（`loadEnv()` で読込、OpenAI と同方式）
  - `GEMINI_API_KEY` 未設定時は 500 を返す（UI 側で既存のネットワークエラー表示）
- ルート判定は `/api/perceive/gemini` を `/api/perceive` より**先に**評価する（前方一致の衝突回避）
- `.env.example` に `GEMINI_API_KEY` / `GEMINI_MODEL`（任意）を追記

### 3. UI 層 (`apps/react-web/src/App.tsx`)

- 上書き確認ダイアログにプロバイダ選択ラジオを追加:
  - 「ChatGPT (gpt-5.4-mini)」= 既定
  - 「Gemini (2.5 Flash-Lite)」
- 「続行」時、選択に応じて perceiver を構築:
  - OpenAI: `createOpenAIPerceiver({ endpoint: "/api/perceive", schema })`
  - Gemini: `createGeminiPerceiver({ endpoint: "/api/perceive/gemini", schema })`
- 以降のフロー（overlay 表示 / abort / エラー表示 / seed 反映）は既存のまま

### 4. テスト

- `packages/perceive/src/gemini.test.ts`（openai.test.ts と同構成）:
  - 既定モデルが URL に入る / model オプションで変わる
  - endpoint 指定時はその URL に POST し model を無視する
  - apiKey 指定時は `x-goog-api-key` ヘッダーが付く / 省略時は付かない
  - 401 → auth、500 → network、abort → cancelled、非 JSON → parse、空 seed → validate
- `prompt.ts` 抽出後も openai.test.ts が全 PASS（リグレッション確認）
- 手動 E2E: 両プロバイダで 写真 → 確認ダイアログ → 推定 → 反映、`GEMINI_API_KEY` 未設定時のエラー表示

## 検証手順（実装後）

1. `.env.local` に `OPENAI_API_KEY` と `GEMINI_API_KEY` を設定して `pnpm dev`
2. 同じ写真でプロバイダを変えて 2 回推定し、パーツ選択・色の妥当性を目視比較
3. 品質差・コスト・レイテンシの所感を記録し、既定プロバイダ／モデルの見直し判断につなげる
