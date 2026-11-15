# 写真から AI アバター生成 設計書

- **作成日**: 2026-06-05
- **状態**: draft
- **対象**: 写真をアップロードして AI が初期パラメータを推定 → 既存 UI で手動仕上げ、 という機能の追加
- **前提資料**: `/Users/tetsuyatakeda/Downloads/avatar-system-impl-design-v1.md` (アバター生成システム実装設計 v1)

## 目的

ユーザーが自分の写真をアップロードすると、 VLM (OpenAI Vision モデル) がアバターの初期パラメータ (`AvatarSeed`) を推定し、 既存 alter-ego の編集 UI に流し込む。 ユーザーはその初期状態を起点に、 alter-ego 既存の UI で微調整して完成させる。

## コアな設計判断 (確定事項)

- **AI 知覚は「初期推定」、 ユーザー手動仕上げが最終手段**。 VLM の精度に「似てる感」を 100% 依存させない。 既存 alter-ego UI が「手動仕上げ」の役割を担う。
- **AI 出力 = 既存 schema 直接 (selections + slotTransforms + color)**。 抽象記述子 (v1 設計の `shapeId/posY/spacing` 風) を導入せず、 mapping レイヤーをゼロにする。
- **クライアントから直接 VLM API を呼ぶ**。 サーバ不要。 API キーは `.env.local` で管理 (PoC 段階)。
- **VLM = OpenAI Vision モデル (gpt-4o / gpt-5)**。 Perceiver interface を切って adapter 化し、 将来差し替え可能にする。
- **UI エントリ = ヘッダー右側ボタン**。 Download PNG の隣に置く。
- **結果反映 = 完全上書き + 確認ダイアログ**。 既存編集を上書きする旨を明示してから適用。
- **背景推定は対象外**。 PoC スコープを絞る (将来追加可能)。

## 非ゴール

- ランタイムで画像生成モデルにアバターを描かせない (v1 設計の非ゴール 1 を継承)
- 写真を source of truth にしない。 編集・保存・再現は常に `AvatarSeed` 経由
- 「似てる感」を AI 単独で 100% 担保しない (手動仕上げ前提)
- 顔以外の検出・動画フレーム・リアルタイム推定は対象外
- onDevice 推論 (MediaPipe 等) は将来検討

## アーキテクチャ

3 段パイプライン (v1 設計を継承) を採用しつつ、 既存 alter-ego モジュールにマップする。

```
[写真ファイル] --A:Perception--> [AvatarSeed] --B:Compose--> [Engine state] --C:Render--> [SVG]
       ↑                              ↑                        ↑                ↑
   File API                  VLM (OpenAI)            既存 packages/core    既存 plugins/renderer-svg
                       + クライアント直接呼び出し
```

| v1 ステージ | 役割 | alter-ego の実装場所 |
|---|---|---|
| Stage A (Perception) | 写真 → AvatarSeed JSON | **新規 `packages/perceive`** (型 + Perceiver interface + OpenAI 実装) |
| Stage B (Composition) | JSON → Engine state | 既存 `packages/core` の `engine.select()` + slotTransforms setter |
| Stage C (Rendering) | Engine state → SVG | 既存 `plugins/renderer-svg` |

### パッケージ構成

```
packages/perceive/
├── src/
│   ├── index.ts          # 公開 API (Perceiver interface, AvatarSeed, helpers)
│   ├── types.ts          # AvatarSeed 型定義
│   ├── perceiver.ts      # Perceiver interface
│   ├── errors.ts         # PerceiveError
│   └── openai.ts         # createOpenAIPerceiver() — 既定実装
├── package.json
└── README.md
```

`@edv4h/alter-ego-perceive` として独立公開可能。 将来別 VLM (Claude / Gemini / onDevice) を実装する場合は `plugins/perceiver-<name>` として ADR 0002 命名規則に従って追加する。

## データ契約

### AvatarSeed (Perceiver の出力)

```ts
/**
 * AI 知覚層の出力。 写真から推定したアバターの初期構成。
 * 既存 alter-ego の state (selections + slotTransforms) と互換。
 * 全フィールド optional: AI が省略した部分は engine state の既定値を維持。
 */
export interface AvatarSeed {
  /** スロットごとのパーツ選択 (現状の selections と同じ形) */
  selections?: Record<string, { partId: string; color?: string }>;
  /** スロットごとの位置・サイズ・回転 (現状の slotTransforms と同じ形) */
  slotTransforms?: Record<string, {
    dx?: number;
    dy?: number;
    scale?: number;
    rotation?: number;
  }>;
  /** AI が選定した顕著特徴のメタ情報 (デバッグ・説明用) */
  salientFeatures?: Array<{ slot: string; reason: string }>;
}
```

