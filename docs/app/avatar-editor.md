# アバターエディタ 機能仕様書（react-web）

- **目的**: リファレンス実装アプリ `apps/react-web` が提供する**ユーザー向けアバター機能**の全体像を定義する
- **対象読者**: アプリの仕様を把握したい開発者・レビュワー、同等機能を別フレームワークで再実装する人
- **前提知識**: [コンセプト](../concept.md)、[アーキテクチャ](../architecture.md)、[スキーマ仕様](../schema.md)、[ドメインモデル](../domain/model.md)

> このドキュメントは**アプリ層の機能仕様**に閉じる。エンジン・スキーマ・プラグインの内部仕様は上記の既存ドキュメントを参照し、ここでは重複させない。Photo to Avatar の推定ロジック（`@edv4h/alter-ego-perceive`）の設計詳細は `docs/superpowers/specs/` 配下の各設計メモを参照する。

## 1. 概要

`apps/react-web` は、`@edv4h/alter-ego-core` + SVG レンダラ + HTTP ローダを組み合わせて作った**アバターエディタのリファレンス実装**である。ユーザーはパーツを選び、色を変え、配置を微調整してアバターを組み立て、PNG として書き出せる。加えて、顔写真をアップロードして AI に初期構成を推定させる **Photo to Avatar** を備える。

コードの構成と、見た目（デザイントークン・部品）の決まりは [apps/react-web/DESIGN.md](../../apps/react-web/DESIGN.md) にまとめる。

### 位置づけと非目標

[コンセプト](../concept.md)が定めるとおり、SDK 本体は**アバターエディタ UI を同梱しない**（非目標）。本アプリはその非目標の外側に位置する「サンプル兼リファレンス実装」であり、SDK の使い方を示すデモである。したがって以下は本アプリの責務に含めない。

- アカウント連携・サーバへの構成の保存（このブラウザへの自動保存だけは行う。§11）
- 編集履歴（undo / redo）
- 画像レタッチ・フィルタ
- production 運用を前提とした AI proxy（§10 参照。現状は dev 専用）

## 2. 画面構成

3 ペイン構成。左のカテゴリ一覧と右のパネルは、**スキーマから組み立てる**（§3）。

```
┌───────────────────────────────────────────────────────────────────────┐
│ ヘッダー: Avatar? Avatar!  [スキーマ▼] [テーマ] [写真から作る] [PNG で保存] │
├──────────────┬──────────────────────────┬─────────────────────────────┤
│ 左: カテゴリ  │ 中央: プレビュー          │ 右: パネル                    │
│ （スキーマ由来 │ (SVG 描画)               │ ・色                          │
│  + 背景）     │ + Photo to Avatar overlay │ ・位置と大きさ                 │
│              │                          │ ・パーツ                       │
└──────────────┴──────────────────────────┴─────────────────────────────┘
```

- **左ペイン**: カテゴリ一覧。選択中のカテゴリを反転表示する。アイコンは選択中の Part（無ければ先頭の Part）を今の色で描く。
- **中央ペイン**: 今の構成を SVG で描く。Photo to Avatar の実行中はこの上に overlay が重なる。
- **右ペイン**: 選んだカテゴリで使えるパネルを上から並べる（§3.3）。
- **幅が狭いとき**: 1100px 以下ではカテゴリ一覧を上の横スクロールに、760px 以下では「プレビュー → カテゴリ → パネル」の縦積みにする。
- **テーマ**: 「OS に合わせる → ライト → ダーク」の順に切り替わる。選んだテーマはブラウザに覚えておく。
- **スキーマ**: ヘッダーで、デモ用のスキーマ（人 / マスコット）を切り替えられる（§3.4）。人の素材はリポジトリに入れていないので、手元に置いたときだけ人を出す

## 3. カテゴリとパネル（スキーマからの組み立て）

### 3.1 カテゴリ

カテゴリは、スキーマの **SlotGroup 1 つ**、または **どのグループにも入らない Slot 1 つ** に対応する（`src/editor/categories.ts` の `deriveCategories`）。アプリにカテゴリの一覧を手で書かない。

