---
id: 0002
title: プラグインパッケージ命名規則
status: accepted
date: 2026-04-21
deciders: [EdV4H]
tags: [naming, packaging, plugin]
---

# ADR-0002: プラグインパッケージ命名規則

## Context

[ADR-0001](./0001-unified-plugin-interface.md) により、プラグインは統一インターフェースで種別フィールドを持たなくなった。その結果、**プラグインが何を担当するか**は型からは読み取れず、**パッケージ名で示す必要**がある。

初期案では `@edv4h/alter-ego-renderer-svg` のように役割ごとにトップレベル命名を分けていたが、以下の理由から不都合が生じる。

- core / 公式パッケージ（`core`, `schema`, `react`, `vue`）とプラグインが同じ名前空間に並び、プラグインとそうでないものが区別しにくい
- プラグインであることを示す明示的なマーカーがない
- サードパーティ向け命名規約（`alter-ego-plugin-*` 等）と公式スコープの命名がずれる

## Decision

プラグインパッケージは以下の命名規則に従う。

- **公式**: `@edv4h/alter-ego-plugin-<role>-<name>`
- **サードパーティ推奨**: `alter-ego-plugin-<role>-<name>`
- `<role>` は次のいずれか:
  - `renderer` — 描画を追加する
  - `loader` — アセット取得経路を追加する
  - `parts` — パーツ群（スキーマ断片）を追加する
  - `exporter` — 書き出し器を追加する
- 複数責務を兼ねるプラグインは、**代表的な役割**を `<role>` に据える

非プラグインの公式パッケージはこれまで通り `@edv4h/alter-ego-<name>` のまま変えない（例: `@edv4h/alter-ego-core`, `@edv4h/alter-ego-schema`, `@edv4h/alter-ego-react`）。

## Consequences

### 良い影響

- `@edv4h/alter-ego-plugin-*` を見ればプラグインだと一目で分かる
- `<role>` セグメントで主責務が自己説明的になる
- 公式・サードパーティで命名規約が揃う

### 悪い影響・トレードオフ

- パッケージ名が 1 セグメント長くなる
- 複数責務プラグインの `<role>` 選択に迷う場合がある（その場合は README で責務を明記）

### 影響範囲

- 全プラグインパッケージの命名
- `README.md` / `docs/architecture.md` / `docs/plugins/*` のコード例とパッケージ一覧（更新済み）

### 追随タスク

- 実パッケージ公開時に scope とパッケージ名を最終確認
- 既存コード・ドキュメントに旧命名の残骸が混入していないか定期的にチェック
