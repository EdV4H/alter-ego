# 用語集

- **目的**: `alter-ego` のドキュメントで使う用語を一箇所に集めてブレを防ぐ
- **対象読者**: ドキュメント執筆者、実装者、プラグイン作者
- **前提知識**: なし
- **索引**: [DOMAIN.md](../../DOMAIN.md) からリンクされているドメイン知識の一部です

## 用語一覧

| 用語 | 定義 |
| --- | --- |
| **Avatar** | `alter-ego` が扱う合成結果としてのキャラクター。スキーマ＋選択状態＋アセットから構成される |
| **AvatarEngine** | `@edv4h/alter-ego-core` が提供する中心クラス。スキーマを解釈し、プラグインを束ねる |
| **AvatarSchema** | アバター構成を宣言する JSON ドキュメント。スロット・パーツ・アセットを含む |
| **AvatarState** | ユーザーの選択状態を表す純粋データ。どのスロットでどのパーツを選んだか（`selections`）と、スロットごとの変形（`transforms`）を保持する |
| **Slot** | アバター上の「配置枠」。髪、目、服などの配置カテゴリを表す |
| **Part** | スロットに入るパーツ候補。1 つのスロットに複数の Part が定義される |
| **Asset** | **スキーマ側のメタ情報**。Part が参照する素材ファイルの `id` / `kind` / `src` / `hints` を持つ。実データは持たず、取得は Loader に委ねる |
| **Resource** | **ランタイム側の実データ**。Loader が Asset を取得した結果で、`assetId` で Asset と紐づく。Renderer が描画に使う（`SVGElement` や `ArrayBuffer` 等） |
| **Selection** | Slot に対する Part 選択。色差し替えなどの調整も含む |
| **Renderer** | `AvatarState` と `Resource` を使い、描画先に反映するオブジェクト。プラグインが `ctx.renderer.add()` で登録する |
| **Loader** | **「Asset → Resource」の変換器**。プラグインが `ctx.loader.add()` で登録する。HTTP / メモリ / IndexedDB 等を担当 |
| **Parts フラグメント** | 追加するパーツ群のスキーマ断片（`parts` / `assets` / 必要に応じて `slots`）。プラグインが `ctx.parts.addFragment()` で登録する。ここでの `assets` は **スキーマ側の Asset メタ情報**であり、Loader レイヤーとは独立 |
| **Exporter** | スキーマと状態を別形式に変換して返すオブジェクト。プラグインが `ctx.exporter.add()` で登録する |
| **Headless** | 描画・DOM・I/O を持たない状態。`alter-ego-core` は headless で設計されている |
| **Registry** | プラグインの登録先となる内部コンポーネント。`renderer` / `loader` / `parts` / `exporter` の 4 種類を `PluginContext` 経由で公開する |
| **Plugin** | コアの拡張点に差し込む実装単位。**単一のインターフェース**で表現され、種別フィールドは持たない。`setup(ctx)` で必要な Registry に自己登録する |
| **PluginContext** | コアがプラグインに渡すコンテキストオブジェクト。各 Registry・イベント・スキーマを公開する |
| **schemaVersion** | `AvatarSchema` の互換性バージョン。マイグレーション関数で旧版から変換する |
| **x-*** | スキーマ上の拡張フィールド。プラグイン固有メタ情報を持たせる命名規約 |
| **Perceive 層** | 写真などの入力から `AvatarSeed` を推定する層。`@edv4h/alter-ego-perceive` が提供する。描画ライフサイクルに関与しないため Plugin ではなく独立パッケージとして置く |
| **Perceiver** | Perceive 層の実装単位。`perceive(file, options?)` で `AvatarSeed` を返す interface。OpenAI / Gemini の既定実装がある |
| **AvatarSeed** | Perceiver の出力。スロットごとの Selection（`selections`）と配置差分（`slotTransforms`）の初期値を持つ。全フィールド optional |
| **SlotTransform** | スロット単位の位置・拡縮・回転の差分（`dx` / `dy` / `scale` / `rotation`）。`AvatarState.transforms` に入る（[ADR-0009](./adr/0009-slot-transform-in-state.md)） |
| **canvas** | スキーマの描画座標系（`width` / `height`）。配置と変形の値はこの座標系で書く（[ADR-0009](./adr/0009-slot-transform-in-state.md)） |
| **placement** | Slot の既定の配置（`x` / `y` / `width` / `height` / `rotation`）。core が `SlotTransform` と合成し、`RendererContext.placements` として Renderer に渡す |
| **SlotPlacement** | renderer-svg の古いオプション `slotPlacements` の要素。非推奨で、placement と SlotTransform に置き換えた。次のメジャーで削除する |
| **SlotGroup** | 複数の Slot を 1 単位として扱う宣言（左右ペア・前後レイヤー）。先頭が基準 Slot（[ADR-0007](./adr/0007-slot-groups.md)） |
| **pairKey** | SlotGroup 内で対応する Part を引くキー。Part id の命名規約の代わりに使う（[ADR-0007](./adr/0007-slot-groups.md)） |
| **ColorBinding** | Asset 内の着色領域（`target`）と、色を取る Slot の優先順（`from`）の宣言（[ADR-0008](./adr/0008-color-bindings.md)） |
| **ColorReplaceMap** | renderer-svg の古いオプション。スロットごとに「SVG 内の元色 → どのスロットの `color` で置換するか」を宣言する。非推奨で、ColorBinding に置き換えた。次のメジャーで削除する |
| **palette** | Slot で選べる色の候補（hex の配列）。UI と perceive が参照する（[ADR-0008](./adr/0008-color-bindings.md)） |
| **x-perceive** | Slot に書く perceive 向けのヒント（`colorHint` / `hint`）。perceive がプロンプトを組み立てるときに読む（[ADR-0011](./adr/0011-perceive-prompt-from-schema.md)） |
| **changeset** | 公開パッケージの版の上げ幅と変更の要約を書いた `.changeset/*.md` のファイル。溜まった changeset から版と CHANGELOG を作る（[ADR-0014](./adr/0014-release-with-changesets.md)） |
| **Trusted Publishing** | GitHub Actions の OIDC で、トークンを置かずに npm に公開する仕組み。パッケージごとに npm 上で設定する（[ADR-0014](./adr/0014-release-with-changesets.md)） |
| **renamedFrom** | Slot・Part・variant の以前の id の配列。保存した `AvatarState` を読み込むとき、旧 id を今の id に読み替えるのに使う（[ADR-0012](./adr/0012-state-renames-and-lenient-read.md)） |
| **randomState** | スキーマに沿ったランダムな `AvatarState` を返す core の関数。乱数（`random`）と Part の選び方（`choosePart`）を差し替えられる（[ADR-0017](./adr/0017-random-state.md)） |
| **背景** | アバターの後ろに塗る色や画像。`AvatarState` には入れず、アプリが状態と並べて持つ。PNG にするときは `svgToPng` の `background` に渡す（[ADR-0016](./adr/0016-svg-to-png.md)） |

## 書き表しの原則

- 英語由来の用語は原則としてそのまま英字表記（Renderer、Loader、Part 等）
- クラス・インターフェース名は `PascalCase`（`AvatarEngine`、`AvatarSchema`）
- 同じ概念を別語で表現しない（例: 「描画器」と「Renderer」を混在させない）
- 新語を導入した場合はこのファイルに追記する