| 画面の要素 | スキーマのどこから来るか |
|---|---|
| カテゴリの並び | `slots` の配列順。グループは最初の Slot が現れた位置に 1 回だけ置く |
| カテゴリ名 | `groups[].name`、グループに入らない Slot は `slots[].name` |
| 基準 Slot | グループの先頭 Slot（[ADR-0007](../domain/adr/0007-slot-groups.md)）。パーツ一覧・色・アイコンの基準 |
| 「なしにする」 | カテゴリの全 Slot が `required` でないときだけ出す |
| 色のパネル | 基準 Slot に `palette` があるときだけ出す |
| 位置と大きさのパネル | `placement` を持つ Slot があるときだけ出す。`mirror: true` のグループは左右の移動の代わりに間隔と傾き（§6） |
| 左右ペアのサムネイル | カテゴリの全 Slot が `placement` を持てば、基準配置どおりに並べて描く |

人のスキーマ（[human.schema.json](../../apps/react-web/src/schemas/human.schema.json)）では、次のカテゴリになる。

| カテゴリ | 対応 Slot | 「なし」 | パーツ数 | 色 | 位置と大きさ |
|---|---|:---:|---:|:---:|---|
| 顔 | face | ✕ | 5 | 15 色 | ✕ |
| 髪 | hair_front / hair_back | ✕（hair_front が必須） | 40 / 26 | 14 色 | ✕ |
| 目 | eye_left / eye_right | ✕ | 33 / 33 | 14 色 | 上下・大きさ・間隔・傾き |
| 眉 | eyebrow_left / eyebrow_right | ✕ | 21 / 21 | 14 色 | 上下・大きさ・間隔・傾き |
| 鼻 | nose | ✕ | 19 | なし（肌の色に従う） | 上下左右・大きさ |
| 口 | mouth | ✕ | 25 | なし | 上下左右・大きさ |
| アクセサリ | accessory_front / accessory_back | ✅ | 9 / 3 | なし | ✕ |
| メガネ | glasses | ✅ | 4 | 20 色（α 付き） | ✕ |

カテゴリ一覧の末尾には、スキーマに由来しないアプリ独自の項目として **背景**（§7）と **開発**（§11）が付く。

- **描画順**は Slot の `zIndex` 昇順で、カテゴリの並びとは関係ない。

### 3.2 カテゴリの操作

パーツ選択・色・変形の操作は `src/editor/actions.ts` の関数にまとめてあり、ボタンはそれを呼ぶだけにする。Photo to Avatar や今後の別の UI、テストから同じ操作を使える。

### 3.3 パネル

右ペインに並ぶパネルは `src/panels/registry.ts` の配列で決まる。各パネルは「そのカテゴリで出すか」を自分で判断する。新しいパネルは 1 ファイル作って配列に足すだけでよく、画面の殻（`src/app/app.tsx`）は触らない。

| パネル | 出す条件 |
|---|---|
| 色 | 基準 Slot に `palette` がある |
| 位置と大きさ | `placement` を持つ Slot がある |
| パーツ | 基準 Slot に Part がある |
| スキーマ | いつも（開発者向け。カテゴリの元になった groups / slots の定義を、閉じた状態で出す） |

### 3.4 スキーマの切り替え

デモには形の違うスキーマを 2 つ置き、ヘッダーで切り替えられる。画面がスキーマだけから組み立てられていることを確かめるためで、人型でないスキーマでも UI を書き足さずに動くことを示す。

