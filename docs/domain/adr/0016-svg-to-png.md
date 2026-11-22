---
id: 0016
title: 描いた SVG を PNG にする関数を renderer-svg に足し、背景は状態に入れない
status: accepted
date: 2026-11-22
deciders: [EdV4H]
tags: [renderer, export, png, background]
---

# ADR-0016: 描いた SVG を PNG にする関数を renderer-svg に足し、背景は状態に入れない

## Context

アバターを作ったあと、プロフィール画像などに使うために PNG にしたい場面が多い。今は次のとおり。

- PNG 書き出しはデモの `apps/react-web/src/features/export-png/export-png.ts` にだけある（約 100 行）。SVG を複製し、`<image>` を data URI にして canvas の汚染を避け、viewBox から書き出しの寸法を決め、背景を塗ってから描く
- 背景もデモの `features/background/` にあり、`AvatarState` には入っていない。デモは背景を状態と並べて localStorage に保存している
- Exporter（`ctx.exporter.add`）は `docs/plugins/exporter.md` で「仕様検討中」のまま。登録先の `ExporterRegistry` は値を受け取るだけで、呼び出す手段が無い
- PNG にしたいアプリは、canvas の汚染や寸法の計算をそれぞれ写すことになる

検討した案:

- **Exporter の仕様を決め、`@edv4h/alter-ego-plugin-exporter-png` を作る**: 形はきれいだが、Exporter の入力（resources を渡すか、どう呼び出すか）を今決めることになる。サーバーで PNG を作る用途はまだ無い
- **背景を `AvatarState` に入れる**: 状態だけで見た目が決まるが、背景はアバターの構成（どの Slot にどの Part）ではなく、置き場所の見せ方。画像の背景まで状態に入れると状態が大きくなる
- **描いた SVG から PNG を作る関数を renderer-svg に置き、背景は引数で渡す（採用）**

## Decision

**`@edv4h/alter-ego-plugin-renderer-svg` に `svgToPng` を足す。背景は `AvatarState` に入れず、書き出しの引数で渡す。**

```ts
interface SvgToPngOptions {
  /** 長辺の画素数。短辺は viewBox の比で決める */
  readonly size: number;
  /** 背景色（hex）。省略すると透明 */
  readonly background?: string;
}

/** 描画中の <svg> を PNG にする。ブラウザ専用 */
function svgToPng(svg: SVGSVGElement, options: SvgToPngOptions): Promise<Blob>;
```

### 規則

- 渡された `<svg>` は変えない。複製してから寸法を固定し、`<image>` の href を data URI に置き換えて描く。読めなかった画像は外して続ける
- 寸法は viewBox から長辺 `size` に合わせる。viewBox が無いか壊れていれば `size` × `size`
- `background` は hex だけ（[スキーマ仕様の色の値](../../schema.md) と同じ規則）。hex でなければエラー
- canvas が汚染されて PNG にできないときはエラーを投げる
- ブラウザ（`document` と canvas がある環境）専用。Node で呼ぶとエラーを投げる

### 背景の扱い

- 背景は `AvatarState` にも `serializeState` の出力にも入れない。アプリが状態と並べて保存する（例: `{ state, background }`）
- 画面の背景は、アプリが `<svg>` の外（入れ物の CSS など）で塗る。renderer-svg は背景を描かない
- 画像を背景にしたいアプリは、`svgToPng` で透明の PNG を作ってから自分で重ねる

### やらないこと

- Exporter の仕様は決めない。`docs/plugins/exporter.md` は「仕様検討中」のまま。サーバーで PNG を作る用途が来たら、そのときに Exporter として決める
- JPEG・WebP などほかの形式は今回足さない
- `svgToPng` を `@edv4h/alter-ego-react` から包まない。`useAvatarEngine` の `mountRef` が指す `<svg>` を渡せば足りる

## Consequences

### 良い影響

- PNG 書き出しが 1 行になり、canvas の汚染や寸法の計算をアプリが写さなくて済む
- 状態の形（selections と transforms）は変わらない。保存済みの状態も、ADR-0012 の読み替えもそのまま
- 背景の持ち方をアプリが決められる（色だけ、画像も、チームごとの色、など）

### 悪い影響・トレードオフ

- 背景が状態の外にあるので、状態だけを渡されたアプリは背景を知らない。背景も渡したいときはアプリ同士で形を決める
- renderer-svg がブラウザの canvas に依存する関数を持つ。Renderer 本体と同じくブラウザ前提なので、パッケージの前提は変わらない

### 影響範囲

- `@edv4h/alter-ego-plugin-renderer-svg`: `svgToPng`、テスト（jsdom では canvas が無いので、寸法の計算と複製の処理を分けて試す）
- `apps/react-web`: `features/export-png/export-png.ts` を `svgToPng` に置き換える（画像の背景はデモ側に残す）
- `docs/plugins/renderer.md`、`docs/schema.md`（背景は状態に入らないこと）
- changeset: `@edv4h/alter-ego-plugin-renderer-svg` を minor で上げる
