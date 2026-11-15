# react-web

alter-ego の動作確認用 React アプリ。画面はスキーマ（`src/schemas/*.schema.json`）から組み立て、ヘッダーでスキーマを切り替えられる（URL の `?schema=mascot` でも指定できる）。リポジトリにはマスコットの素材だけが入っていて、人のスキーマは素材を手元に置いたときだけ出る（[人のスキーマ](#人のスキーマ)）。
コードの置き場所と見た目の決まりは [DESIGN.md](./DESIGN.md)、機能の仕様は [docs/app/avatar-editor.md](../../docs/app/avatar-editor.md) を見る。

## 起動

リポジトリのルートで動かす。ライブラリはソースを直接読むので、先にビルドしなくてよい。

```sh
pnpm install
pnpm --filter @alter-ego/app-react-web dev
```

http://localhost:5480 を開く。マスコットのスキーマは http://localhost:5480/?schema=mascot（ヘッダーでも切り替えられる）。
ポートは Vite の既定とぶつからないよう、dev が 5480、preview が 5481、E2E が 5482（`vite.config.ts` と `playwright.config.ts`）。使われていると別の番号に逃げずに起動が失敗する。

本番ビルドを手元で見るときは:

```sh
pnpm --filter @alter-ego/app-react-web build
pnpm --filter @alter-ego/app-react-web preview   # http://localhost:5481
```

E2E の煙テスト（Playwright）は、初回だけブラウザを入れてから動かす。

```sh
pnpm --filter @alter-ego/app-react-web exec playwright install chromium
pnpm test:e2e
```

perceive（写真 → AvatarSeed）を試すには、`apps/react-web/.env.local` に
`OPENAI_API_KEY` または `GEMINI_API_KEY` を置く。dev server の middleware
（`vite.config.ts` の `perceiveProxyPlugin`）がキーをサーバ側で付与するため、
ブラウザにキーは渡らない。本番ビルド（`vite build`）には proxy が入らないので、写真から作る機能は dev server でだけ動く。

## 人のスキーマ

人のスキーマ（`src/schemas/human.schema.json`）の素材（SVG）は公開していないので、リポジトリに入っていない。持っている人は次のようにすると手元で使える。

1. 素材を `apps/react-web/public/assets/` の下に置く（`face/`、`hair_front/` など。スキーマの `assets[].src` と同じ並び）
2. `apps/react-web/.env.local` に `VITE_DEMO_HUMAN=true` を書く
3. dev server を起動し直す

`public/assets/` の下は `mascot/` 以外を `.gitignore` で無視しているので、置いた素材を誤ってコミットすることはない。
