---
id: 0011
title: perceive のプロンプトをスキーマから生成する
status: accepted
date: 2026-11-01
deciders: [EdV4H]
tags: [perceive, schema, prompt]
---

# ADR-0011: perceive のプロンプトをスキーマから生成する

## Context

`@edv4h/alter-ego-perceive` は「写真から任意のスキーマの `AvatarSeed` を推定する」汎用パッケージとして置かれている。しかし `packages/perceive/src/prompt.ts` には、リファレンス実装のスキーマに固有の指示が直書きされている。

- `face.color = 肌の色`、`hair_front.color = 髪の色`、`eye_left.color / eye_right.color = 瞳の色` など、Slot id ごとの意味
- 「`_left` / `_right` の Slot は同じ番号を選ぶ」「`hair_back` は `hair_front` と同じ番号」などのペア規則

このため、別のスキーマ（非人型や別の素材セット）で使うと、存在しない Slot について指示するプロンプトになる。Issue #42 は Part に description を足してプロンプトに使う方向を提案している。

## Decision

**perceive のプロンプトは、スキーマの記述（Slot / Part の `description` とグループ定義）と `x-perceive` 拡張から組み立て、Slot id を直書きしない。**

### スキーマ側

- Slot と Part に任意の `description` を追加する（人間にも AI にも読める説明）
- perceive 固有のヒントは `x-perceive` 拡張に置く

```json
{
  "id": "face",
  "name": "顔",
  "description": "顔の輪郭。color は肌の色",
  "x-perceive": { "colorHint": "写真の顔の代表的な肌色を 1 色" }
}
```

### perceive 側

- プロンプトは「共通の指示（出力形式・安全規則）」と「スキーマから生成する指示（Slot ごとの説明、palette、グループ）」の 2 部で組み立てる
- ペアの整合は [ADR-0007](./0007-slot-groups.md) のグループ定義に従い、core の解決関数で正規化する。`normalize.ts` の Slot id 直書きは削除する
- 色の候補は [ADR-0008](./0008-color-bindings.md) の `palette` があればそこから選ばせる

### やらないこと

- スキーマに LLM のプロンプト文そのものを書く欄は設けない（`x-perceive` はヒントに留める）

## Consequences

### 良い影響

- perceive が任意のスキーマで動き、パッケージ名どおりの汎用性を持つ
- 素材の説明をスキーマ作者が管理でき、精度改善（Issue #42〜#46）がスキーマの編集で進められる

### 悪い影響・トレードオフ

- 現在のプロンプトで得ている精度を、スキーマ側の記述で再現する作業が必要。移行時に精度が落ちないことを既存テストと手動評価で確認する
- プロンプトが長くなる場合がある（Slot / Part 数に比例）

### 影響範囲

- `@edv4h/alter-ego-schema`（`description` の追加）
- `@edv4h/alter-ego-perceive`（`prompt.ts` / `normalize.ts`）
- `apps/react-web/src/avatar.schema.json`（説明と `x-perceive` の追記）