| 名前 | ファイル | 特徴 |
|---|---|---|
| 人 | [human.schema.json](../../apps/react-web/src/schemas/human.schema.json) | 素材（SVG）はリポジトリに無く、`VITE_DEMO_HUMAN=true` のときだけ出す（[README](../../apps/react-web/README.md#人のスキーマ)）。人型。髪（前後）・目・眉・アクセサリの SlotGroup、約 240 個の Part |
| マスコット | [mascot.schema.json](../../apps/react-web/src/schemas/mascot.schema.json) | 人型でない。耳と目の SlotGroup（`mirror`）、体の色を使う耳としっぽ（`colorBindings` の `from: ["body"]`）、`palette` が無く色を変えない口、体の後ろに描くしっぽ（`zIndex`） |

- 切り替えると、エディタを丸ごと作り直す（エンジン・カテゴリの選択・パネルの中の状態を持ち越さない）。イベントログも消す
- 構成の保存はスキーマごとに分かれているので（§11）、戻ってくると前の構成が出る
- どのスキーマで開くかは、URL の `?schema=<id>` → 前回選んだもの → `DEMO_SCHEMAS` の先頭（人を出すときは人、出さないときはマスコット）の順で決める。URL で開いたスキーマも覚えておく
- スキーマを足すときは、`src/schemas/` に JSON、`public/assets/` に SVG を置き、`src/app/config.ts` の `DEMO_SCHEMAS` に 1 行足す。スキーマとして正しいか、アセットのファイルがあるかは `src/app/config.test.ts` が確かめる

## 4. パーツ選択

「パーツ」パネルにサムネイルを並べる（幅に合わせて列数が変わる）。

- **選択中**のサムネイルは枠を太くし、押しても何もしない。
- **「なしにする」**: §3.1 の条件のときだけ見出しの右に出す。押すと required でない Slot の選択を外す。どれも選ばれていなければ押せない。
- **基準 Slot だけを選ぶ**: 同じグループの他の Slot は、engine が `pairKey` と `linkColor` に従ってそろえる（ADR-0007）。今の色は引き継ぐ。
- **サムネイルの色**: 「この Part を選んだら」の色で描く。グループで対になる Part（後ろ髪など）も、基準 Slot の今の色で重ねる。SVG を読み込むまでは元のアセットをそのまま表示する。

## 5. 色

色のパネルは基準 Slot の `palette` を並べる。色は `#RRGGBB`、メガネだけ α 付きの `#RRGGBBaa`（下に市松模様を敷いて見分けられるようにする）。押すと、カテゴリ内で選択のある Slot すべてに同じ色を付ける。

どの領域がどの Slot の色に従うかは、アセットの `colorBindings` に書いてあり、core が解く（[ADR-0008](../domain/adr/0008-color-bindings.md)）。アプリは連動を知らない。デモのスキーマでは次のとおり。

| Slot | プレースホルダ → 従う色 |
|---|---|
| face | 肌 `#50C7FF` → 自分の色 |
| hair_back / hair_front | 肌 `#50C7FF` → **face の色**、髪 `#FCD0D0` → 自分の色 |
| nose | 肌 `#50C7FF` → **face の色**（色のパネルは出ない） |
| eye_left / eye_right | 虹彩 `#009BFF` → 自分の色 |
| eyebrow_left / eyebrow_right | `#FFEB87` → 自分の色、**無ければ hair_front の色** |
| glasses | レンズ `#00FFFF` → 自分の色 |

- **初期の選択**: スキーマにまだ Slot の既定値を書けないので、起動直後に当てる選択をアプリ側に持つ（`src/app/config.ts` の `DemoSchema.initial`）。人のスキーマでは、顔のアセットが肌のプレースホルダ色で描かれているため face を白（`#ffffff`）にする。

## 6. 位置と大きさ（Slot の変形）

`placement` を持つ Slot は、基準配置からの差分（`dx` / `dy` / `scale` / `rotation`）で動かせる（[ADR-0009](../domain/adr/0009-slot-transform-in-state.md)）。拡縮の範囲（0.3〜3）と、`mirror` のグループで反対側に鏡像を当てるのは core が行う。

ボタン 1 回分の量は `src/app/config.ts` の `TRANSFORM_STEP`（移動 4px、拡縮 0.1、傾き 6°、間隔 4px）。見出しの右の「リセット」で変形を元に戻す（変形していなければ押せない）。

| 操作 | 通常の Slot（口・鼻） | `mirror` のグループ（目・眉） |
|---|---|---|
| 位置 | 上下左右 | 上下だけ（左右は対称に動くので「間隔」になる） |
| 大きさ | 大きく / 小さく | 大きく / 小さく（左右同時） |
| 間隔 | — | 寄せる / 離す |
| 傾き | — | 内向き / 外向き（上側を顔の中心へ倒すのが内向き） |

`mirror` のグループでは基準 Slot だけを動かす。「離す」「内向き」をどちらの符号にするかは、基準 Slot が他の Slot より右にあるか左にあるかで決める（`outwardSign`）。

## 7. 背景

背景の項目で、プレビューと PNG 出力の背景を決める。背景はアプリ全体で 1 つで、`src/features/background/background.ts` のストアに置く。

- **透明**（プレビューでは市松模様で見せる）/ **単色**（15 色）/ **画像**（400×400 推奨。枠いっぱいに引き伸ばす）。
- PNG 出力ではキャンバスに先に背景を描く（§9）。透明なら PNG も透過する。

## 8. Photo to Avatar

顔写真から AI が初期構成（パーツ・色・配置）を推定し、現在の編集を**完全上書き**する機能。

### フロー

```
［写真から作る］クリック
   ↓
上書き確認ダイアログ（プロバイダ選択）
   ↓ 「続行」
ファイル選択（image/jpeg,png,webp / 5MB 以下）
   ↓
overlay「写真を解析中…」（キャンセル可）
   ↓
perceive API（プロバイダに応じた proxy 経由）
   ↓
applySeedToEngine で構成へ反映
   ↓
overlay を閉じる（成功）/ エラー表示（失敗）
```

### 上書き確認ダイアログ

- タイトル「現在の編集を上書きします」、本文「写真から作ると、今のパーツ・色・配置はすべて置き換わります。続けますか?」
- **プロバイダ選択ラジオ**: 「ChatGPT (gpt-5.4-mini)」（既定）/「Gemini (2.5 Flash-Lite)」。同じ写真でプロバイダを変えて推定結果を比較できる。
- ブラウザ標準の `<dialog>`（モーダル）を使う。Esc と背景のクリックで閉じる。「続行」に初期フォーカス。

### overlay の状態

`idle` / `loading` / `error` の 3 状態。

- **loading**: スピナー（`prefers-reduced-motion` 対応）+「写真を解析中…」+ キャンセル（AbortController で中断）。
- **error**: エラーメッセージ（赤）+ 再試行（直前のファイルで再実行）+ 閉じる。
- a11y: `role="status"` + `aria-live="polite"`。

### エラー種別（PerceiveError.kind → 表示）

| kind | 表示メッセージ |
|---|---|
| network | ネットワークエラーが発生しました |
| auth | API キーが正しくありません |
| parse | 結果の解釈に失敗しました |
| validate | 写真からアバターを作れませんでした。 別の写真を試してください |
| cancelled | （overlay を idle に戻すのみ。メッセージ表示なし） |

### 完全上書きセマンティクス（applySeedToEngine）

推定結果 `AvatarSeed`（`selections` / `slotTransforms` / `salientFeatures`）を次のルールでエンジンへ適用する。既存のユーザー編集は破棄され、復元手段はない。

- **required slot**: seed に partId があれば設定。無ければスキーマ先頭パーツへ戻す（未選択にはしない）。
- **optional slot**: seed にあれば設定、無ければ未選択にする。
- **color**: seed に色があれば設定、無ければ解除。
- **slotTransforms**: 全 slot を初期値にリセットしてから seed の値をマージする。

> 推定側（perceive パッケージ）は、スキーマの説明・`x-perceive`・`groups` から組み立てたプロンプトと、core のグループ規則による正規化により、**装着物（メガネ等）が写っていれば必ず反映し**、左右・前後ペアの slot を**同番号・同色のセット**に揃える。詳細は [perceive 関連の設計メモ](../superpowers/specs/2026-06-11-perceive-accessories-pairs-design.md)を参照。

## 9. PNG 出力

ヘッダーの「PNG で保存」で現在のアバターを PNG として保存する（`src/features/export-png/`）。書き出しは renderer-svg の `svgToPng` を使う（[ADR-0016](../domain/adr/0016-svg-to-png.md)）。透明と単色の背景は `svgToPng` に渡し、画像の背景は透明の PNG を作ってから重ねる。

- **解像度**: SVG の viewBox から算出し、長辺 1024px に正規化（既定 400×400 → 1024×1024）。
- **形式**: PNG（RGBA）。
- **ファイル名**: `avatar-{ISO8601}.png`（例 `avatar-2026-06-16T12-34-56.png`）。
- **背景**: §7 の設定をキャンバスへ先に描画（透明 / 単色 / 画像）。
- **tainted canvas 対策**: SVG 内の `blob:` / `http:` 画像 href をすべて data URI にインライン化してから描画する。これを行わないとクロスオリジン汚染で `toBlob` が失敗する。
- **エラー処理**: `toBlob` が null（汚染検出）なら alert。背景画像ロード失敗時は警告ログを出し透明背景にフォールバック。
- 出力中は「書き出し中…」を表示し、ボタンを無効化する。

## 10. プロバイダ proxy 構成（dev 専用）

Photo to Avatar の API キーをクライアントに露出させないため、Vite dev server の middleware が proxy する。

```
ブラウザ ──POST /api/perceive──────────► OpenAI chat completions
        ──POST /api/perceive/gemini───► Gemini generateContent
                （middleware が server side でキーをヘッダー付与）
```

| 経路 | forward 先 | 認証ヘッダー | env |
|---|---|---|---|
| `/api/perceive` | `api.openai.com/v1/chat/completions` | `Authorization: Bearer` | `OPENAI_API_KEY` |
| `/api/perceive/gemini` | `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` | `x-goog-api-key` | `GEMINI_API_KEY` / `GEMINI_MODEL`（既定 `gemini-2.5-flash-lite`） |

- POST のみ処理。キー未設定は 500、upstream 通信失敗は 502 を返す。
- ⚠️ **この proxy は dev server middleware であり、`vite build` の成果物には含まれない**。production 運用には別途バックエンドで `/api/perceive` 系を実装する必要がある（現状は PoC / dev 専用）。

## 11. 開発者向けの機能と保存

ライブラリに機能を足したときに、デモ側で一時的な UI や console.log を書かずに確かめられるようにする。

### 構成の自動保存

- 構成（AvatarState）と背景を、このブラウザの localStorage に自動で保存する（変更から 300ms 待ってまとめて書く）。リロードしても続きから作業できる
- 保存場所はスキーマの `metadata.name` ごとに分ける。スキーマで改名された id は読み替え、スキーマから消えたパーツなどは捨てて、読めた分だけ戻す。直した場合は今の id で保存し直す（[ADR-0012](../domain/adr/0012-state-renames-and-lenient-read.md)）。保存が全体として読めないときだけ、その保存は捨てて初期状態で始める
- 背景画像が大きい（data URI で約 1MB 超）ときは背景を保存しない。保存に失敗しても作業は続けられる
- 状態の検査と読み込みは core の `engine.load`（[ADR-0015](../domain/adr/0015-engine-load-state.md)）。`deserializeState` で検査してから 1 回で差し替える

### 「開発」の項目

| 表示 | できること |
|---|---|
| 保存 | 「最初からやり直す」で、パーツ・色・配置・背景を起動直後の状態に戻す（確認ダイアログあり） |
| 状態（AvatarState） | 今の状態を JSON で表示しコピーできる。JSON を貼り付けて読み込める。スキーマに合わなければ理由を出し、構成は変えない |
| イベントログ | エンジンのイベント（`state:change` / `asset:load` / `asset:error` / `render:ready` / `render:error`）を新しい順に 100 件まで。`state:change` は変わった Slot を出す |

### E2E 煙テスト

主な操作が画面の上で通るかを、Playwright で確かめる（`apps/react-web/e2e/`）。細かい振る舞いは vitest で見るので、ここでは数を増やさない。

- マスコットのスキーマでパーツを変え、グループと色の連動を見る（人の素材は CI に無いので使わない） / リロードで構成とスキーマが残り「最初からやり直す」で戻る / PNG を保存できる
- `pnpm test:e2e` で動く。アプリを本番ビルドして `vite preview` で配る（ライブラリは事前にビルドしなくてよい）
- CI では `e2e (react-web)` ジョブとして、Node のテストとは別に 1 本だけ回す。失敗したときはレポートとトレースを成果物に残す

## 12. 制約・既知の限界

- **AI proxy は dev 専用**（§10）。
- **編集履歴なし**: Photo to Avatar の上書きを含め、undo / redo は提供しない。
- **保存はこのブラウザだけ**: 別のブラウザや端末とは共有しない（§11）。
- **写真サイズ上限 5MB**。対応形式は JPEG / PNG / WebP。
- **プロバイダ表記はハードコード**: ラジオのモデル名（gpt-5.4-mini / 2.5 Flash-Lite）は表示固定。env でモデルを変えると表示と実体がずれる（検証用 UI のため許容）。

## 13. 関連ドキュメント

| ドキュメント | 関係 |
|---|---|
| [concept.md](../concept.md) | SDK のゴール・非目標（本アプリはエディタ UI 非同梱方針の外側のサンプル） |
| [architecture.md](../architecture.md) | エンジン・プラグイン・データフロー |
| [schema.md](../schema.md) | スキーマ JSON の仕様 |
| [domain/model.md](../domain/model.md) | Avatar / Slot / Part / Asset / Selection の関係 |
| [superpowers/specs/2026-06-05-photo-to-avatar-design.md](../superpowers/specs/2026-06-05-photo-to-avatar-design.md) | Photo to Avatar 初期設計 |
| [superpowers/specs/2026-06-10-gemini-perceiver-design.md](../superpowers/specs/2026-06-10-gemini-perceiver-design.md) | Gemini プロバイダ追加 |
| [superpowers/specs/2026-06-11-perceive-accessories-pairs-design.md](../superpowers/specs/2026-06-11-perceive-accessories-pairs-design.md) | 装着物反映・ペア正規化 |