**設計意図:**

- 全フィールド optional にすることで、 AI が一部の slot しか返さなくても落ちない
- `selections` だけ返した場合: 既存パーツが切り替わる
- `slotTransforms` も指定した場合: 「目を大きく」「鼻の位置を上に」等の微調整も初期反映
- `salientFeatures`: AI が何を見て選んだかをデバッグ / UI で確認するためのメタ情報

### Perceiver Interface

```ts
export interface PerceiveContext {
  /** 利用可能な slot 一覧と各 slot の partId 候補。 schema から自動構築する */
  schema: AvatarSchema;
}

export interface PerceiveOptions {
  /** AbortSignal でキャンセル可能 */
  signal?: AbortSignal;
}

export interface Perceiver {
  /**
   * 写真ファイルから AvatarSeed を推定する。
   * 失敗時は PerceiveError を throw。
   */
  perceive(file: Blob, options?: PerceiveOptions): Promise<AvatarSeed>;
}

export class PerceiveError extends Error {
  constructor(
    public readonly kind: "network" | "parse" | "validate" | "auth" | "cancelled",
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
  }
}
```

### OpenAI Perceiver

```ts
export interface OpenAIPerceiverOptions {
  apiKey: string;
  model?: string;              // 既定 "gpt-4o"
  schema: AvatarSchema;        // 利用可能な partId 候補をプロンプトに伝えるため
  endpoint?: string;           // 既定: OpenAI 標準エンドポイント
}

export function createOpenAIPerceiver(opts: OpenAIPerceiverOptions): Perceiver {
  return {
    async perceive(file, options) {
      // 1. file を data URL (base64) に変換
      // 2. schema から「利用可能な partId 一覧 + 各 slot の意味」をプロンプトに組み込み
      // 3. OpenAI Vision API を JSON schema mode で叩く
      //    - AbortSignal で fetch をキャンセル可能に
      //    - プロンプト: 「この人を識別する顕著特徴 2-3 を選び、 それを最も強調する
      //       partId / color / transform を出してください。 残りはデフォルトでよい」
      // 4. レスポンスを AvatarSeed としてバリデート (zod 等)
      //    - schema に無い partId は除外
      //    - color が不正な hex なら除外
      //    - slotTransforms の数値が範囲外 (scale < 0.3 等) なら clamp
      // 5. 妥当な AvatarSeed を返す。 何も拾えなければ PerceiveError("validate") を throw
    },
  };
}
```

### apps/react-web 側のヘルパ

```ts
/**
 * AvatarSeed を engine と React state に反映する。
 * - selections は engine.select() / engine.deselect() で書き換える
 * - slotTransforms は setSlotTransforms (React state) で書き換える
 */
function applySeedToEngine(
  engine: AvatarEngine,
  seed: AvatarSeed,
  setSlotTransforms: (next: Record<string, SlotTransform>) => void,
): void {
  if (seed.selections) {
    for (const [slot, sel] of Object.entries(seed.selections)) {
      engine.select({ slot, part: sel.partId, color: sel.color });
    }
  }
  if (seed.slotTransforms) {
    setSlotTransforms((prev) => {
      const next = { ...prev };
      for (const [slot, t] of Object.entries(seed.slotTransforms!)) {
        next[slot] = { ...IDENTITY_TRANSFORM, ...next[slot], ...t };
      }
      return next;
    });
  }
}
```

## UI フロー

```
[Photo to Avatar ボタン] (header 右側、 Download PNG の隣)
        │
        ▼
[既存編集があるか?] ── yes ──> [上書き確認ダイアログ「現在の編集を上書きします」] ── キャンセル ──> 中止
        │ no                                       │ OK
        ▼                                          ▼
[hidden <input type="file" accept="image/*"> をトリガー]
        │
        ▼
[ファイル選択完了]
        │
        ▼
[アバターパネル上に overlay 表示「写真を解析中…」+ キャンセルボタン]
        │
        ▼
[perceiver.perceive(file, { signal }) を呼ぶ]
        │
        ├── 成功 ──> [applySeedToEngine(engine, seed, setSlotTransforms)] ──> [overlay 消す]
        ├── エラー ──> [overlay に エラーメッセージ + 再試行ボタン]
        └── キャンセル ──> [overlay 消す、 元の state 維持]
```

