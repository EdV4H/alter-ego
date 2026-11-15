# @edv4h/alter-ego-react

`alter-ego` を React から使うためのフック。描画先・Renderer・UI 部品は持たず、エンジンの作成と破棄、状態の購読だけを受け持つ（[ADR-0013](https://github.com/EdV4H/alter-ego/blob/main/docs/domain/adr/0013-react-bindings-package.md)）。

alpha（0.x）の間は、フックの形が変わることがあります。

## インストール

```sh
npm install @edv4h/alter-ego-react react
```

ESM のみ。0.x の間は minor でも壊れる変更が入ることがある（[CHANGELOG](./CHANGELOG.md)）。

## 使い方

```tsx
import { useAvatarEngine, useAvatarState } from "@edv4h/alter-ego-react";
import { svgRendererPlugin } from "@edv4h/alter-ego-plugin-renderer-svg";
import { httpLoaderPlugin } from "@edv4h/alter-ego-plugin-loader-http";
import schema from "./avatar.schema.json";

// プラグインはエンジンごとに作り直すので、作る関数を渡す
const createPlugins = () => [httpLoaderPlugin({ baseUrl: "/assets/" }), svgRendererPlugin()];

export function Avatar() {
  const { mountRef, engine, error } = useAvatarEngine<SVGSVGElement>({ schema, createPlugins });
  const state = useAvatarState(engine);

  if (error) return <p role="alert">{error.message}</p>;
  return (
    <>
      <svg ref={mountRef} viewBox="0 0 400 400" />
      <button
        disabled={!engine}
        onClick={() => engine?.select({ slot: "hair", part: "hair-02" })}
      >
        髪を変える（今: {state.selections.hair?.partId ?? "なし"}）
      </button>
    </>
  );
}
```

## API

### `useAvatarEngine<T extends Element>(options)`

エンジンを作って描画先に mount し、コンポーネントが外れたら破棄する。

| オプション | 必須 | 説明 |
| --- | --- | --- |
| `schema` | ✅ | アバターのスキーマ。このオブジェクトが変わったときだけエンジンを作り直す |
| `createPlugins` | ✅ | エンジンごとに新しいプラグインの配列を返す関数 |
| `validate` | ❌ | `createAvatarEngine` に渡す検証関数 |
| `onCreate` | ❌ | エンジンを作った直後（mount の前）に呼ぶ。イベントの購読などに使い、後片付けの関数を返せる |
| `onReady` | ❌ | mount が終わった直後に 1 回呼ぶ。初期値の設定や保存の復元に使い、後片付けの関数を返せる |

戻り値は `{ mountRef, engine, error }`。`mountRef` を描画先の要素に渡す。`engine` は mount まで終わるまで `null`。作成か mount に失敗したら `error` に `Error` が入る。

- 描画先の型は型引数で決める（renderer-svg なら `SVGSVGElement`）
- `createPlugins` やコールバックは毎回最新のものを使う。変わってもエンジンは作り直さない
- StrictMode で effect が 2 回走っても、mount が終わってから古いエンジンを破棄する

### `useAvatarState(engine)`

エンジンの状態（`AvatarState`）を返し、`state:change` のたびに再描画する。`engine` が `null` の間と、サーバー描画では空の状態を返す。

## 動く例

[apps/react-web](https://github.com/EdV4H/alter-ego/blob/main/apps/react-web) がこのパッケージを使っています。
