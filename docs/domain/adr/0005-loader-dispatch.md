---
id: 0005
title: Loader 振り分けとアセット解決（スキーム方式）
status: proposed
date: 2026-06-01
deciders: [EdV4H]
tags: [loader, asset, plugin, core]
---

# ADR-0005: Loader 振り分けとアセット解決（スキーム方式）

## Context

複数の Loader が登録されたとき、どの Loader が Asset を担当するかは「登録順に `canHandle(asset)` を呼び、最初に `true` を返した Loader」（[loader.md](../../plugins/loader.md)）で決めていた。この方式には次の問題がある。

- **否定形の catch-all がアンチパターンになる**: HTTP Loader の例が `canHandle(asset) { return !asset.src.startsWith("mem:") }` と書かれていた。「自分以外」を否定形で判定するため、将来 `idb:` `fs:` などのスキームが増えても `true` を返して**横取り**する
- **取得不要アセットが取得系 Loader に拾われる**: 代表例 4（紋章・OGP）の `kind:"text"` / `src:"builtin:text"` は取得が不要だが、上記の否定形 HTTP Loader が拾って `fetch` し失敗する。専用 Renderer 前提とは書いてあるが、Loader レイヤーをどう通す（通さない）かが未定義だった

## Decision

**`Asset.src` を URI 風のスキーム付き文字列とし、Loader は担当スキームを宣言する。コアはスキームで振り分ける。**

### スキームの規約

- `Asset.src` は `<scheme>:<path>` 形式（例: `https://cdn.example.com/hair.svg`、`mem:hair-01`、`builtin:text`、`inline:...`）
- スキームは `src` の最初の `:` より前の部分。`:` を含まない `src` は **スキームなし（相対参照）** とし、空スキーム `""` として扱う
  - 同じ「最初の `:`」規則で一貫して割れる。例: `https://cdn.example.com/hair.svg` → スキーム `https`（`//` 以降は path）、`mem:hair-01` → スキーム `mem`、`parts/hair/01.svg` → スキーム `""`

### Loader 型

```ts
// 仕様検討中
interface Loader {
  readonly id: string;
  readonly schemes: string[];          // 担当する src スキーム（"" は相対参照）
  canHandle?(asset: Asset): boolean;   // 同一スキーム内での追加絞り込み（任意）
  load(asset: Asset, signal?: AbortSignal): Promise<Resource>;
  preload?(assets: Asset[]): Promise<void>;
}
```

### 振り分け

1. `asset.src` からスキームを取り出す
2. そのスキームを `schemes` に含む Loader を **登録順**に走査し、`canHandle` があればそれも `true` を返した **最初の Loader** が担当する
3. 該当 Loader がなければ `asset:error` を発火し、そのパーツは描画スキップ

- **否定形の catch-all は禁止**。「自分以外」ではなく「自分が担当するスキーム」を `schemes` で明示する
- `canHandle` は同一スキーム内でさらに絞り込みたい場合の任意オプション（例: 拡張子で分岐）
- 相対参照（スキームなし）を扱う Loader は `schemes` に `""` を含めて **明示的に opt-in** する。HTTP Loader は `schemes: ["", "http", "https"]` のように相対 + 絶対 URL を担当できる

### 取得不要アセット（builtin / inline）

- `builtin:` / `inline:` のような取得を伴わないアセットは、**専用 Loader プラグイン**（例: `@edv4h/alter-ego-plugin-loader-inline`）が担当し、`src` / `hints` / `x-*` をそのまま `Resource` 化して返す
- **コアはスキームを特別扱いしない**（headless / Minimal core の原則）。`builtin:` を担当する Loader が未登録なら、他スキーム同様 `asset:error` になる
- これにより代表例 4 の `kind:"text"` は HTTP Loader に拾われず、inline 系 Loader に正しく振り分けられる

## Consequences

### 良い影響

- 振り分けが予測可能になり、新スキームの追加が既存 Loader に影響しない
- 否定形 catch-all による意図しない横取りを構造的に排除
- 取得不要アセットの経路が定義され、`kind:"text"` のような非取得アセットを自然に扱える
- `canHandle` の役割が「スキーム内の追加絞り込み」に明確化される

### 悪い影響・トレードオフ

- コアにスキーム抽出・振り分けロジックが入る（ごく小さい）
- 既存の `Asset.src`（相対パス前提）の記述・例を、スキーム規約に合わせて更新する必要がある
- 相対参照を扱う Loader が複数 `""` を宣言すると曖昧になる（登録順で先勝ち。運用上は 1 つに絞ることを推奨）

### 影響範囲

- `@edv4h/alter-ego-core`（LoaderRegistry の振り分け）
- `Loader` 型（`schemes` 追加、`canHandle` を任意化）
- `docs/plugins/loader.md`（Loader 型・振り分けルール・HTTP Loader 例）
- `docs/schema.md`（`Asset.src` のスキーム規約）

### 追随タスク

- ~~スキームの正規化（大文字小文字、相対パスの baseUrl 解決規則）~~（小文字正規化・大小無視で照合、相対解決は担当 Loader 内で。[loader.md](../../plugins/loader.md#スキームの正規化と相対参照)）
- ~~相対参照 `""` を担当できる Loader を 1 つに制約するか（複数許容で先勝ちか）の最終確認~~（1 つに制約、複数は生成時に例外で確定）
- ~~`@edv4h/alter-ego-plugin-loader-inline` の仕様（`builtin:` / `inline:` の `Resource` 化）~~（最小契約を [loader.md](../../plugins/loader.md#取得不要アセットの契約loader-inline) に明記。パッケージ詳細は実装時）

## 参照

- [アセット取得を追加する（loader）](../../plugins/loader.md)
- [スキーマ仕様 — Asset](../../schema.md#asset)
- [ドメインモデル — Asset と Resource の関係](../model.md#asset-と-resource-の関係)
