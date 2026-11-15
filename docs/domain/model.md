# ドメインモデル

- **目的**: alter-ego が扱う中心概念の関係と責務を一枚で俯瞰する
- **対象読者**: コア実装者、プラグイン作者、AI エージェント
- **前提知識**: [用語集](./glossary.md)、[スキーマ仕様](../schema.md)

## 中心概念の関係図

```
            ┌────────────────┐
            │  AvatarSchema  │  JSON ファイル。プロジェクトの真実
            └───┬─────┬───┬──┘
                │     │   │
     slots[]    │     │   │ parts[]
                ▼     │   ▼
        ┌──────────┐  │ ┌─────────┐   assetId   ┌─────────┐
        │   Slot   │◄─┘ │  Part   │────────────►│  Asset  │
        │ (配置枠) │    │(候補) │              │(素材参照) │
        └─────▲────┘    └─────▲───┘              └────┬────┘
              │               │                       │ Loader で取得
              │ slotId        │ partId                ▼
              │               │                  ┌─────────┐
              │               │                  │Resource │
              │               │                  │(実体)   │
              │               │                  └─────────┘
              │               │                       ▲
              │    ┌──────────┴──────────┐            │ Renderer で使う
              │    │    Selection         │            │
              └────┤ (slotId → partId +   │────────────┘
                   │  色等の調整)         │
                   └──────────────────────┘
                              ▲
                              │ 集合として保持
                   ┌──────────┴───────────┐
                   │    AvatarState       │
                   │ (ユーザーの選択状態) │
                   └──────────────────────┘
```

## 概念の責務

### AvatarSchema

- **何か**: アバター構成を宣言する JSON ドキュメント
- **責務**: どんな Slot があり、各 Slot にどんな Part 候補があり、各 Part がどの Asset を指すかを定義する
- **不変性**: 実行中は原則不変。変更するときは再生成か `addFragment` による追記で行う
- **真実性**: プロジェクトの単一の真実（single source of truth）。コード中のハードコードではなく、これが仕様

### Slot

- **何か**: アバター上の配置枠（髪・目・服 …）
- **責務**: z-index、必須・任意、カテゴリを持ち、描画時のレイヤー順を決める
- **定義元**: `AvatarSchema.slots[]` または Parts プラグインの `addFragment({ slots })`

### Part

- **何か**: 特定 Slot に入るパーツ候補
- **責務**: 表示名、参照する Asset、色変更の可否、バリアントを持つ
- **定義元**: `AvatarSchema.parts[]` または Parts プラグインの `addFragment({ parts })`

### Asset

- **何か**: 実素材ファイルのメタ情報（URL / パス / メモリキー + kind + hints）
- **責務**: 取得方法は指示せず、Loader に委譲する。kind と hints は Renderer が解釈する
- **対比**: **Asset** はメタ情報のみ、**Resource** が Loader 取得後の実体

### Resource

- **何か**: Loader が Asset を取得した結果
- **責務**: Renderer が描画に使える形のデータ（`SVGElement` / `ArrayBuffer` 等）を保持する
- **ライフサイクル**: 必要に応じて取得、キャッシュ、破棄

### Selection

- **何か**: 特定 Slot で選ばれた Part と、その調整値（色等）の組
- **責務**: `slotId → { partId, color, ... }` を表す単位データ

### AvatarState

- **何か**: ユーザーが現在選んでいる状態の集合
- **責務**: 全 Slot 分の Selection と、Slot ごとの変形（SlotTransform）を集めた純粋データ。シリアライズ可能
- **更新**: `engine.select()` / `engine.setTransform()` によりイミュータブルに更新される。状態変化は `state:change` イベントで通知

## Asset と Resource の関係

Asset は **スキーマ上のメタ情報**、Resource は **ランタイム上の実データ**。同じ `assetId` で対応する別レイヤーの存在である。

| 観点 | `AvatarSchema.assets[]`（Asset） | Loader の `load` 戻り値（Resource） |
| --- | --- | --- |
| 何を持つ？ | `id` / `kind` / `src` / `hints` | `assetId` / `kind` / `data`（実体） |
| 誰が作る？ | スキーマ作者／Parts プラグイン | Loader プラグイン |
| いつ存在？ | 起動時からずっと（スキーマの一部） | 必要に応じて取得される |
| 可変？ | 実行中は不変 | キャッシュされうる（LRU 等） |
| サイズ | 小さい（メタ情報） | 大きい（画像本体など） |
| 紐付けキー | `Asset.id` | `Resource.assetId` |

```
 宣言: AvatarSchema.assets[]
        ┌────────────────────────────────┐
        │ { id: "asset-hair-01",         │
        │   kind: "svg",                 │
        │   src: "hair/01.svg",          │
        │   hints: { width, height } }   │
        └──────────────┬─────────────────┘
                       │ Loader.load(asset)
                       ▼
 実データ: Resource
        ┌────────────────────────────────┐
        │ { assetId: "asset-hair-01",    │
        │   kind: "svg",                 │
        │   data: <SVGElement | …> }     │
        └────────────────────────────────┘
```

**Loader は「Asset → Resource」の変換器**、と一文で言える。Renderer は Resource 側だけを触り、Asset の `src` 文字列をどう解釈するかは関知しない。

## Parts プラグインの `assets` と Loader プラグインは独立

Parts プラグインが `addFragment({ parts, assets })` で渡す `assets` は **スキーマ側の Asset メタ情報**。Loader プラグインとは別レイヤーで、互いに干渉しない。

```
Parts プラグイン              Loader プラグイン
───────────────────           ───────────────────
ctx.parts.addFragment({       ctx.loader.add({
  parts: [...],                 canHandle(asset) { ... },
  assets: [...]   ─────────►    load(asset) { ... → Resource }
})                            })
    ↑                             ↑
スキーマに Asset を足す         Asset を実データに変換する
```

これにより、**同じスキーマのまま Loader だけを差し替える**（例: 開発時は `loader-memory`、本番は `loader-http`）、あるいは **Parts だけ増やして Loader はそのまま**、といった組み替えが自由にできる。

## プラグインが触る範囲

| 概念 | 触れるプラグイン | 典型的な操作 |
| --- | --- | --- |
| AvatarSchema | Parts | `ctx.parts.addFragment()` で追記 |
| Slot / Part | Parts | 上記 `addFragment` 経由 |
| Asset → Resource | Loader | `canHandle(asset)` 判定 → `load(asset)` |
| AvatarState + Resource | Renderer | `render(state, resources)` で描画 |
| AvatarState 全体 | Exporter | `export({ schema, state, resources }, options)` で変換 |

## よくある誤解

- **「Asset = 画像ファイル」ではない**: Asset はメタ情報。実データは Resource
- **「Slot = Part」ではない**: Slot は枠、Part はそこに入る候補
- **「Renderer が Asset を取得する」わけではない**: 取得は Loader の責務。Renderer は取得済み Resource を使うだけ
- **「AvatarState にスキーマ情報は入らない」**: state は選択と変形だけ。既定の配置（placement）はスキーマ側にあり、スキーマと状態は分離されている

これらの分離は ADR で固定された方針ではなく、ドメインモデル上の原則として維持する。
