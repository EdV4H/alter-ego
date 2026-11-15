---
id: 0013
title: React 向けのフックを @edv4h/alter-ego-react として提供する
status: accepted
date: 2026-11-10
deciders: [EdV4H]
tags: [react, packaging, binding]
---

# ADR-0013: React 向けのフックを @edv4h/alter-ego-react として提供する

## Context

ゴール G1 は「任意の UI/FW から呼び出せる」で、`docs/architecture.md` は `@edv4h/alter-ego-react` を「React 向けバインディング（`useAvatar` 等）」として挙げている。実態は次のとおり。

- `packages/react` は中身の無いパッケージ（`private: true`、`export const __placeholder = true` だけ）
- React からエンジンを使うためのフックは、デモアプリの `apps/react-web/src/engine/` にある
  - `useAvatarEngine`: エンジンを作って描画先に mount し、アンマウントで dispose する。スキーマが変われば作り直す。StrictMode の 2 回実行でも、mount の途中で dispose しないように待つ
  - `useAvatarState`: `state:change` を `useSyncExternalStore` で購読し、`engine.state` をそのまま返す
- 2 つ合わせて約 100 行で、デモの 4 か所から使われている。中身はデモに固有のものをほぼ含まない
- React で alter-ego を使いたい人は、今はこのコードを写すしかない。とくに StrictMode と非同期の mount の組み合わせは、写し間違えると描画先を失う

## Decision

**デモの 2 つのフックを、描画先の種類に依存しない形にして `@edv4h/alter-ego-react` に移し、公開パッケージにする。** パッケージの範囲はこの 2 つのフックに絞る。

### API

```ts
interface UseAvatarEngineOptions {
  readonly schema: AvatarSchema;
  /** エンジンごとに新しいプラグインを作る（プラグインは使い回さない） */
  readonly createPlugins: () => Plugin[];
  /** createAvatarEngine にそのまま渡す（ADR-0010） */
  readonly validate?: (input: unknown) => ValidateResult;
  /** エンジンを作った直後（mount の前）に呼ぶ。後片付けの関数を返せる */
  readonly onCreate?: (engine: AvatarEngine) => (() => void) | void;
  /** mount が終わった直後に 1 回呼ぶ。後片付けの関数を返せる */
  readonly onReady?: (engine: AvatarEngine) => (() => void) | void;
}

interface UseAvatarEngineResult<T extends Element> {
  /** 描画先の要素に渡す ref */
  readonly mountRef: React.RefObject<T | null>;
  /** mount まで終わったエンジン。準備中は null */
  readonly engine: AvatarEngine | null;
  readonly error: Error | null;
}

function useAvatarEngine<T extends Element = Element>(
  options: UseAvatarEngineOptions,
): UseAvatarEngineResult<T>;

/** エンジンの状態を読む。engine が null の間は空の状態を返す */
function useAvatarState(engine: AvatarEngine | null): AvatarState;
```

### 規則

- 描画先の型は呼び出し側が決める（`useAvatarEngine<SVGSVGElement>(...)` など）。core の `mount(target: unknown)` に合わせ、パッケージは SVG を前提にしない
- エンジンを作り直すのは `schema` のオブジェクトが変わったときだけ。`createPlugins` や各コールバックは最新のものを使うが、変わっても作り直さない
- StrictMode で effect が 2 回走っても、mount が終わってから古いエンジンを dispose する（今のデモの動きを保つ）
- `error` は `Error` にそろえる。`Error` でない値が投げられたら `Error` で包む
- `useAvatarState` はサーバー描画用のスナップショットとして空の状態を返す（`useSyncExternalStore` の第 3 引数）
- 依存は `react`（`^18 || ^19`）を peerDependencies に、`@edv4h/alter-ego-core` を dependencies に置く。plugins と同じ置き方にそろえ、peer にするかは npm 公開の準備でまとめて見直す
- `apps/react-web` はこのパッケージを使うように変え、`src/engine/` を消す

### やらないこと

- Provider / Context は用意しない。engine は props か各アプリの Context で渡せば足りる。複数の画面から同じエンジンを使う例が出てきたら別の ADR で足す
- パーツ選択のパネルなど UI 部品は含めない（見た目を持たない方針。部品はデモに残す）
- `<AvatarSvg>` のような特定の Renderer 向けのコンポーネントは含めない
- 一部だけを購読する selector 付きのフックは作らない。状態は小さく、`engine.state` は変更ごとに新しいオブジェクトなので、まるごと購読で足りる
- 保存した状態をエンジンに丸ごと読み込む処理（デモの `applyStateToEngine`）は含めない。core に持たせるかは [ADR-0012](./0012-state-renames-and-lenient-read.md) の追随タスクで決める
- Vue 版（`@edv4h/alter-ego-vue`）は今回作らない。作るときは同じ 2 つの形にそろえる

## Consequences

### 良い影響

- React の利用者は `npm install` して 2 つのフックを呼ぶだけで使い始められる
- StrictMode と非同期 mount の扱いをパッケージ側で 1 回だけ正しく書けばよくなる
- デモがパッケージを使うので、Playwright の煙テストがそのままパッケージの動作確認になる

### 悪い影響・トレードオフ

- 公開パッケージが 1 つ増え、React のメジャー更新に追随する手間が増える
- フックの形を公開すると変えにくくなる。alpha の間（0.x）は変える可能性があると README に書く

### 影響範囲

- `packages/react`（実装、テスト、README、`private` を外す、LICENSE を置く）
- `apps/react-web`（`src/engine/` を消し、`@edv4h/alter-ego-react` から import）
- `docs/architecture.md`（パッケージ表の「`useAvatar` 等」を実際の名前に）
- `README.md`（パッケージ一覧の状態）