### ヘッダーレイアウト

```
[Avatar? Avatar!]                        [Photo to Avatar] [Download PNG]
        ↑ title                              ↑ 新規追加        ↑ 既存
```

### overlay (推定中)

アバターパネル上に半透明レイヤーで表示:

```
┌───────────────────────────┐
│                           │
│      写真を解析中…         │
│      ▓▓▓▓▓░░░ (spinner)   │
│                           │
│      [キャンセル]          │
│                           │
└───────────────────────────┘
```

### API キーの管理 (PoC 段階)

- `.env.local` の `VITE_OPENAI_API_KEY` から読み込む
- `.gitignore` に `.env.local` を追加 (既に追加されている)
- API キー未設定時は「Photo to Avatar」ボタンを disabled + tooltip で告知
- 本番運用時の安全な扱いは **未決** (UI 入力 or サーバ経由に移行検討)

## エラーハンドリング

| `PerceiveError.kind` | 発生条件 | UI 対応 |
|---|---|---|
| `network` | OpenAI API 通信失敗 | overlay に「ネットワークエラー」+ [再試行] ボタン |
| `auth` | API キー無効 / 401 | overlay に「API キーが正しくありません」 |
| `parse` | レスポンスが JSON にならない | overlay に「結果の解釈に失敗」+ [再試行] |
| `validate` | JSON は出たが schema に無い partId 等 | 不正フィールドだけ除外して残りを適用 |
| `cancelled` | AbortSignal | overlay を閉じる、 元の state 維持 |

加えて、 **写真に顔が写っていない / アバター化困難な場合** は AI 側に「seed が出せなかった」と返させ、 `validate` 扱いで「別の写真を試してください」を表示する。

## PoC スコープ (第一段の実装範囲)

### 含めるもの

- `packages/perceive`: Perceiver interface + types + OpenAI 実装 (`createOpenAIPerceiver`)
- `apps/react-web` 側:
  - `onPhotoToAvatar` handler
  - overlay UI
  - 上書き確認ダイアログ
  - API キーは `.env.local` から
- `applySeedToEngine(engine, seed, setSlotTransforms)`: AvatarSeed を既存 state に反映するヘルパ
- 写真形式: jpeg / png / webp
- サイズ上限 5MB (超過時はクライアント側で `<canvas>` で 1024px に縮小してから送信)
- バリデーション (zod 等で schema 内 partId のみ通す)

### 含めないもの (将来)

- 背景推定 (background 除外)
- 複数枚の写真 / 動画フレーム / リアルタイム推定
- 顔以外の検出 (アクセサリの自動付与等)
- onDevice 推論 (MediaPipe 等への adapter 差し替え)
- API キー入力 UI (本番運用時の安全な扱い)

## 受け入れ基準

- **Stage A (Perceiver)**: jpeg/png/webp 画像を投げて `AvatarSeed` (型妥当) を返す。 不正値は除外して安全に返す
- **エンジン反映**: `applySeedToEngine(engine, seed, setSlotTransforms)` 呼び出し後、 既存 alter-ego UI で seed の partId / color / transform が反映された状態が確認できる
- **エラー耐性**: ネットワーク切断 / 不正 API キー / 顔なし画像でアプリが落ちない。 overlay に適切なエラーが出る
- **「似てる感」評価**: PoC 完成後、 5〜10 人分の写真で人手レビュー。 数値化は後回し (recognizability の評価方法は未決)

## 未決事項 (実装に入る前に決める)

1. **「既存編集あり」判定**: 初期状態と異なる selection が一つでもあれば確認ダイアログを出すか、 常にダイアログを出すか
2. **プロンプトの具体的文言**: 「顕著特徴 2-3」をどう指示するか (実装フェーズで反復チューニング)
3. **recognizability の評価方法**: PoC 完成後に人手で 5〜10 枚試して定性評価。 数値化は後回し
4. **OpenAI モデル**: gpt-4o / gpt-5 のどちらを既定にするか (コスト / 速度 / 品質トレードオフ。 実装時に試行)
5. **API キーの本番運用**: クライアント直接呼び出しのままにするか、 サーバ経由に切り替えるか (PoC 完了後に再検討)
