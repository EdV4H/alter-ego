# @edv4h/alter-ego-perceive

写真から `AvatarSeed` (alter-ego の selections + slotTransforms と互換な構造) を推定する Perception 層。 OpenAI Vision (gpt-5.4-mini) を既定実装として提供する。

プロンプトは渡したスキーマから組み立てる。 Slot / Part の `description`、 Slot の `palette` と `x-perceive` (`colorHint` / `hint`)、 `groups` を使い、 特定の Slot id には依存しない ([ADR-0011](https://github.com/EdV4H/alter-ego/blob/main/docs/domain/adr/0011-perceive-prompt-from-schema.md)、 書き方は [スキーマ仕様](https://github.com/EdV4H/alter-ego/blob/main/docs/schema.md#x-perceiveperceive-のヒント))。

## インストール

```sh
npm install @edv4h/alter-ego-perceive
```

ESM のみ。0.x の間は minor でも壊れる変更が入ることがある（[CHANGELOG](./CHANGELOG.md)）。

## 公開 API

- `Perceiver` — `perceive(file, options?): Promise<AvatarSeed>` を持つ interface
- `createOpenAIPerceiver(opts)` — OpenAI Vision API を使った既定実装
- `PerceiveError` — `kind: "network" | "parse" | "validate" | "auth" | "cancelled"` を持つエラー

## 使用例

```ts
import { createOpenAIPerceiver } from "@edv4h/alter-ego-perceive";

const perceiver = createOpenAIPerceiver({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  schema, // AvatarSchema
});

const seed = await perceiver.perceive(file, { signal: ctrl.signal });
```

### Proxy モード (apiKey を server side で付与)

クライアントから API キーを露出させたくない場合、 サーバ proxy 経由で OpenAI を叩く構成が可能:

```ts
const perceiver = createOpenAIPerceiver({
  endpoint: "/api/perceive",  // 自分のサーバの proxy エンドポイント
  schema,
  // apiKey は省略 (サーバ middleware が Authorization ヘッダーを足す)
});
```
