# スキーマ仕様

- **目的**: `alter-ego` が受け付けるスキーマ JSON の構造と意味論を定義する
- **対象読者**: パーツを追加するデザイナー、スキーマを生成するツール作者、コア実装者
- **前提知識**: [アーキテクチャ](./architecture.md)、JSON Schema の基本

## スキーマの役割

スキーマは **アバター構成の単一の真実**（single source of truth）。以下を宣言する：

- どんなスロット（髪、目、服 …）が存在するか
- 各スロットにどんなパーツ候補があるか
- 各パーツがどんなアセット（画像・SVG・3D モデル …）を参照するか
- パーツ間の互換性・組み合わせ制約（将来拡張）

ユーザーの選択状態（`AvatarState`）はスキーマに対する「どのスロットでどのパーツを選んだか」のマップとして表現される。

## フォーマット

- **形式**: JSON（UTF-8、拡張子 `.json`）
- **バリデーション**: JSON Schema（`@edv4h/alter-ego-schema` が提供）
- **バージョン**: `schemaVersion` フィールド（`MAJOR.MINOR`）で管理。マイグレーション関数は `@edv4h/alter-ego-schema` が提供する（[バージョニング](#バージョニング)）

## トップレベル構造

```jsonc
{
  "schemaVersion": "1.0",
  "metadata": {
    "name": "example-avatar",
    "description": "サンプルアバタースキーマ",
    "author": "optional"
  },
  "canvas": { "width": 400, "height": 400 },   // 任意
  "slots": [ /* Slot[] */ ],
  "parts": [ /* Part[] */ ],
  "assets": [ /* Asset[] */ ],
  "groups": [ /* SlotGroup[]（任意） */ ]
}
```

| フィールド | 必須 | 説明 |
| --- | --- | --- |
| `schemaVersion` | ✅ | スキーマの互換性バージョン。`MAJOR.MINOR` 形式（例: `"1.0"`） |
| `metadata` | ✅ | スキーマ自体のメタ情報。`name` は必須、他は任意 |
| `canvas` | ❌ | 描画座標系（`{ width, height }`）。Slot の配置と変形はこの座標系の値で書く（[ADR-0009](./domain/adr/0009-slot-transform-in-state.md)） |
| `slots` | ✅ | アバターの配置スロット定義 |
| `parts` | ✅ | スロットに入るパーツ候補の定義 |
| `assets` | ✅ | パーツが参照する素材ファイルの定義 |
| `groups` | ❌ | 複数の Slot を 1 単位として扱う宣言（[SlotGroup](#slotgroup)） |

未知のトップレベルキーのうち、`x-` プレフィックスを持つものはプラグイン拡張として許容され、それ以外はバリデーションエラーにする。

## Slot

アバター上の「配置枠」を定義する。

```jsonc
{
  "id": "hair",
  "name": "髪",
  "zIndex": 20,
  "required": true,
  "category": "head"
}
```

| フィールド | 必須 | 説明 |
| --- | --- | --- |
| `id` | ✅ | スロットの一意な識別子（英数字・ハイフン・アンダースコア） |
| `renamedFrom` | ❌ | 以前の id の配列（新しいものから順）。保存した状態を読み込むとき、旧 id を今の id に読み替える（[id の改名](#id-の改名と保存した状態の読み込み)） |
| `name` | ✅ | 表示用の名前（任意の Unicode 文字列） |
| `description` | ❌ | 人間にも AI にも読める説明。perceive のプロンプトにも使う（[ADR-0011](./domain/adr/0011-perceive-prompt-from-schema.md)） |
| `zIndex` | ✅ | レイヤー順（小さい方が奥） |
| `required` | ❌ | `true` なら必ず 1 パーツ選択されている必要がある（デフォルト `false`） |
| `category` | ❌ | UI でのグルーピング用タグ（head / body / accessory 等） |
| `placement` | ❌ | 既定の配置 `{ x, y, width, height, rotation? }`（canvas 座標系、rotation は度）。省略時は canvas 全体（[配置と変形](#配置と変形)） |
| `palette` | ❌ | この Slot で選べる色の候補（hex の配列）。UI と perceive が参照する。`Selection.color` が候補外でもエラーにはしない（[ADR-0008](./domain/adr/0008-color-bindings.md)） |

## Part

スロットに配置できるパーツ候補。

```jsonc
{
  "id": "hair-01",
  "slotId": "hair",
  "name": "ショートヘア",
  "assetId": "asset-hair-01",
  "colorable": true,
  "variants": [
    { "id": "hair-01-red", "overrides": { "color": "#ff4444" } }
  ]
}
```

| フィールド | 必須 | 説明 |
| --- | --- | --- |
| `id` | ✅ | パーツの一意な識別子 |
| `renamedFrom` | ❌ | 以前の id の配列（[id の改名](#id-の改名と保存した状態の読み込み)） |
| `slotId` | ✅ | このパーツがどのスロットに入るか |
| `name` | ✅ | 表示名 |
| `description` | ❌ | 人間にも AI にも読める説明。perceive のプロンプトにも使う |
| `assetId` | ✅ | 参照するアセットの ID |
| `colorable` | ❌ | 色差し替えに対応するか（デフォルト `false`） |
| `variants` | ❌ | 同一パーツの色違い・形違い派生 |
| `pairKey` | ❌ | SlotGroup の中で対応する Part を引くキー。同じグループの別 Slot で同じ値を持つ Part が対応する（[SlotGroup](#slotgroup)） |

- `variants[]` は `{ id, renamedFrom?, overrides? }` を取る。`renamedFrom` は Slot・Part と同じく以前の id の配列
- `variants[].overrides` は `{ color?, "x-*"? }` を取り、選択時にこのパーツの既定値へ重ねられる（マージ順は [Selection](#selection状態) を参照）

## SlotGroup

左右の目や前髪と後ろ髪のように、複数の Slot を 1 単位として扱いたいときに書く（[ADR-0007](./domain/adr/0007-slot-groups.md)）。

```jsonc
{
  "id": "eye",
  "name": "目",
  "slots": ["eye_left", "eye_right"],   // 先頭が基準 Slot
  "mirror": true
}
```

| フィールド | 必須 | 説明 |
| --- | --- | --- |
| `id` | ✅ | グループの一意な識別子 |
| `name` | ✅ | 表示名 |
| `slots` | ✅ | グループに属する Slot の id（2 個以上）。先頭が基準 Slot |
| `linkParts` | ❌ | 基準 Slot の選択に合わせて、他の Slot から同じ `pairKey` の Part を選ぶか（既定 `true`） |
| `linkColor` | ❌ | 基準 Slot の `color` を他の Slot にもそろえるか（既定 `true`） |
| `mirror` | ❌ | 変形を鏡像で連動させるか（既定 `false`） |

- 基準 Slot を選ぶと、他の Slot は同じ `pairKey` の Part に切り替わる。対応する Part が無い Slot は、`required` でなければ選択を外す
- 基準 Slot の Part が `pairKey` を持たないときは、他の Slot の Part は変えない
- 基準でない Slot を直接選んだときは、その Slot だけが変わる
- 1 つの Slot は 1 つのグループにしか入れない。存在しない Slot を書いたとき、また `required` な Slot に対応する Part が無い `pairKey` があるときはバリデーションエラーになる

## Asset

実ファイルの **参照情報（メタデータ）**。Asset 自体は**実データを持たない**。実体（画像バイナリ・SVG DOM 等）は、Loader プラグインが Asset を受け取って非同期に取得した **`Resource`** として供給される。

```
AvatarSchema.assets[] ──(Loader が load)──► Resource ──► Renderer
     メタ情報のみ                           実データ      描画で使う
```

- Asset は「どう取るかの指示書」。`src` や `kind` を見て Loader が挙動を決める
- Resource は「取得済みの実体」。`assetId` で Asset と紐づく
- 詳しい対応関係は [ドメインモデル](./domain/model.md#asset-と-resource-の関係) を参照

**取得方法は Loader が決める**。`src` は `<scheme>:<path>` 形式（例: `https://...`、`mem:hair-01`、`builtin:text`）とし、コアは先頭スキームで担当 Loader を振り分ける。`:` を含まない相対パスは空スキーム `""` として扱う（[ADR-0005](./domain/adr/0005-loader-dispatch.md)）。

```jsonc
{
  "id": "asset-hair-01",
  "kind": "svg",
  "src": "parts/hair/hair-01.svg",
  "hints": {
    "width": 512,
    "height": 512,
    "origin": { "x": 256, "y": 0 }
  }
}
```

| フィールド | 必須 | 説明 |
| --- | --- | --- |
| `id` | ✅ | アセットの一意な識別子。Resource との紐付けキー。登録全体でグローバル一意（[ADR-0006](./domain/adr/0006-fragment-id-uniqueness.md)） |
| `kind` | ✅ | `svg` \| `image` \| `3d` \| `text` \| 独自（Renderer が解釈） |
| `src` | ✅ | `<scheme>:<path>` 形式の参照文字列。スキームで Loader が決まる（[ADR-0005](./domain/adr/0005-loader-dispatch.md)） |
| `hints` | ❌ | Renderer が使うヒント（サイズ・配置原点等） |
| `colorBindings` | ❌ | アセット内の着色領域と、色を取る Slot の宣言。下の「[色の連動](#色の連動colorbindings)」を参照 |

### 色の連動（colorBindings）

1 つのアセットに複数の着色領域があり、それぞれ別の Slot の色に従わせたいときは `colorBindings` を書く（[ADR-0008](./domain/adr/0008-color-bindings.md)）。

```jsonc
{
  "id": "asset-hair-front-01",
  "kind": "svg",
  "src": "hair_front/hair-front-01.svg",
  "colorBindings": [
    { "target": "#FCD0D0", "from": ["self"] },          // 髪の部分は自分の Slot の色
    { "target": "#50C7FF", "from": ["face"] }           // 肌の部分は face の色
  ]
}
```

- `target` はアセット内の領域を指す値。意味は Renderer が決める。renderer-svg は「この hex を置換する」と解釈する
- `from` は色を取る Slot の id を優先順に並べる。`"self"` はこの Part が入っている Slot。先頭から見て、最初に色を持つ Slot の色を使う（例: 眉は `["self", "hair_front"]` で、眉の色が無ければ髪の色）
- 色は ADR-0003 のマージ後の値（variant の色を含む）を使う。どの Slot にも色が無い領域は塗らず、素材の元の色のまま描く
- core が描画のたびに解決し、`RendererContext.colors` に Slot ごとの `{ target, color }[]` として渡す
- `from` に存在しない Slot id を書くとバリデーションエラーになる

### Parts プラグインの `assets` と Loader プラグインの関係

Parts プラグインが `ctx.parts.addFragment({ parts, assets })` で渡す **`assets` はスキーマ側のメタ情報**（この節で定義した `Asset` の配列）。一方、Loader プラグインは **その Asset を実データに変換する責務**を持つ別のレイヤー。

- **Parts プラグイン**: スキーマに Asset メタ情報を *足す* 側（「`asset-hair-01` は svg で `src` はここ」と宣言する）
- **Loader プラグイン**: Asset を *解決する* 側（`canHandle(asset)` → `load(asset)` で `Resource` を返す）

両者は独立に登録・差し替え可能で、同じスキーマに対して Loader だけを差し替える（例: HTTP 取得 → メモリ取得）ことができる。詳細は [プラグインガイド](./plugins/README.md) と [ドメインモデル](./domain/model.md#プラグインが触る範囲) を参照。

## Selection（状態）

スキーマ自体ではないが、ペアで扱うデータ。ユーザーの選択状態を表す。

```jsonc
{
  "selections": {
    "hair": { "partId": "hair-01", "color": "#ff4444" },
    "eyes": { "partId": "eyes-round" }
  }
}
```

`AvatarState` として `core` が保持し、`select()` で更新される。Slot ごとの変形（`transforms`）も同じ `AvatarState` に入る（[配置と変形](#配置と変形)）。シリアライズして保存・復元可能。

各 Selection は `{ partId, variantId?, color? }` の形を取る。`variantId` を指定すると Part の variant（プリセット）が適用され、`Part 既定 → variant.overrides → Selection の明示値` の順でトップレベル後勝ちにマージされる（`Selection.color` が最優先）。詳細は [ADR-0003](./domain/adr/0003-color-variant-merge.md) を参照。

各 Selection エントリにも `x-*` プレフィックスの拡張キーを持たせられる（例: テキストパーツの入力値）。コアは解釈せず素通しし、対応するプラグインが読み取る（後述の「[拡張フィールド（`x-*`）](#拡張フィールドx-)」と同じ扱い）。下の代表例 4（紋章・OGP）の Selection で `x-text` を使う。

Selection エントリのキーは `partId`（必須）/ `variantId` / `color` と `x-*` のみ、`Variant.overrides` のキーは `color` と `x-*` のみとする。どちらも未知の非 `x-` キーはバリデーションエラーにする（[トップレベル構造](#トップレベル構造)の方針と同じ）。入れ子の `x-*` オブジェクトはトップレベルキー単位の置換（浅いマージ）で、再帰マージはしない。

## 配置と変形

Slot の既定の配置は `Slot.placement` に、ユーザーが加えた変形は `AvatarState.transforms` に持つ（[ADR-0009](./domain/adr/0009-slot-transform-in-state.md)）。

```jsonc
{
  "selections": { "eye_left": { "partId": "eye-left-01" } },
  "transforms": {
    "eye_left": { "dx": 4, "dy": -2, "scale": 1.1, "rotation": -6 }
  }
}
```

- 変形は `dx` / `dy`（canvas 座標系での移動量）、`scale`（0.3〜3.0）、`rotation`（度、-180〜180）の 4 つ。範囲外の値は範囲に収める
- 変形は Slot に紐づき、Part を変えても残る
- core は配置に変形を合成する。中心を保って拡縮し、その後に移動と回転を足す。結果を `RendererContext.placements` として Renderer に渡す
- `placement` も `canvas` も無い Slot は `placements` に含めない。Renderer は既定の描き方（全面）で描く
- `mirror: true` の SlotGroup では、基準 Slot に加えた変形を他の Slot に鏡像（`dx` と `rotation` の符号を反転）で適用する
- 変形は `engine.setTransform(slot, { dx?, dy?, scale?, rotation? })` で変え、`engine.resetTransform(slot?)` で戻す。どちらも `state:change` を発行する
- `serializeState(state)` / `deserializeState(schema, json, options?)`（`@edv4h/alter-ego-core`）で、selections と transforms をまとめて JSON にできる。改名した id の読み替えと、読めない値の扱いは [id の改名と保存した状態の読み込み](#id-の改名と保存した状態の読み込み) を参照

## id の改名と保存した状態の読み込み

Slot・Part・variant の id を改名したら、旧 id を `renamedFrom` に書いておく。保存済みの状態を `deserializeState` で読み込むとき、旧 id が今の id に読み替えられる（[ADR-0012](./domain/adr/0012-state-renames-and-lenient-read.md)）。

```jsonc
// hair_front を hair に、hair-01 を hair-short に改名した
{ "id": "hair", "name": "髪", "zIndex": 0, "renamedFrom": ["hair_front"] }
{ "id": "hair-short", "slotId": "hair", "name": "ショート", "assetId": "a", "renamedFrom": ["hair-01"] }
```

- 2 回改名したら（`a` → `b` → `c`）、`c` の `renamedFrom` に `["b", "a"]` と両方書く
- `renamedFrom` の値が同じ種類の今の id と重なったり、同じ旧 id が 2 つの要素に出てきたりするとバリデーションエラーになる（Slot 同士・Part 同士は全体で、variant は同じ Part の中で見る）
- Part は、読み替えた先の Slot の中からだけ探す。別の Slot へ移した Part は読み替えない
- 今の id と旧 id の両方で同じ Slot に値があれば、今の id の値を使う
- `serializeState` は今の id だけを書く。読み替えた状態を保存し直せば旧 id は残らない
- `engine.select` などの操作は今の id だけを受け付ける

スキーマに無い値の扱いは `deserializeState(schema, json, { unknown, onIssue })` で選ぶ。

```ts
const state = deserializeState(schema, saved, {
  unknown: "drop", // 既定は "error"
  onIssue: (issue) => console.info(issue), // { kind: "renamed" | "dropped" | "filled", path, from?, to?, reason? }
});
```

- `"error"`（既定）: 読めない値が 1 つでもあれば例外を投げる
- `"drop"`: 読めない値を次の単位で捨てて続ける。未知の Slot はその Slot の selection と transform、未知の Part はその Slot の selection、未知の variant は `variantId` だけ、hex でない色は `color` だけ、未知のキーはそのキーだけ、数値でない変形はその Slot の transform
- `"drop"` で required の Slot が空になったら、その Slot の最初の Part で補う（初期状態と同じ規則）
- 最上位・`selections`・`transforms` がオブジェクトでないときは、どちらでも例外を投げる
- 読み替え（`renamed`）は `"error"` でも行い、`onIssue` で知らせる。`"drop"` を使うときは、何が消えたかを `onIssue` で利用者に見せるか記録することを勧める

## 色（color）の値フォーマット

`Part.variants[].overrides.color` と `Selection.color` が取る色値は **hex 形式のみ**とする。

- 許容: `#RGB` / `#RGBA` / `#RRGGBB` / `#RRGGBBAA`（3 / 4 / 6 / 8 桁、大文字小文字どちらも可）
- 正規表現: `^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$`
- CSS カラー名・`rgb()` / `hsl()` などは標準では受け付けない。必要な場合は `x-*` 拡張で各 Renderer が解釈する

hex に限定する理由は、`alter-ego-core` が headless であり、サーバーサイド画像生成などの非 DOM Renderer も色を解釈する必要があるため。hex なら追加のカラーパーサなしに全 Renderer が一意に扱える。

## 最小サンプル

```jsonc
{
  "schemaVersion": "1.0",
  "metadata": { "name": "minimal-avatar" },
  "slots": [
    { "id": "base", "name": "ベース", "zIndex": 0, "required": true },
    { "id": "hair", "name": "髪", "zIndex": 20 }
  ],
  "parts": [
    { "id": "base-01", "slotId": "base", "name": "素体", "assetId": "asset-base-01" },
    { "id": "hair-01", "slotId": "hair", "name": "ショートヘア", "assetId": "asset-hair-01", "colorable": true }
  ],
  "assets": [
    { "id": "asset-base-01", "kind": "svg", "src": "parts/base/base-01.svg" },
    { "id": "asset-hair-01", "kind": "svg", "src": "parts/hair/hair-01.svg" }
  ]
}
```

## 拡張フィールド（`x-*`）

プラグインが独自のメタ情報を持たせたい場合、キー名を `x-` で始めれば許容される。

```jsonc
{
  "id": "hair-01",
  "slotId": "hair",
  "name": "ショートヘア",
  "assetId": "asset-hair-01",
  "x-physics": { "sway": 0.3 }
}
```

未知の `x-*` キーはコアは素通しし、参照するプラグイン側で解釈する。

### `x-perceive`（perceive のヒント）

`@edv4h/alter-ego-perceive` は、Slot の `x-perceive` を写真からの推定のヒントとして読む（[ADR-0011](./domain/adr/0011-perceive-prompt-from-schema.md)）。プロンプト文そのものは書かず、ヒントに留める。

```jsonc
{
  "id": "face",
  "name": "顔",
  "description": "顔の輪郭。color は肌の色",
  "x-perceive": {
    "colorHint": "肌の色 (写真の顔の代表的な肌色を 1 色)",   // 書いた Slot は color を必ず推定させる
    "hint": "..."                                          // この Slot を推定するときの注意
  }
}
```

- `colorHint` のある Slot に `palette` があれば、候補として示し、写真の色に近いものを選ばせる
- ペアやレイヤーの指示は `groups` から組み立てる。Slot id はプロンプトに直書きしない

## 代表例（パターン集）

想定されるユースケースをカバーする 4 パターンを例示する。実装・ドキュメントの検証用サンプルとしても使う。

| # | パターン | 目的 |
| --- | --- | --- |
| [1](#1-最小構成素体--髪) | 最小構成（素体 + 髪） | チュートリアル・バリデーション動作確認 |
| [2](#2-人型アバター標準セット) | 人型アバター標準セット | 典型的な 2D アバター生成。色可変・variants 活用 |
| [3](#3-非人型ゆるキャラペット) | 非人型（ゆるキャラ／ペット） | 人型と異なる Slot 構成の例（耳／尻尾／模様） |
| [4](#4-非アバター紋章ogp) | 非アバター（紋章・OGP） | SDK の汎用性を示す、キャラ合成以外の活用例 |

---

### 1. 最小構成（素体 + 髪）

**ユースケース**

- 「まずスキーマをロードして描画する」だけのチュートリアル
- JSON Schema バリデータの動作確認
- ドキュメント中の引用例

**設計意図**

- Slot は必要最小限（`base`, `hair`）で、`required` をどう使うかを示す
- アセットは 1 つの Loader（例: memory / http）で解決できる相対パス
- `colorable: false` の最小形。variants も使わない

```jsonc
{
  "schemaVersion": "1.0",
  "metadata": { "name": "minimal-avatar" },
  "slots": [
    { "id": "base", "name": "ベース", "zIndex": 0, "required": true },
    { "id": "hair", "name": "髪",     "zIndex": 20 }
  ],
  "parts": [
    { "id": "base-01", "slotId": "base", "name": "素体",       "assetId": "asset-base-01" },
    { "id": "hair-01", "slotId": "hair", "name": "ショート",   "assetId": "asset-hair-01" }
  ],
  "assets": [
    { "id": "asset-base-01", "kind": "svg", "src": "parts/base/base-01.svg" },
    { "id": "asset-hair-01", "kind": "svg", "src": "parts/hair/hair-01.svg" }
  ]
}
```

**Selection 例**

```jsonc
{
  "selections": {
    "base": { "partId": "base-01" },
    "hair": { "partId": "hair-01" }
  }
}
```

**将来の拡張メモ**

- 色可変を入れるなら `colorable: true` と Selection 側の `color` を追加
- Slot を増やすときは `zIndex` の値域を早めに決めておく（10 刻み等）

---

### 2. 人型アバター標準セット

**ユースケース**

- プロフィール画像ジェネレータ
- チャット・コミュニティサービスのアバター機能

**設計意図**

- 一般的な 2D アバター用の Slot セット（背景 / 素体 / 顔 / 目 / 口 / 髪 / 服 / アクセサリ）
- `zIndex` は 10 刻み。`background < base < face < eyes < mouth < hair < outfit < accessory`
- 髪は `colorable: true` + variants で派生を持たせる
- `required` は「素体」「顔」「目」「口」。髪・服・アクセサリは任意
- `category` を UI のグルーピングに活用

```jsonc
{
  "schemaVersion": "1.0",
  "metadata": {
    "name": "humanoid-standard",
    "description": "人型アバター標準スキーマ"
  },
  "slots": [
    { "id": "background", "name": "背景",       "zIndex": 0,   "category": "scene"     },
    { "id": "base",       "name": "素体",       "zIndex": 10,  "category": "body",     "required": true },
    { "id": "face",       "name": "顔",         "zIndex": 20,  "category": "body",     "required": true },
    { "id": "eyes",       "name": "目",         "zIndex": 30,  "category": "face",     "required": true },
    { "id": "mouth",      "name": "口",         "zIndex": 40,  "category": "face",     "required": true },
    { "id": "hair",       "name": "髪",         "zIndex": 50,  "category": "head"      },
    { "id": "outfit",     "name": "服",         "zIndex": 60,  "category": "wear"      },
    { "id": "accessory",  "name": "アクセサリ", "zIndex": 70,  "category": "wear"      }
  ],
  "parts": [
    { "id": "background-plain", "slotId": "background", "name": "プレーン", "assetId": "asset-bg-plain", "colorable": true },
    { "id": "base-01",  "slotId": "base",  "name": "素体A",   "assetId": "asset-base-01" },
    { "id": "face-01",  "slotId": "face",  "name": "標準顔",  "assetId": "asset-face-01",  "colorable": true },
    { "id": "eyes-01",  "slotId": "eyes",  "name": "丸目",    "assetId": "asset-eyes-01",  "colorable": true },
    { "id": "eyes-02",  "slotId": "eyes",  "name": "ジト目",  "assetId": "asset-eyes-02",  "colorable": true },
    { "id": "mouth-01", "slotId": "mouth", "name": "微笑み",  "assetId": "asset-mouth-01" },
    {
      "id": "hair-short", "slotId": "hair", "name": "ショート", "assetId": "asset-hair-short", "colorable": true,
      "variants": [
        { "id": "hair-short-black", "overrides": { "color": "#222222" } },
        { "id": "hair-short-brown", "overrides": { "color": "#6a4a2b" } },
        { "id": "hair-short-red",   "overrides": { "color": "#c0392b" } }
      ]
    },
    { "id": "hair-long",   "slotId": "hair",      "name": "ロング",       "assetId": "asset-hair-long", "colorable": true },
    { "id": "outfit-t",    "slotId": "outfit",    "name": "Tシャツ",      "assetId": "asset-outfit-t",    "colorable": true },
    { "id": "outfit-suit", "slotId": "outfit",    "name": "スーツ",       "assetId": "asset-outfit-suit" },
    { "id": "glasses",     "slotId": "accessory", "name": "眼鏡",         "assetId": "asset-glasses" }
  ],
  "assets": [
    { "id": "asset-bg-plain",    "kind": "svg", "src": "bg/plain.svg" },
    { "id": "asset-base-01",     "kind": "svg", "src": "base/base-01.svg" },
    { "id": "asset-face-01",     "kind": "svg", "src": "face/face-01.svg" },
    { "id": "asset-eyes-01",     "kind": "svg", "src": "eyes/eyes-01.svg" },
    { "id": "asset-eyes-02",     "kind": "svg", "src": "eyes/eyes-02.svg" },
    { "id": "asset-mouth-01",    "kind": "svg", "src": "mouth/mouth-01.svg" },
    { "id": "asset-hair-short",  "kind": "svg", "src": "hair/short.svg" },
    { "id": "asset-hair-long",   "kind": "svg", "src": "hair/long.svg" },
    { "id": "asset-outfit-t",    "kind": "svg", "src": "outfit/tshirt.svg" },
    { "id": "asset-outfit-suit", "kind": "svg", "src": "outfit/suit.svg" },
    { "id": "asset-glasses",     "kind": "svg", "src": "accessory/glasses.svg" }
  ]
}
```

**Selection 例**

```jsonc
{
  "selections": {
    "background": { "partId": "background-plain", "color": "#f5f5f5" },
    "base":       { "partId": "base-01" },
    "face":       { "partId": "face-01",  "color": "#f7d8b8" },
    "eyes":       { "partId": "eyes-01",  "color": "#3b3b3b" },
    "mouth":      { "partId": "mouth-01" },
    "hair":       { "partId": "hair-short", "variantId": "hair-short-red" },
    "outfit":     { "partId": "outfit-t", "color": "#3498db" },
    "accessory":  { "partId": "glasses" }
  }
}
```

**将来の拡張メモ**

- 「眼鏡を付けた時、特定の髪型と競合する」等の相互制約は未サポート。将来は `x-constraints` などで宣言する案
- 左右対称アセット（左右の目）を 1 Part で扱う仕組みは未定

---

### 3. 非人型（ゆるキャラ／ペット）

**ユースケース**

- マスコットキャラクタージェネレータ
- ペット系アプリの自分だけのペット作成

**設計意図**

- 人型とは異なる Slot 構成（`body`, `ears`, `tail`, `pattern`）
- `pattern` スロットは「素体に乗る模様」を表現するための追加レイヤー
- `kind: "image"` と `kind: "svg"` を混在させ、Renderer/Loader の多様性を示す
- `zIndex` は体 → 模様 → 耳 → 尻尾 → アクセサリ の順

```jsonc
{
  "schemaVersion": "1.0",
  "metadata": { "name": "mascot-creature" },
  "slots": [
    { "id": "body",      "name": "体",         "zIndex": 10, "required": true },
    { "id": "pattern",   "name": "模様",       "zIndex": 20 },
    { "id": "ears",      "name": "耳",         "zIndex": 30 },
    { "id": "tail",      "name": "尻尾",       "zIndex": 5  },
    { "id": "accessory", "name": "アクセサリ", "zIndex": 40 }
  ],
  "parts": [
    { "id": "body-round",  "slotId": "body",      "name": "まるい体",   "assetId": "asset-body-round",  "colorable": true },
    { "id": "body-long",   "slotId": "body",      "name": "ほそ長い体", "assetId": "asset-body-long",   "colorable": true },
    { "id": "pattern-dot", "slotId": "pattern",   "name": "水玉",       "assetId": "asset-pattern-dot", "colorable": true },
    { "id": "pattern-stripe","slotId": "pattern", "name": "しま",       "assetId": "asset-pattern-stripe","colorable": true },
    { "id": "ears-cat",    "slotId": "ears",      "name": "ネコ耳",     "assetId": "asset-ears-cat",    "colorable": true },
    { "id": "ears-dog",    "slotId": "ears",      "name": "イヌ耳",     "assetId": "asset-ears-dog",    "colorable": true },
    { "id": "tail-curl",   "slotId": "tail",      "name": "くるり尾",   "assetId": "asset-tail-curl",   "colorable": true },
    { "id": "bowtie",      "slotId": "accessory", "name": "蝶ネクタイ", "assetId": "asset-bowtie",      "colorable": true }
  ],
  "assets": [
    { "id": "asset-body-round",     "kind": "image", "src": "creature/body-round.png" },
    { "id": "asset-body-long",      "kind": "image", "src": "creature/body-long.png" },
    { "id": "asset-pattern-dot",    "kind": "svg",   "src": "creature/pattern-dot.svg" },
    { "id": "asset-pattern-stripe", "kind": "svg",   "src": "creature/pattern-stripe.svg" },
    { "id": "asset-ears-cat",       "kind": "svg",   "src": "creature/ears-cat.svg" },
    { "id": "asset-ears-dog",       "kind": "svg",   "src": "creature/ears-dog.svg" },
    { "id": "asset-tail-curl",      "kind": "svg",   "src": "creature/tail-curl.svg" },
    { "id": "asset-bowtie",         "kind": "svg",   "src": "creature/bowtie.svg" }
  ]
}
```

**Selection 例**

```jsonc
{
  "selections": {
    "body":    { "partId": "body-round", "color": "#f6c177" },
    "pattern": { "partId": "pattern-dot", "color": "#b58040" },
    "ears":    { "partId": "ears-cat", "color": "#f6c177" },
    "tail":    { "partId": "tail-curl", "color": "#f6c177" },
    "accessory": { "partId": "bowtie", "color": "#c0392b" }
  }
}
```

**将来の拡張メモ**

- 「体色と耳色を連動させたい」等のパーツ間の色共有は、耳のアセットに `colorBindings: [{ "target": "...", "from": ["body"] }]` を書けばよい（[色の連動](#色の連動colorbindings)）
- 表情差分（喜び／悲しみ）を Slot で持つか、Selection の `variant` で持つかは未定

---

### 4. 非アバター（紋章・OGP）

**ユースケース**

- 紋章・エンブレムジェネレータ（ゲームのギルド紋章など）
- OGP / サムネイル画像のテンプレート生成

**設計意図**

- Slot 構成は「人」とは無関係でよい。`shield`, `symbol`, `banner`, `text` など
- 特に **`text` のような非画像アセット** は `x-*` 拡張で文字列・フォント情報を運ぶ想定
- Renderer は画像パーツ + テキストパーツを合成する実装になる（標準 Renderer ではなく、用途特化の Renderer プラグインを想定）
- `colorable: true` を全スロットで活用

```jsonc
{
  "schemaVersion": "1.0",
  "metadata": { "name": "emblem-generator" },
  "slots": [
    { "id": "shield", "name": "盾",       "zIndex": 0,  "required": true },
    { "id": "symbol", "name": "シンボル", "zIndex": 10 },
    { "id": "banner", "name": "帯",       "zIndex": 20 },
    { "id": "text",   "name": "文字",     "zIndex": 30 }
  ],
  "parts": [
    { "id": "shield-round", "slotId": "shield", "name": "円形盾", "assetId": "asset-shield-round", "colorable": true },
    { "id": "shield-heater","slotId": "shield", "name": "ヒーター型", "assetId": "asset-shield-heater","colorable": true },
    { "id": "symbol-sword", "slotId": "symbol", "name": "剣",     "assetId": "asset-symbol-sword", "colorable": true },
    { "id": "symbol-lion",  "slotId": "symbol", "name": "獅子",   "assetId": "asset-symbol-lion",  "colorable": true },
    { "id": "banner-wavy",  "slotId": "banner", "name": "波帯",   "assetId": "asset-banner-wavy",  "colorable": true },
    {
      "id": "text-slot-A", "slotId": "text", "name": "タイトル", "assetId": "asset-text-slot",
      "x-text": { "defaultValue": "LEGIO I", "font": "serif", "size": 42, "align": "center" }
    }
  ],
  "assets": [
    { "id": "asset-shield-round",  "kind": "svg", "src": "emblem/shield-round.svg" },
    { "id": "asset-shield-heater", "kind": "svg", "src": "emblem/shield-heater.svg" },
    { "id": "asset-symbol-sword",  "kind": "svg", "src": "emblem/symbol-sword.svg" },
    { "id": "asset-symbol-lion",   "kind": "svg", "src": "emblem/symbol-lion.svg" },
    { "id": "asset-banner-wavy",   "kind": "svg", "src": "emblem/banner-wavy.svg" },
    { "id": "asset-text-slot",     "kind": "text", "src": "builtin:text" }
  ]
}
```

**Selection 例**

```jsonc
{
  "selections": {
    "shield": { "partId": "shield-heater", "color": "#1e3d8f" },
    "symbol": { "partId": "symbol-lion",   "color": "#ffd24a" },
    "banner": { "partId": "banner-wavy",   "color": "#eeeeee" },
    "text":   { "partId": "text-slot-A",   "color": "#1e1e1e", "x-text": { "value": "ASTRUM" } }
  }
}
```

**将来の拡張メモ**

- `kind: "text"` は標準では未定義。Exporter や専用 Renderer プラグインが解釈する前提
- OGP 用途だと出力解像度（1200×630 等）を Selection ではなく Exporter options で指定するのが自然
- 「タイトル長による自動縮小」「複数行対応」は未定

---

## バリデーションエラー時の挙動

- エンジン生成時に JSON Schema で検証
- エラーがあれば `SchemaValidationError` 例外を投げる（message はパス付きで詳細）
- `core` はエラーを握りつぶさない（Silent fallback は原則禁止）

## バージョニング

方針は [ADR-0010](./domain/adr/0010-canonical-json-schema.md) で定める。

- 唯一の定義元は `packages/schema/schema/avatar.schema.json`（JSON Schema draft 2020-12）。TS 型はここから生成する
  - `$id`: `https://unpkg.com/@edv4h/alter-ego-schema@1/schema/avatar.schema.json`
  - JS からは `import schema from "@edv4h/alter-ego-schema/schema.json"` で参照できる
- `schemaVersion` は `MAJOR.MINOR` 形式（例: `"1.0"`）
  - MINOR: 任意フィールドの追加など、旧スキーマがそのまま通る変更
  - MAJOR: 旧スキーマが通らなくなる変更。マイグレーション関数を必ず添える
- `@edv4h/alter-ego-schema` の `migrate()` が旧 MAJOR を現行へ変換する。`createAvatarEngine` は `migrate` → `validate` の順に呼ぶ
- 現行より新しい `schemaVersion` はエラーにする
- 検証は `createAvatarEngine({ validate })` で差し替えられる

### schemaVersion と npm パッケージの対応

| schemaVersion | `@edv4h/alter-ego-schema` |
| --- | --- |
| 1.0 | 未公開 |
| 1.1 | 0.1.0 から。`renamedFrom` を追加（[ADR-0012](./domain/adr/0012-state-renames-and-lenient-read.md)） |

## 未確定事項

- パーツ間の制約表現（「眼鏡を選ぶと素顔と競合」等）の DSL
- 国際化対応（`name` のロケール別定義）

これらは実利用のフィードバックを受けて詰める。
