# react-web の設計ガイド

デモアプリ（`apps/react-web`）のコードの置き場所と、見た目の決まり。機能の仕様は [docs/app/avatar-editor.md](../../docs/app/avatar-editor.md) を見る。

このアプリの第一の目標は「ライブラリに機能を足すとき、デモの UI が足かせにならないこと」。そのために次の 3 つを守る。

1. **スキーマに書けることは UI に書かない。** カテゴリ・色の候補・配置はスキーマから組み立てる
2. **操作は UI に埋めない。** エンジンを受け取る関数として `editor/actions.ts` に置き、ボタンはそれを呼ぶだけにする
3. **パネルは登録して並べる。** 右ペインに何かを足すときは `panels/` にファイルを 1 つ作り、`registry.ts` に足す

## ディレクトリ

```
src/
  main.tsx        エントリ。tokens.css と base.css を読み込む
  app/            画面の殻（レイアウト、ヘッダー、カテゴリ一覧）と、アプリ独自の設定 config.ts
  editor/         React を使わない関数。スキーマからカテゴリを作る categories.ts、操作の actions.ts
  panels/         右ペインのパネル。1 ファイル 1 パネルで、registry.ts に並べる
  components/     alter-ego を知っている共通部品（Part のサムネイルなど）
  features/       画面をまたぐ機能（photo-to-avatar, export-png, background, persistence, devtools, schema-switch）
  ui/             alter-ego を知らない部品（Button, Swatch, Dialog, Section）とトークン
  schemas/        デモ用のスキーマ（human, mascot）。アセットは public/assets/ に置く（human の素材はリポジトリに入れない）
e2e/              Playwright の煙テスト（pnpm test:e2e）
```

依存の向きは `app → panels / features → components → editor → core`。エンジンと React のつなぎ（`useAvatarEngine` / `useAvatarState`）は `@edv4h/alter-ego-react` から使う。`ui/` と `app/config.ts` はどこからでも使ってよい。`editor/` は React を使わず、`ui/` は alter-ego を知らない（どちらもアプリの他のディレクトリに依存しない）。

## よくある変更

| やりたいこと | 触る場所 |
|---|---|
| Slot やグループを足す | `schemas/*.json` だけ（カテゴリ・色・変形は自動で出る） |
| 右ペインにパネルを足す | `panels/<name>-panel.tsx` を作り `panels/registry.ts` に追加 |
| 背景のような、スキーマ外の項目を足す | `AppSection` を作り `panels/registry.ts` の `APP_SECTIONS` に追加 |
| 変形の刻み幅・起動直後の選択を変える | `app/config.ts` |
| デモ用のスキーマを足す | `schemas/` に JSON、`public/assets/` に SVG を置き、`app/config.ts` の `DEMO_SCHEMAS` に足す（`app/config.test.ts` がファイルの有無まで確かめる） |
| 状態を JSON で読み書きする | `editor/state.ts` の `applyStateToEngine` / `formatState` |
| エンジンのイベントを見る | 画面の「開発」→ イベントログ（`features/devtools/event-log.ts`） |
| 新しい操作を足す | `editor/actions.ts` に関数を足し、`editor/actions.test.ts` でテスト |
| 画面の主な流れを確かめる | `e2e/smoke.spec.ts`。要素はロールと名前（`getByRole`）で探し、クラス名に頼らない |

`app/config.ts` には「スキーマに書けないこと」だけを置く。スキーマに書けるようになったら（例: Slot の既定の選択や色）、スキーマへ移す。

## ファイル名

すべて kebab-case（`photo-to-avatar-button.tsx`）。

## スタイル

- CSS Modules（`*.module.css`）で書く。インラインスタイルは、背景色のように値が実行時に決まるものだけにする
- 色・余白・角丸・影は `ui/tokens.css` の CSS 変数を使い、値を直接書かない
- ライト / ダークは `<html data-theme>` で切り替わる。指定が無ければ OS の設定に従う
- 例外: アバターのアセットは黒い線で描かれているので、サムネイルとアイコンの地はテーマに関係なく白（`#ffffff`）にする

## トークン

| 種類 | 変数 | 使いどころ |
|---|---|---|
| 地の色 | `--bg-page` / `--bg-surface` / `--bg-muted` / `--bg-hover` / `--bg-inverse` | ページ / カード / 控えめな面 / hover / 反転（選択中のカテゴリ、主ボタン） |
| 文字の色 | `--text-primary` / `--text-secondary` / `--text-muted` / `--text-inverse` | 本文 / ラベル / 補足 / 反転面の上 |
| 線 | `--border-subtle` / `--border-strong` | 通常の枠 / 選択中の枠 |
| 状態 | `--focus-ring` / `--danger-*` | フォーカス / エラー |
| 余白 | `--space-1`〜`--space-8` | 4px 刻み（4, 8, 12, 16, 20, 24, 32） |
| 角丸 | `--radius-sm` / `-md` / `-lg` / `-pill` | 6 / 10 / 16 / 999px |
| 文字 | `--text-xs`〜`--text-xl` | 11 / 12 / 14 / 16 / 22px |
| 大きさ | `--control-size` / `--swatch-size` / `--thumb-min` | ボタン 40px / 色 32px / サムネイルの最小幅 84px |

## 部品（`ui/`）

| 部品 | 使いどころ |
|---|---|
| `Button` | 文字のボタン。`variant`: `primary`（1 画面に 1 つ）/ `secondary` / `ghost`（見出し横の小さな操作）。`size="sm"` |
| `IconButton` | 記号のボタン。`label` は必須で、読み上げとツールチップになる |
| `Swatch` / `SwatchGrid` | 色を 1 つ選ぶ。`color={null}` で透明 |
| `Section` | 右ペインのパネルの枠。`aside` に見出し横の操作を置く |
| `Dialog` | モーダル。ブラウザ標準の `<dialog>` を使う |
| `Spinner` | 処理中の表示 |

新しい部品が要るときは、まず既存の部品の組み合わせで済まないかを考え、2 か所以上で使うものだけ `ui/` に足す。
