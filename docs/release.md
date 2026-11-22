# リリース手順

> npm への公開の流れ。決めごとは [ADR-0014](./domain/adr/0014-release-with-changesets.md) を参照。

公開するのは `private` でない 6 パッケージで、版はパッケージごとに上げます。

- `@edv4h/alter-ego-core`
- `@edv4h/alter-ego-schema`
- `@edv4h/alter-ego-perceive`
- `@edv4h/alter-ego-react`
- `@edv4h/alter-ego-plugin-loader-http`
- `@edv4h/alter-ego-plugin-renderer-svg`

## ふだんの流れ

1. 公開パッケージを変える PR に `pnpm changeset` で changeset を足す（書き方は [.changeset/README.md](../.changeset/README.md)）
2. PR を main にマージすると、Release ワークフローが「🔖 chore: release packages」という PR を作る（すでにあれば更新する）。版と CHANGELOG の変更だけが入っている
3. その PR をマージすると、Release ワークフローが npm に公開し、`<name>@<version>` の git tag と GitHub Release を作る

「版を上げる PR」は GitHub Actions の標準トークンで作るので、CI が走りません。そのため必須チェックの `CI OK` が付かず、auto-merge も効きません。中身は版と CHANGELOG だけなので、管理者が「Merge without waiting for requirements to be met」（必須チェックを待たずにマージ）でマージして構いません。

## 初回の公開（1 回だけ）

Trusted Publishing はパッケージが npm にあってからでないと設定できないので、最初の `0.1.0` だけは手元から出します。6 パッケージの `0.1.0` は 2026-11-20 に公開済みです。

### 前提

- [ ] リポジトリを public にする（npm のページからリンクするため。provenance も public でないと付かない）
- [ ] LICENSE の著作権者を確定する（公開した版は 72 時間を過ぎると取り消せない）
- [ ] npm で `edv4h` スコープを使えること（ユーザー名が `edv4h` か、`edv4h` という organization を持っていること）
- [ ] npm アカウントの 2 要素認証が有効なこと

### 手順

```sh
git switch main && git pull
pnpm install --frozen-lockfile
npm login                                  # ブラウザで認証する
pnpm release --dry-run --allow-new         # 何が出るかを確認する（ビルドも走る）
pnpm release --allow-new                   # 公開する。パッケージごとに 2 要素認証を求められることがある
git push origin --tags                     # 付いた git tag を push する
```

`pnpm release` は公開済みの版を飛ばすので、途中で失敗してもそのままやり直せます。

npm に無いパッケージを出すと、npm の staged publishing（持ち主の承認を待ってから公開する仕組み）に回ることがあります。そのときは先に `0.0.0-stage` という中身の無い仮の版が出て、承認すると本当の版が出ます。承認は公開中にブラウザで求められる 2 要素認証で済むことが多いです。保留のまま残ったら、npmjs.com のアカウント設定の「Staged Packages」か、`npm stage list` と `npm stage approve <stage-id>` で承認します。`0.0.0-stage` は版の一覧に残りますが、latest にはならないので消さなくて構いません。

### Trusted Publisher の設定

**CI から次の版を出す直前に** 設定します。設定してから 2 日以内に CI から 1 回公開しないと、設定が失効するためです（失効したら `npm trust revoke` で消して作り直す）。「版を上げる PR」をマージする前に、手元で次を流します。

```sh
export npm_config_registry=https://registry.npmjs.org/   # 社内のプロキシなどに向いているとき
for p in core schema perceive react plugin-loader-http plugin-renderer-svg; do
  npm trust github @edv4h/alter-ego-$p --file release.yml --repo EdV4H/alter-ego --allow-publish
done
npm trust list @edv4h/alter-ego-core                      # 設定を確かめる
```

npm 11.15 以上が要り、2 要素認証を求められます。`--allow-publish` を外すと `npm stage publish` しか許されず、Release ワークフローの `npm publish` が断られます。

npmjs.com で設定する場合は、パッケージのページの Settings → Trusted Publisher で GitHub Actions を選び、次のように入れます。

| 項目 | 値 |
| --- | --- |
| Organization or user | `EdV4H` |
| Repository | `alter-ego` |
| Workflow filename | `release.yml` |
| Environment name | 空のまま |

CI から公開できたら、同じ Settings の Publishing access を「Require two-factor authentication and disallow tokens」にしておくと、トークンでは公開できなくなります（Trusted Publishing はそのまま使えます）。

## 新しい公開パッケージを足すとき

1. `package.json` から `private: true` を外し、版を `0.1.0` にする
2. main にマージしたら、手元から `pnpm release --allow-new` で初回公開する。Trusted Publisher は、そのパッケージを CI から次に出す直前に設定する

CI はまだ npm に無いパッケージを飛ばします（警告だけ出します）。

## うまくいかないとき

- `npm login` が npmjs.com 以外（社内のプロキシなど）に向かう: npm の設定で registry を変えている。そのターミナルでだけ `export npm_config_registry=https://registry.npmjs.org/` してから `npm login --auth-type=web` と `pnpm release` を実行する
- `pnpm` が動かない（mise などの shim で別の版になる）: `npx pnpm@10.13.1 release ...` のように版を指定して実行する
- `pnpm release` がビルドのあと何も表示せずに止まる: tsdown のプロセスが終わらずに残っていることがある（`ps` で確かめられる）。止めてから、ビルドを順番に流し、公開スクリプトだけを別に実行する
  ```sh
  npx pnpm@10.13.1 -r --workspace-concurrency=1 --filter="./packages/*" --filter="./plugins/*" run build
  npx -p pnpm@10.13.1 node scripts/publish-packages.mjs --dry-run --allow-new   # 問題なければ --dry-run を外す
  ```
- `npm publish` が 404 や認証エラーになる: Trusted Publisher の設定（ワークフロー名が `release.yml` か）と、`package.json` の `repository.url` がリポジトリと一致しているかを確認する
- 版を上げる PR ができない: リポジトリの Settings → Actions → General で「Allow GitHub Actions to create and approve pull requests」を有効にする
