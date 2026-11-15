---
id: 0001
title: 統一プラグインインターフェース（kind を持たない Plugin 型）
status: accepted
date: 2026-04-21
deciders: [EdV4H]
tags: [plugin, architecture, core]
---

# ADR-0001: 統一プラグインインターフェース（kind を持たない Plugin 型）

## Context

初期設計では、プラグインを `kind: "renderer" | "loader" | "parts" | "exporter"` というユニオン型で種別分けし、種別ごとに別インターフェースを定義する案だった（Renderer / Loader / Parts / Exporter の 4 型）。

しかしこの案には以下の課題がある。

- 1 プラグインが複数責務を持ちたい場合（例: パーツ群と専用 Renderer を同梱）に分割が不自然
- 新しい責務（例: アニメーション、サウンド）を足すたびにユニオン型を広げる必要があり、破壊的変更になる
- 参考にした `usketch`（同一方針の類似プロジェクト）は **単一 `UsketchPlugin` 型 + `setup(ctx)` で自己登録** のアプローチを採っており、実装・ドキュメントの一貫性が高かった

## Decision

プラグインは **単一のインターフェース `Plugin`** で表現する。種別フィールド（`kind`）は持たない。

```ts
interface Plugin {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  setup(ctx: PluginContext): void | Promise<void>;
  teardown?(): void | Promise<void>;
}
```

責務分割は **`PluginContext` 上の Registry**（`ctx.renderer` / `ctx.loader` / `ctx.parts` / `ctx.exporter`）に対する **`add` / `addFragment` での自己登録** によって実現する。1 プラグインが複数の Registry に登録してもよい。

プラグインが何を担当するかは **パッケージ命名**（[ADR-0002](./0002-package-naming.md)）で表現する。

## Consequences

### 良い影響

- 1 プラグインが複数責務を自然に持てる
- 新しい責務（Registry）を足すときに、既存のプラグインインターフェースを変更せずに済む
- プラグインをラップ・合成するのが容易
- 型定義が単純になる（4 型 → 1 型）

### 悪い影響・トレードオフ

- プラグインが何を登録するかは「実行してみないと分からない」（静的型で責務を絞れない）
- プラグイン登録順に意味が出うる（依存関係がある場合、並び順で解決する）

### 影響範囲

- `@edv4h/alter-ego-core` の公開インターフェース（`Plugin` / `PluginContext` / 各 Registry）
- 全プラグインパッケージ（`@edv4h/alter-ego-plugin-*`）
- `docs/architecture.md` / `docs/plugins/*`（更新済み）

### 追随タスク

- プラグイン間の依存関係を明示する仕組み（未着手。必要性が出たら別 ADR）
- `core` とプラグインのバージョン互換性チェック（未着手）

## 参照

- 先行プロジェクト: `usketch` の `UsketchPlugin` と `PluginContext`（`setup(ctx)` + Registry 自己登録方式）
