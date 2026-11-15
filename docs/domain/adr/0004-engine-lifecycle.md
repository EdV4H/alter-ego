---
id: 0004
title: AvatarEngine のライフサイクル（mount/unmount と teardown の分離）
status: accepted
date: 2026-05-29
deciders: [EdV4H]
tags: [core, lifecycle, plugin, events]
---

# ADR-0004: AvatarEngine のライフサイクル（mount/unmount と teardown の分離）

## Context

プラグインガイドには「`teardown` は `engine.unmount()` 時に逆順で呼ばれる」（`docs/plugins/README.md`）とある。一方でアーキテクチャ設計は `mount()` / `unmount()` を `AvatarEngine` の通常メソッドとして定義している。この 2 つを素直に読むと、以下が未定義になる。

- `unmount()` 後に **再 `mount()` できるのか**。できる場合、`teardown` 済み（= プラグインの後始末完了）のプラグインはどう振る舞うのか
- `setup` が呼ばれるのは生成時の 1 回だけなので、`unmount` で `teardown` してしまうと、再 `mount` 時に Registry への再登録経路がない

加えて、コアのイベントには `state:change` / `asset:load` / `asset:error` / `render:ready` はあるが、**描画失敗や mount 失敗を伝えるイベントがない**。

UI フレームワーク統合では、ルート遷移によるアンマウント／再マウント、React StrictMode の二重 mount など、**同一エンジンの mount/unmount を繰り返す**シナリオが現実に存在する。ライフサイクルを曖昧なまま実装すると、リソース解放のバグや再描画不能に直結する。

検討した代替案:

- **使い捨て（`unmount` = `teardown`、再 mount 不可）**: mount 1 回・unmount で終了し、再描画は新しいエンジンを生成する。現状ドキュメントの暗黙の前提に最も近く実装は単純だが、UI フレームワークでの再マウントが扱いにくく、毎回スキーマ再パース・プラグイン再 setup のコストがかかる

## Decision

**`AvatarEngine` を再利用可能とし、「描画先への attach/detach（mount/unmount）」と「プラグインの後始末（teardown）」を分離する。`teardown` は新設する `dispose()` 時のみ実行する。**

### ライフサイクル

```
createAvatarEngine()            ── setup(ctx) を plugins 配列順に 1 回
        │
        ▼
  [ mount(target) → render* → unmount() ]   ── 繰り返し可
        │
        ▼
  dispose()                     ── teardown() を逆順に 1 回。以後そのエンジンは使用不可
```

- **`mount(target)` / `unmount()`** は描画先への attach / detach。`unmount()` は DOM・イベントリスナ・GPU リソース等の **描画リソースを解放**するが、`state` と Registry（登録済みプラグインの成果）は保持し、**再 `mount()` を許す**
- **`teardown` は `dispose()` 時のみ**呼ぶ。`unmount()` では呼ばない（`docs/plugins/README.md` の現記述を修正する）
- `setup` は生成時の 1 回のみ。`dispose()` 後の再利用はできない（必要なら新しいエンジンを生成する）

### API 追加

```ts
// 仕様検討中
interface AvatarEngine {
  // ... 既存
  mount(target: unknown): Promise<void>;
  unmount(): void;            // 描画先から detach。再 mount 可
  dispose(): void | Promise<void>;  // teardown を逆順実行。エンジンを破棄
}
```

Renderer 側の `mount` / `unmount` も同じ意味論（attach / detach、再 mount 可）に揃える。

### イベント追加

| イベント | タイミング |
| --- | --- |
| `render:error` | Renderer の描画が失敗した時（新設） |
| `render:ready` | mount 後、必要なアセットが揃い描画可能になった時。**mount ごとに発火しうる**ことを明記 |

- `mount()` 自体の失敗は **例外**で通知する（silent fallback は禁止の原則に従う）

## Consequences

### 良い影響

- UI フレームワーク統合（ルート遷移・StrictMode 二重 mount・タブ切替）が素直になる
- mount/unmount のたびにスキーマ再パース・プラグイン再 setup をしなくて済む
- 「描画先の付け外し」と「プラグインの寿命」が分離され、責務が明確になる
- 描画失敗・mount 失敗の通知経路ができ、エラーの握り潰しを防げる

### 悪い影響・トレードオフ

- `dispose()` が増え、利用者・FW バインディングが **破棄を明示的に呼ぶ責務**を負う（呼び忘れるとリーク）
- `unmount()` が「何を解放し、何を保持するか」の線引きを Renderer 実装者が守る必要がある
- 既存ドキュメント（`plugins/README.md` のライフサイクル記述、`architecture.md` のイベント表・`AvatarEngine` 定義）の修正が必要

### 影響範囲

- `@edv4h/alter-ego-core`（`AvatarEngine` の `dispose` 追加、teardown 実行タイミング、イベント発火）
- 全 Renderer プラグイン（`mount`/`unmount` の意味論統一）
- `@edv4h/alter-ego-react` / `@edv4h/alter-ego-vue`（FW のライフサイクルへの `mount`/`unmount`/`dispose` の対応付け）
- `docs/architecture.md`（イベント表・`AvatarEngine` 定義）、`docs/plugins/README.md`（ライフサイクル節）

### 追随タスク

- ~~`docs/plugins/README.md` のライフサイクル図と「`teardown` は `unmount()` 時」記述を本 ADR に合わせて修正~~（対応済み）
- ~~`docs/architecture.md` のイベント表に `render:error` を追加、`AvatarEngine` 定義に `dispose()` を追加~~（対応済み）
- ~~`unmount` 後に再 `mount` した際の `render:ready` 再発火など、イベント発火回数の詳細仕様~~（mount サイクルごとに 1 回で確定。[アーキテクチャ設計](../../architecture.md#イベント)）

## 参照

- [アーキテクチャ設計 — コアの内部構造 / イベント](../../architecture.md)
- [プラグインガイド — ライフサイクル](../../plugins/README.md)
- [描画を追加する（renderer）](../../plugins/renderer.md)
