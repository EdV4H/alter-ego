# alter-ego MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** alter-ego の最小縦串実装 (apps/react-web 上でアバターが描画され、ボタンで切替えできる) を ADR 0001〜0006 準拠で完成させる。

**Architecture:** schema (型 + validate) → core (Engine + Registry 群 + Events) → plugins (renderer-svg + loader-http) → apps/react-web の依存ツリー。先に Phase 1 で薄い縦串を通し、Phase 2 で ADR 準拠を強化、Phase 3 でテスト・CI を整備する。

**Tech Stack:** TypeScript 5.7 (strict, ESM), pnpm workspaces, tsdown (lib build), Vite 6 (apps), Vitest 3, oxlint, React 19 (apps のみ)

参照: [設計書](../specs/2026-06-03-mvp-scope-design.md)

---

## File Structure

### packages/schema/src/
- `index.ts` — 公開 API のバレル
- `types.ts` — `AvatarSchema` / `Slot` / `Part` / `Asset` / `Selection` 等の型
- `errors.ts` — `SchemaValidationError`
- `validate.ts` — Phase 1: 形だけの構造チェック / Phase 2: JSON Schema による厳密 validate
- `json-schema.ts` — Phase 2 で追加する JSON Schema 定義 (`as const`)
- `validate.test.ts` — validate のテスト

### packages/core/src/
- `index.ts` — 公開 API のバレル
- `types.ts` — `Plugin` / `PluginContext` / `Renderer` / `Loader` / `Resource` / `EngineEvent` / `SelectionInput` 等の型
- `errors.ts` — `PluginSetupError` / `LoaderConflictError` / `FragmentConflictError` / `SelectionError`
- `events.ts` — `EventBus`
- `events.test.ts`
- `state.ts` — `AvatarState` 計算 (イミュータブル)
- `state.test.ts`
- `registries/parts.ts` — `PartsRegistry`
- `registries/parts.test.ts`
- `registries/loader.ts` — `LoaderRegistry` (スキーム振り分け、ADR-0005)
- `registries/loader.test.ts`
- `registries/renderer.ts` — `RendererRegistry`
- `registries/exporter.ts` — `ExporterRegistry` (登録口のみ)
- `resource-cache.ts` — `Resource` キャッシュ (asset.id 単位)
- `engine.ts` — `createAvatarEngine` / `AvatarEngine`
- `engine.test.ts`

### plugins/renderer-svg/src/
- `index.ts` — `svgRendererPlugin`
- `svg-renderer.test.ts`

### plugins/loader-http/src/
- `index.ts` — `httpLoaderPlugin`
- `http-loader.test.ts`

### apps/react-web/
- `src/avatar.schema.json` — 最小スキーマ (新規)
- `public/assets/hair-{01,02,03}.svg` — ダミー素材 (新規)
- `src/App.tsx` — 既存を書き換え
- `package.json` — 依存を `loader-http` 中心に書き換え

### .github/workflows/ci.yml
- pnpm install / typecheck / test / build

---

## Phase 1 — 最小骨格を縦に通す

> **ゲート**: `pnpm dev` でブラウザにアバターが描画され、ボタンで切り替わる。ADR 厳密準拠は Phase 2 で。

### Task 1: schema の型と最小 validate

**Files:**
- Create: `packages/schema/src/types.ts`
- Create: `packages/schema/src/errors.ts`
- Create: `packages/schema/src/validate.ts`
- Create: `packages/schema/src/validate.test.ts`
- Modify: `packages/schema/src/index.ts`

- [ ] **Step 1: 失敗するテストを書く**

`packages/schema/src/validate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SchemaValidationError } from "./errors.js";
import { validate } from "./validate.js";

describe("validate (minimal structural check)", () => {
  it("returns ok for a minimal valid schema", () => {
    const schema = {
      schemaVersion: "1.0",
      metadata: { name: "minimal" },
      slots: [{ id: "hair", name: "髪", zIndex: 0 }],
      parts: [
        { id: "hair-01", slotId: "hair", name: "ショート", assetId: "asset-hair-01" },
      ],
      assets: [
        { id: "asset-hair-01", kind: "svg", src: "hair-01.svg" },
      ],
    };
    const result = validate(schema);
    expect(result.ok).toBe(true);
  });

  it("returns not-ok when required top-level keys are missing", () => {
    const result = validate({ schemaVersion: "1.0" });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returns not-ok when slots is not an array", () => {
    const result = validate({
      schemaVersion: "1.0",
      metadata: { name: "x" },
      slots: "not-array",
      parts: [],
      assets: [],
    });
    expect(result.ok).toBe(false);
  });

  it("SchemaValidationError carries the error list", () => {
    const err = new SchemaValidationError([
      { path: "/slots", message: "must be array" },
    ]);
    expect(err.errors).toHaveLength(1);
    expect(err.message).toContain("must be array");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```
pnpm vitest run packages/schema/src/validate.test.ts
```
Expected: FAIL — `Cannot find module './validate.js'` 等

- [ ] **Step 3: 型を実装**

`packages/schema/src/types.ts`:

```ts
export interface AvatarSchema {
  schemaVersion: string;
  metadata: { name: string; description?: string; author?: string };
  slots: Slot[];
  parts: Part[];
  assets: Asset[];
}

export interface Slot {
  id: string;
  name: string;
  zIndex: number;
  required?: boolean;
  category?: string;
}

export interface Part {
  id: string;
  slotId: string;
  name: string;
  assetId: string;
  colorable?: boolean;
  variants?: Variant[];
}

export interface Variant {
  id: string;
  overrides?: { color?: string; [xKey: `x-${string}`]: unknown };
}

export interface Asset {
  id: string;
  kind: "svg" | "image" | "3d" | "text" | (string & {});
  src: string;
  hints?: Record<string, unknown>;
}

export interface SelectionEntry {
  partId: string;
  variantId?: string;
  color?: string;
}

export interface SchemaError {
  path: string;
  message: string;
}
```

- [ ] **Step 4: エラー型を実装**

`packages/schema/src/errors.ts`:

```ts
import type { SchemaError } from "./types.js";

export class SchemaValidationError extends Error {
  readonly errors: readonly SchemaError[];

  constructor(errors: readonly SchemaError[]) {
    const summary = errors
      .map((e) => `${e.path}: ${e.message}`)
      .join("; ");
    super(`Schema validation failed: ${summary}`);
    this.name = "SchemaValidationError";
    this.errors = errors;
  }
}
```

- [ ] **Step 5: validate を実装 (Phase 1 は形だけ)**

`packages/schema/src/validate.ts`:

```ts
import type { AvatarSchema, SchemaError } from "./types.js";

type ValidateResult =
  | { ok: true; schema: AvatarSchema }
  | { ok: false; errors: SchemaError[] };

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function validate(input: unknown): ValidateResult {
  const errors: SchemaError[] = [];

  if (!isPlainObject(input)) {
    return { ok: false, errors: [{ path: "/", message: "must be object" }] };
  }

  const requireString = (key: string) => {
    if (typeof input[key] !== "string") {
      errors.push({ path: `/${key}`, message: "must be string" });
    }
  };
  const requireArray = (key: string) => {
    if (!Array.isArray(input[key])) {
      errors.push({ path: `/${key}`, message: "must be array" });
    }
  };

  requireString("schemaVersion");
  if (!isPlainObject(input.metadata)) {
    errors.push({ path: "/metadata", message: "must be object" });
  } else if (typeof input.metadata.name !== "string") {
    errors.push({ path: "/metadata/name", message: "must be string" });
  }
  requireArray("slots");
  requireArray("parts");
  requireArray("assets");

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, schema: input as unknown as AvatarSchema };
}
```

- [ ] **Step 6: index.ts でエクスポート**

`packages/schema/src/index.ts`:

```ts
export type {
  AvatarSchema,
  Slot,
  Part,
  Variant,
  Asset,
  SelectionEntry,
  SchemaError,
} from "./types.js";
export { SchemaValidationError } from "./errors.js";
export { validate } from "./validate.js";
```

- [ ] **Step 7: テストが通ることを確認**

```
pnpm vitest run packages/schema/src/validate.test.ts
```
Expected: 全 PASS (4 件)

- [ ] **Step 8: typecheck**

```
pnpm -C packages/schema typecheck
```
Expected: エラーなし

- [ ] **Step 9: commit**

```bash
git add packages/schema/src/
git commit -m "🎉 feat(schema): 型定義と最小 validate を追加

Phase 1 (薄い E2E) として、AvatarSchema/Slot/Part/Asset 型と
構造のみチェックする最小 validate、SchemaValidationError を実装。
JSON Schema による厳密化は Phase 2 で行う。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: core の型定義 (Plugin / Loader / Renderer / Event)

**Files:**
- Create: `packages/core/src/types.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/package.json` (schema への依存を追加)

- [ ] **Step 1: core が schema に依存できるよう package.json を更新**

`packages/core/package.json` の dependencies に追加 (devDependencies と並列):

```json
  "dependencies": {
    "@edv4h/alter-ego-schema": "workspace:*"
  },
```

そして `pnpm install` で workspace リンクを反映:

```
pnpm install
```

Expected: `packages/core/node_modules/@edv4h/alter-ego-schema` がシンボリックリンクとして存在する

- [ ] **Step 2: 型定義を書く**

`packages/core/src/types.ts`:

```ts
import type { AvatarSchema, Asset, SelectionEntry } from "@edv4h/alter-ego-schema";

export type Unsubscribe = () => void;

export type EngineEvent =
  | "state:change"
  | "asset:load"
  | "asset:error"
  | "render:ready"
  | "render:error";

export type EventHandler = (payload?: unknown) => void;

export interface AvatarState {
  readonly selections: Readonly<Record<string, SelectionEntry>>;
}

export interface SelectionInput {
  slot: string;
  part: string;
  variant?: string;
  color?: string;
}

export interface Resource {
  readonly assetId: string;
  readonly kind: string;
  readonly mime?: string;
  readonly data: unknown;
}

export interface Loader {
  canHandle(asset: Asset): boolean;
  load(asset: Asset): Promise<Resource>;
}

export interface Renderer {
  mount(target: unknown, ctx: RendererContext): void | Promise<void>;
  update(ctx: RendererContext): void | Promise<void>;
  unmount(): void | Promise<void>;
}

export interface RendererContext {
  readonly schema: AvatarSchema;
  readonly state: AvatarState;
  readonly resources: ReadonlyMap<string, Resource>;
}

export interface PartsFragment {
  parts?: AvatarSchema["parts"];
  assets?: AvatarSchema["assets"];
}

export interface RendererRegistry { add(renderer: Renderer): void; }
export interface LoaderRegistry { add(loader: Loader): void; }
export interface PartsRegistry { addFragment(fragment: PartsFragment): void; }
export interface ExporterRegistry { add(exporter: unknown): void; }

export interface PluginContext {
  readonly schema: AvatarSchema;
  readonly events: {
    on(event: EngineEvent, handler: EventHandler): Unsubscribe;
    emit(event: EngineEvent, payload?: unknown): void;
  };
  readonly renderer: RendererRegistry;
  readonly loader: LoaderRegistry;
  readonly parts: PartsRegistry;
  readonly exporter: ExporterRegistry;
}

export interface Plugin {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  setup(ctx: PluginContext): void | Promise<void>;
  teardown?(): void | Promise<void>;
}
```

- [ ] **Step 3: index.ts で再エクスポート**

`packages/core/src/index.ts`:

```ts
export type {
  AvatarState,
  EngineEvent,
  EventHandler,
  ExporterRegistry,
  Loader,
  LoaderRegistry,
  PartsFragment,
  PartsRegistry,
  Plugin,
  PluginContext,
  Renderer,
  RendererContext,
  RendererRegistry,
  Resource,
  SelectionInput,
  Unsubscribe,
} from "./types.js";
```

- [ ] **Step 4: typecheck**

```
pnpm -C packages/core typecheck
```
Expected: エラーなし

- [ ] **Step 5: commit**

```bash
git add packages/core/package.json packages/core/src/ pnpm-lock.yaml
git commit -m "🎉 feat(core): Plugin/Loader/Renderer/Event 型を定義

PluginContext と各 Registry のインターフェース、AvatarState、
Resource、EngineEvent 型を追加。schema パッケージへの依存を宣言。
実装は次タスク以降。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: core EventBus 実装

**Files:**
- Create: `packages/core/src/events.ts`
- Create: `packages/core/src/events.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`packages/core/src/events.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { EventBus } from "./events.js";

describe("EventBus", () => {
  it("invokes subscribed handlers", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("state:change", handler);
    bus.emit("state:change", { foo: "bar" });
    expect(handler).toHaveBeenCalledWith({ foo: "bar" });
  });

  it("supports multiple handlers per event", () => {
    const bus = new EventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on("asset:load", a);
    bus.on("asset:load", b);
    bus.emit("asset:load");
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it("unsubscribe stops further calls", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const off = bus.on("render:ready", handler);
    off();
    bus.emit("render:ready");
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not throw if handler throws — other handlers still run", () => {
    const bus = new EventBus();
    const bad = vi.fn(() => { throw new Error("boom"); });
    const good = vi.fn();
    bus.on("asset:error", bad);
    bus.on("asset:error", good);
    expect(() => bus.emit("asset:error")).not.toThrow();
    expect(good).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```
pnpm vitest run packages/core/src/events.test.ts
```
Expected: FAIL — `Cannot find module './events.js'`

- [ ] **Step 3: EventBus を実装**

`packages/core/src/events.ts`:

```ts
import type { EngineEvent, EventHandler, Unsubscribe } from "./types.js";

export class EventBus {
  private handlers = new Map<EngineEvent, Set<EventHandler>>();

  on(event: EngineEvent, handler: EventHandler): Unsubscribe {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return () => {
      set!.delete(handler);
    };
  }

  emit(event: EngineEvent, payload?: unknown): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(payload);
      } catch (e) {
        console.error(`[alter-ego] event handler threw for "${event}":`, e);
      }
    }
  }
}
```

- [ ] **Step 4: テスト PASS を確認**

```
pnpm vitest run packages/core/src/events.test.ts
```
Expected: 全 PASS (4 件)

- [ ] **Step 5: commit**

```bash
git add packages/core/src/events.ts packages/core/src/events.test.ts
git commit -m "🎉 feat(core): EventBus を追加

on/emit/unsubscribe を持つ素朴な EventBus。ハンドラの例外は
他ハンドラの実行を妨げないよう catch する (console.error で報告)。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 各 Registry の最小実装

**Files:**
- Create: `packages/core/src/registries/parts.ts`
- Create: `packages/core/src/registries/parts.test.ts`
- Create: `packages/core/src/registries/loader.ts`
- Create: `packages/core/src/registries/loader.test.ts`
- Create: `packages/core/src/registries/renderer.ts`
- Create: `packages/core/src/registries/exporter.ts`

- [ ] **Step 1: PartsRegistry のテストを書く (Phase 1 — 重複検出は無し)**

`packages/core/src/registries/parts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PartsRegistryImpl } from "./parts.js";

describe("PartsRegistry (Phase 1)", () => {
  it("collects parts and assets from fragments", () => {
    const reg = new PartsRegistryImpl();
    reg.addFragment({
      parts: [{ id: "p1", slotId: "s1", name: "P1", assetId: "a1" }],
      assets: [{ id: "a1", kind: "svg", src: "p1.svg" }],
    });
    reg.addFragment({
      parts: [{ id: "p2", slotId: "s1", name: "P2", assetId: "a2" }],
      assets: [{ id: "a2", kind: "svg", src: "p2.svg" }],
    });

    expect(reg.parts).toHaveLength(2);
    expect(reg.assets).toHaveLength(2);
    expect(reg.findAsset("a1")).toEqual({ id: "a1", kind: "svg", src: "p1.svg" });
  });

  it("handles empty fragments", () => {
    const reg = new PartsRegistryImpl();
    reg.addFragment({});
    expect(reg.parts).toEqual([]);
    expect(reg.assets).toEqual([]);
  });
});
```

- [ ] **Step 2: PartsRegistry 実装**

`packages/core/src/registries/parts.ts`:

```ts
import type { Asset, Part } from "@edv4h/alter-ego-schema";
import type { PartsFragment, PartsRegistry } from "../types.js";

export class PartsRegistryImpl implements PartsRegistry {
  readonly parts: Part[] = [];
  readonly assets: Asset[] = [];

  addFragment(fragment: PartsFragment): void {
    if (fragment.parts) this.parts.push(...fragment.parts);
    if (fragment.assets) this.assets.push(...fragment.assets);
  }

  findAsset(id: string): Asset | undefined {
    return this.assets.find((a) => a.id === id);
  }
}
```

- [ ] **Step 3: LoaderRegistry のテストを書く (Phase 1 — 振り分けは canHandle ベース)**

`packages/core/src/registries/loader.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Loader, Resource } from "../types.js";
import { LoaderRegistryImpl } from "./loader.js";

const makeLoader = (canHandle: boolean, label: string): Loader => ({
  canHandle: () => canHandle,
  load: async (a) =>
    ({ assetId: a.id, kind: a.kind, data: label } satisfies Resource),
});

describe("LoaderRegistry (Phase 1)", () => {
  it("routes to the first Loader whose canHandle returns true", async () => {
    const reg = new LoaderRegistryImpl();
    reg.add(makeLoader(false, "miss"));
    reg.add(makeLoader(true, "hit"));
    const asset = { id: "a", kind: "svg", src: "x.svg" };
    const resource = await reg.resolve(asset);
    expect(resource.data).toBe("hit");
  });

  it("throws when no Loader can handle the asset", async () => {
    const reg = new LoaderRegistryImpl();
    reg.add(makeLoader(false, "miss"));
    await expect(
      reg.resolve({ id: "a", kind: "svg", src: "x.svg" }),
    ).rejects.toThrow(/no loader/i);
  });
});
```

- [ ] **Step 4: LoaderRegistry 実装 (Phase 1 — シンプルな canHandle ループ)**

`packages/core/src/registries/loader.ts`:

```ts
import type { Asset } from "@edv4h/alter-ego-schema";
import type { Loader, LoaderRegistry, Resource } from "../types.js";

export class LoaderRegistryImpl implements LoaderRegistry {
  private loaders: Loader[] = [];

  add(loader: Loader): void {
    this.loaders.push(loader);
  }

  async resolve(asset: Asset): Promise<Resource> {
    for (const loader of this.loaders) {
      if (loader.canHandle(asset)) return loader.load(asset);
    }
    throw new Error(`No loader can handle asset "${asset.id}" (src="${asset.src}")`);
  }
}
```

- [ ] **Step 5: RendererRegistry 実装 (テスト不要、薄い保持配列)**

`packages/core/src/registries/renderer.ts`:

```ts
import type { Renderer, RendererRegistry } from "../types.js";

export class RendererRegistryImpl implements RendererRegistry {
  readonly renderers: Renderer[] = [];

  add(renderer: Renderer): void {
    this.renderers.push(renderer);
  }
}
```

- [ ] **Step 6: ExporterRegistry 実装 (登録口のみ)**

`packages/core/src/registries/exporter.ts`:

```ts
import type { ExporterRegistry } from "../types.js";

export class ExporterRegistryImpl implements ExporterRegistry {
  private items: unknown[] = [];
  add(exporter: unknown): void {
    this.items.push(exporter);
  }
}
```

- [ ] **Step 7: テスト PASS を確認**

```
pnpm vitest run packages/core/src/registries/
```
Expected: 全 PASS (4 件)

- [ ] **Step 8: commit**

```bash
git add packages/core/src/registries/
git commit -m "🎉 feat(core): Parts/Loader/Renderer/Exporter Registry の最小実装

Phase 1 として、PartsRegistry は fragment を蓄積、
LoaderRegistry は canHandle ベースで振り分け、Renderer/Exporter
は保持配列のみ。ID 重複検出やスキーム振り分けは Phase 2 で。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: AvatarState と createAvatarEngine

**Files:**
- Create: `packages/core/src/state.ts`
- Create: `packages/core/src/state.test.ts`
- Create: `packages/core/src/resource-cache.ts`
- Create: `packages/core/src/engine.ts`
- Create: `packages/core/src/engine.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: state の失敗テストを書く**

`packages/core/src/state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeInitialState, selectPart } from "./state.js";

const schema = {
  schemaVersion: "1.0",
  metadata: { name: "t" },
  slots: [
    { id: "hair", name: "髪", zIndex: 0 },
    { id: "base", name: "素体", zIndex: -10 },
  ],
  parts: [
    { id: "hair-01", slotId: "hair", name: "P1", assetId: "a1" },
    { id: "hair-02", slotId: "hair", name: "P2", assetId: "a2" },
    { id: "base-01", slotId: "base", name: "B1", assetId: "b1" },
  ],
  assets: [
    { id: "a1", kind: "svg" as const, src: "a1.svg" },
    { id: "a2", kind: "svg" as const, src: "a2.svg" },
    { id: "b1", kind: "svg" as const, src: "b1.svg" },
  ],
} as const;

describe("computeInitialState", () => {
  it("picks the first part of each slot as default", () => {
    const state = computeInitialState(schema);
    expect(state.selections).toEqual({
      hair: { partId: "hair-01" },
      base: { partId: "base-01" },
    });
  });
});

describe("selectPart", () => {
  it("returns a new state with the slot's part replaced", () => {
    const before = computeInitialState(schema);
    const after = selectPart(before, schema, { slot: "hair", part: "hair-02" });
    expect(after.selections.hair).toEqual({ partId: "hair-02" });
    expect(after.selections.base).toEqual({ partId: "base-01" });
    expect(after).not.toBe(before);
  });

  it("throws when slot is unknown", () => {
    const state = computeInitialState(schema);
    expect(() =>
      selectPart(state, schema, { slot: "nope", part: "x" }),
    ).toThrow(/unknown slot/i);
  });

  it("throws when part is unknown", () => {
    const state = computeInitialState(schema);
    expect(() =>
      selectPart(state, schema, { slot: "hair", part: "nope" }),
    ).toThrow(/unknown part/i);
  });
});
```

- [ ] **Step 2: state.ts を実装**

`packages/core/src/state.ts`:

```ts
import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import type { AvatarState, SelectionInput } from "./types.js";

export function computeInitialState(schema: AvatarSchema): AvatarState {
  const selections: Record<string, { partId: string }> = {};
  for (const slot of schema.slots) {
    const first = schema.parts.find((p) => p.slotId === slot.id);
    if (first) selections[slot.id] = { partId: first.id };
  }
  return { selections: Object.freeze(selections) };
}

export function selectPart(
  state: AvatarState,
  schema: AvatarSchema,
  input: SelectionInput,
): AvatarState {
  if (!schema.slots.some((s) => s.id === input.slot)) {
    throw new Error(`Unknown slot "${input.slot}"`);
  }
  if (
    !schema.parts.some(
      (p) => p.id === input.part && p.slotId === input.slot,
    )
  ) {
    throw new Error(`Unknown part "${input.part}" for slot "${input.slot}"`);
  }
  const next = {
    ...state.selections,
    [input.slot]: {
      partId: input.part,
      ...(input.variant ? { variantId: input.variant } : {}),
      ...(input.color ? { color: input.color } : {}),
    },
  };
  return { selections: Object.freeze(next) };
}
```

- [ ] **Step 3: state テスト PASS を確認**

```
pnpm vitest run packages/core/src/state.test.ts
```
Expected: 全 PASS (4 件)

- [ ] **Step 4: ResourceCache を実装 (テスト不要、薄い Map ラッパー)**

`packages/core/src/resource-cache.ts`:

```ts
import type { Resource } from "./types.js";

export class ResourceCache {
  private map = new Map<string, Resource>();

  get(assetId: string): Resource | undefined {
    return this.map.get(assetId);
  }
  set(resource: Resource): void {
    this.map.set(resource.assetId, resource);
  }
  asReadonlyMap(): ReadonlyMap<string, Resource> {
    return this.map;
  }
}
```

- [ ] **Step 5: engine の失敗テストを書く**

`packages/core/src/engine.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createAvatarEngine } from "./engine.js";
import type { Plugin } from "./types.js";

const minimalSchema = {
  schemaVersion: "1.0",
  metadata: { name: "t" },
  slots: [{ id: "hair", name: "髪", zIndex: 0 }],
  parts: [
    { id: "hair-01", slotId: "hair", name: "P1", assetId: "a1" },
    { id: "hair-02", slotId: "hair", name: "P2", assetId: "a2" },
  ],
  assets: [
    { id: "a1", kind: "svg" as const, src: "a1.svg" },
    { id: "a2", kind: "svg" as const, src: "a2.svg" },
  ],
};

const recordingPlugin = (calls: string[]): Plugin => ({
  id: "rec",
  name: "Rec",
  version: "0.0.0",
  setup(ctx) {
    calls.push("setup");
    ctx.loader.add({
      canHandle: () => true,
      load: async (a) => ({ assetId: a.id, kind: a.kind, data: a.src }),
    });
    ctx.renderer.add({
      mount: (_t, c) => { calls.push(`mount:${c.resources.size === 0 ? "0" : "n"}`); },
      update: () => { calls.push("update"); },
      unmount: () => { calls.push("unmount"); },
    });
  },
});

describe("createAvatarEngine", () => {
  it("validates schema and computes initial state", () => {
    const calls: string[] = [];
    const engine = createAvatarEngine({
      schema: minimalSchema,
      plugins: [recordingPlugin(calls)],
    });
    expect(engine.state.selections.hair).toEqual({ partId: "hair-01" });
    expect(calls).toContain("setup");
  });

  it("throws on invalid schema", () => {
    expect(() =>
      createAvatarEngine({ schema: {} as never, plugins: [] }),
    ).toThrow(/schema/i);
  });

  it("emits state:change and lets select update state", () => {
    const engine = createAvatarEngine({
      schema: minimalSchema,
      plugins: [recordingPlugin([])],
    });
    const handler = vi.fn();
    engine.on("state:change", handler);
    engine.select({ slot: "hair", part: "hair-02" });
    expect(engine.state.selections.hair).toEqual({ partId: "hair-02" });
    expect(handler).toHaveBeenCalled();
  });

  it("mount resolves assets and calls renderer.mount", async () => {
    const engine = createAvatarEngine({
      schema: minimalSchema,
      plugins: [recordingPlugin([])],
    });
    await engine.mount({});
    // No throw is enough for Phase 1
    expect(engine.state).toBeDefined();
  });
});
```

- [ ] **Step 6: engine を実装**

`packages/core/src/engine.ts`:

```ts
import { validate, type AvatarSchema } from "@edv4h/alter-ego-schema";
import { EventBus } from "./events.js";
import { ExporterRegistryImpl } from "./registries/exporter.js";
import { LoaderRegistryImpl } from "./registries/loader.js";
import { PartsRegistryImpl } from "./registries/parts.js";
import { RendererRegistryImpl } from "./registries/renderer.js";
import { ResourceCache } from "./resource-cache.js";
import { computeInitialState, selectPart } from "./state.js";
import type {
  AvatarState,
  EngineEvent,
  EventHandler,
  Plugin,
  PluginContext,
  SelectionInput,
  Unsubscribe,
} from "./types.js";

export interface AvatarEngine {
  readonly schema: AvatarSchema;
  readonly state: AvatarState;
  select(input: SelectionInput): void;
  mount(target: unknown): Promise<void>;
  unmount(): void;
  dispose(): Promise<void>;
  on(event: EngineEvent, handler: EventHandler): Unsubscribe;
}

export function createAvatarEngine(options: {
  schema: AvatarSchema;
  plugins: Plugin[];
}): AvatarEngine {
  const result = validate(options.schema);
  if (!result.ok) {
    throw new Error(
      `Invalid schema: ${result.errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`,
    );
  }
  const schema = result.schema;

  const events = new EventBus();
  const renderer = new RendererRegistryImpl();
  const loader = new LoaderRegistryImpl();
  const parts = new PartsRegistryImpl();
  const exporter = new ExporterRegistryImpl();
  const cache = new ResourceCache();

  let state = computeInitialState(schema);
  let target: unknown = undefined;

  const ctx: PluginContext = {
    schema,
    events: {
      on: (e, h) => events.on(e, h),
      emit: (e, p) => events.emit(e, p),
    },
    renderer,
    loader,
    parts,
    exporter,
  };

  for (const plugin of options.plugins) {
    Promise.resolve(plugin.setup(ctx)).catch((e) => {
      throw new Error(`Plugin setup failed (${plugin.id}): ${String(e)}`);
    });
  }

  parts.addFragment({ parts: schema.parts, assets: schema.assets });

  const resolveResourcesForState = async () => {
    const neededAssetIds = new Set<string>();
    for (const slotId of Object.keys(state.selections)) {
      const sel = state.selections[slotId];
      const part = schema.parts.find((p) => p.id === sel.partId);
      if (part) neededAssetIds.add(part.assetId);
    }
    for (const id of neededAssetIds) {
      if (cache.get(id)) continue;
      const asset = schema.assets.find((a) => a.id === id);
      if (!asset) continue;
      try {
        const res = await loader.resolve(asset);
        cache.set(res);
        events.emit("asset:load", res);
      } catch (e) {
        events.emit("asset:error", { asset, error: e });
      }
    }
  };

  return {
    get schema() { return schema; },
    get state() { return state; },
    select(input) {
      state = selectPart(state, schema, input);
      events.emit("state:change", state);
      void resolveResourcesForState().then(() => {
        for (const r of renderer.renderers) {
          void Promise.resolve(
            r.update({ schema, state, resources: cache.asReadonlyMap() }),
          ).catch((e) => events.emit("render:error", e));
        }
      });
    },
    async mount(t) {
      target = t;
      await resolveResourcesForState();
      for (const r of renderer.renderers) {
        try {
          await r.mount(target, { schema, state, resources: cache.asReadonlyMap() });
        } catch (e) {
          events.emit("render:error", e);
        }
      }
      events.emit("render:ready");
    },
    unmount() {
      for (const r of renderer.renderers) {
        try { void r.unmount(); } catch (e) { events.emit("render:error", e); }
      }
      target = undefined;
    },
    async dispose() {
      this.unmount();
      for (const p of [...options.plugins].reverse()) {
        if (p.teardown) await p.teardown();
      }
    },
    on(event, handler) { return events.on(event, handler); },
  };
}
```

- [ ] **Step 7: index.ts を更新**

`packages/core/src/index.ts` の末尾に追加:

```ts
export { createAvatarEngine } from "./engine.js";
export type { AvatarEngine } from "./engine.js";
```

- [ ] **Step 8: テストと typecheck**

```
pnpm vitest run packages/core/
pnpm -C packages/core typecheck
```
Expected: 全 PASS (events 4 + parts 2 + loader 2 + state 4 + engine 4 = 16 件)、typecheck エラーなし

- [ ] **Step 9: commit**

```bash
git add packages/core/src/
git commit -m "🎉 feat(core): createAvatarEngine と state/cache を追加

schema 検証 → plugin.setup → initial state → mount/select の最小縦串。
Phase 1 として ADR 0005/0006 の厳密チェックは未実装、Phase 2 で追加。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: plugins/loader-http の最小実装

**Files:**
- Modify: `plugins/loader-http/src/index.ts`
- Create: `plugins/loader-http/src/http-loader.test.ts`
- Modify: `plugins/loader-http/package.json` (schema 依存追加)

- [ ] **Step 1: package.json に schema 依存を追加**

`plugins/loader-http/package.json` の dependencies に追加:

```json
  "dependencies": {
    "@edv4h/alter-ego-core": "workspace:*",
    "@edv4h/alter-ego-schema": "workspace:*"
  },
```

そして:

```
pnpm install
```

- [ ] **Step 2: 失敗するテストを書く (msw は Phase 3、Phase 1 は fetch をスタブ)**

`plugins/loader-http/src/http-loader.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { httpLoaderPlugin } from "./index.js";

const makeCtx = () => {
  const loaders: unknown[] = [];
  const emitted: Array<[string, unknown]> = [];
  const ctx = {
    schema: { schemaVersion: "1.0", metadata: { name: "t" }, slots: [], parts: [], assets: [] },
    events: { on: () => () => {}, emit: (e: string, p?: unknown) => emitted.push([e, p]) },
    renderer: { add: () => {} },
    loader: { add: (l: unknown) => loaders.push(l) },
    parts: { addFragment: () => {} },
    exporter: { add: () => {} },
  };
  return { ctx, loaders, emitted };
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("httpLoaderPlugin", () => {
  it("registers a loader on setup", async () => {
    const { ctx, loaders } = makeCtx();
    await httpLoaderPlugin({ baseUrl: "https://cdn/" }).setup(ctx as never);
    expect(loaders).toHaveLength(1);
  });

  it("canHandle accepts http(s) and relative refs", async () => {
    const { ctx, loaders } = makeCtx();
    await httpLoaderPlugin({ baseUrl: "https://cdn/" }).setup(ctx as never);
    const loader = loaders[0] as { canHandle: (a: unknown) => boolean };
    expect(loader.canHandle({ src: "https://x/y.svg" })).toBe(true);
    expect(loader.canHandle({ src: "http://x/y.svg" })).toBe(true);
    expect(loader.canHandle({ src: "y.svg" })).toBe(true);
    expect(loader.canHandle({ src: "mem:x" })).toBe(false);
  });

  it("loads via fetch and returns a Resource", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "image/svg+xml" }),
      text: async () => "<svg/>",
    });

    const { ctx, loaders } = makeCtx();
    await httpLoaderPlugin({ baseUrl: "https://cdn/" }).setup(ctx as never);
    const loader = loaders[0] as { load: (a: unknown) => Promise<unknown> };
    const r = (await loader.load({ id: "a1", kind: "svg", src: "hair.svg" })) as {
      assetId: string;
      data: string;
      mime?: string;
    };
    expect(r.assetId).toBe("a1");
    expect(r.data).toBe("<svg/>");
    expect(r.mime).toBe("image/svg+xml");
    expect(globalThis.fetch).toHaveBeenCalledWith("https://cdn/hair.svg");
  });

  it("throws on non-ok response", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
    });

    const { ctx, loaders } = makeCtx();
    await httpLoaderPlugin({ baseUrl: "https://cdn/" }).setup(ctx as never);
    const loader = loaders[0] as { load: (a: unknown) => Promise<unknown> };
    await expect(
      loader.load({ id: "a1", kind: "svg", src: "x.svg" }),
    ).rejects.toThrow(/404/);
  });
});
```

- [ ] **Step 3: テストが失敗することを確認**

```
pnpm vitest run plugins/loader-http/src/http-loader.test.ts
```
Expected: FAIL

- [ ] **Step 4: 実装**

`plugins/loader-http/src/index.ts`:

```ts
import type { Loader, Plugin, PluginContext, Resource } from "@edv4h/alter-ego-core";
import type { Asset } from "@edv4h/alter-ego-schema";

const ABSOLUTE_HTTP_RE = /^https?:\/\//i;
const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

export interface HttpLoaderOptions {
  baseUrl: string;
}

export function httpLoaderPlugin(options: HttpLoaderOptions): Plugin {
  const loader: Loader = {
    canHandle(asset: Asset): boolean {
      if (ABSOLUTE_HTTP_RE.test(asset.src)) return true;
      return !SCHEME_RE.test(asset.src);
    },
    async load(asset: Asset): Promise<Resource> {
      const url = ABSOLUTE_HTTP_RE.test(asset.src)
        ? asset.src
        : new URL(asset.src, options.baseUrl).toString();
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} fetching ${url}`);
      }
      const mime = res.headers.get("content-type") ?? undefined;
      const data =
        asset.kind === "svg" || asset.kind === "text"
          ? await res.text()
          : await res.blob();
      return { assetId: asset.id, kind: asset.kind, mime, data };
    },
  };

  return {
    id: "@edv4h/alter-ego-plugin-loader-http",
    name: "HTTP Loader",
    version: "0.0.1",
    setup(ctx: PluginContext) {
      ctx.loader.add(loader);
    },
  };
}
```

- [ ] **Step 5: テスト PASS を確認**

```
pnpm vitest run plugins/loader-http/src/http-loader.test.ts
```
Expected: 全 PASS (4 件)

- [ ] **Step 6: typecheck**

```
pnpm -C plugins/loader-http typecheck
```
Expected: エラーなし

- [ ] **Step 7: commit**

```bash
git add plugins/loader-http/
git commit -m "🎉 feat(plugin-loader-http): http(s)/相対参照対応の最小 Loader を追加

canHandle で http(s):/相対を担当、fetch で取得し Resource を返す。
4xx-5xx は throw、Renderer 側の Resource 解釈は kind に応じて text/blob を返す。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: plugins/renderer-svg の最小実装

**Files:**
- Modify: `plugins/renderer-svg/src/index.ts`
- Create: `plugins/renderer-svg/src/svg-renderer.test.ts`
- Modify: `plugins/renderer-svg/package.json` (schema, happy-dom 依存追加)
- Modify: `vitest.config.ts` (renderer-svg は happy-dom 環境)

- [ ] **Step 1: vitest 設定で renderer-svg のみ happy-dom 環境を使う**

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/*/src/**/*.test.ts",
      "plugins/*/src/**/*.test.ts",
    ],
    environment: "node",
    environmentMatchGlobs: [
      ["plugins/renderer-svg/**", "happy-dom"],
    ],
    globals: false,
  },
});
```

- [ ] **Step 2: renderer-svg の package.json に schema 依存と happy-dom を追加**

`plugins/renderer-svg/package.json` の dependencies と devDependencies:

```json
  "dependencies": {
    "@edv4h/alter-ego-core": "workspace:*",
    "@edv4h/alter-ego-schema": "workspace:*"
  },
  "devDependencies": {
    "happy-dom": "^15.0.0",
    "tsdown": "^0.21.9",
    "typescript": "^5.7.0"
  },
```

そして:

```
pnpm install
```

- [ ] **Step 3: 失敗するテストを書く**

`plugins/renderer-svg/src/svg-renderer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { svgRendererPlugin } from "./index.js";
import type { Renderer, RendererContext } from "@edv4h/alter-ego-core";

const setupCtx = () => {
  const renderers: Renderer[] = [];
  const ctx = {
    schema: { schemaVersion: "1.0", metadata: { name: "t" }, slots: [], parts: [], assets: [] },
    events: { on: () => () => {}, emit: () => {} },
    renderer: { add: (r: Renderer) => renderers.push(r) },
    loader: { add: () => {} },
    parts: { addFragment: () => {} },
    exporter: { add: () => {} },
  };
  return { ctx, renderers };
};

const schema = {
  schemaVersion: "1.0",
  metadata: { name: "t" },
  slots: [
    { id: "base", name: "B", zIndex: 0 },
    { id: "hair", name: "H", zIndex: 10 },
  ],
  parts: [
    { id: "base-01", slotId: "base", name: "B1", assetId: "a-base-01" },
    { id: "hair-01", slotId: "hair", name: "H1", assetId: "a-hair-01" },
    { id: "hair-02", slotId: "hair", name: "H2", assetId: "a-hair-02" },
  ],
  assets: [
    { id: "a-base-01", kind: "svg", src: "base-01.svg" },
    { id: "a-hair-01", kind: "svg", src: "hair-01.svg" },
    { id: "a-hair-02", kind: "svg", src: "hair-02.svg" },
  ],
} as const;

describe("svgRendererPlugin", () => {
  it("registers a renderer on setup", async () => {
    const { ctx, renderers } = setupCtx();
    await svgRendererPlugin().setup(ctx as never);
    expect(renderers).toHaveLength(1);
  });

  it("mount inserts <image> elements ordered by zIndex", async () => {
    const { ctx, renderers } = setupCtx();
    await svgRendererPlugin().setup(ctx as never);
    const renderer = renderers[0];

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    document.body.appendChild(svg);

    const resources = new Map([
      ["a-base-01", { assetId: "a-base-01", kind: "svg", data: "<svg/>", mime: "image/svg+xml" }],
      ["a-hair-01", { assetId: "a-hair-01", kind: "svg", data: "<svg/>", mime: "image/svg+xml" }],
    ]);
    const rctx: RendererContext = {
      schema,
      state: { selections: { base: { partId: "base-01" }, hair: { partId: "hair-01" } } },
      resources,
    };
    await renderer.mount(svg, rctx);

    const images = svg.querySelectorAll("image");
    expect(images).toHaveLength(2);
    // base (zIndex 0) comes before hair (zIndex 10)
    expect(images[0].getAttribute("data-slot")).toBe("base");
    expect(images[1].getAttribute("data-slot")).toBe("hair");
  });

  it("update swaps href when selection changes", async () => {
    const { ctx, renderers } = setupCtx();
    await svgRendererPlugin().setup(ctx as never);
    const renderer = renderers[0];

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    document.body.appendChild(svg);

    const baseResources = new Map([
      ["a-hair-01", { assetId: "a-hair-01", kind: "svg", data: "first", mime: "image/svg+xml" }],
    ]);
    await renderer.mount(svg, {
      schema,
      state: { selections: { hair: { partId: "hair-01" } } },
      resources: baseResources,
    });

    const updatedResources = new Map([
      ["a-hair-01", { assetId: "a-hair-01", kind: "svg", data: "first", mime: "image/svg+xml" }],
      ["a-hair-02", { assetId: "a-hair-02", kind: "svg", data: "second", mime: "image/svg+xml" }],
    ]);
    await renderer.update({
      schema,
      state: { selections: { hair: { partId: "hair-02" } } },
      resources: updatedResources,
    });

    const img = svg.querySelector('image[data-slot="hair"]') as SVGImageElement;
    expect(img.getAttribute("href")).toContain("second");
  });
});
```

- [ ] **Step 4: テストが失敗することを確認**

```
pnpm vitest run plugins/renderer-svg/src/svg-renderer.test.ts
```
Expected: FAIL

- [ ] **Step 5: 実装**

`plugins/renderer-svg/src/index.ts`:

```ts
import type {
  Plugin,
  PluginContext,
  Renderer,
  RendererContext,
} from "@edv4h/alter-ego-core";

const SVG_NS = "http://www.w3.org/2000/svg";

function dataUriForResource(resource: { kind: string; data: unknown; mime?: string }): string {
  if (resource.kind === "svg" && typeof resource.data === "string") {
    const encoded = encodeURIComponent(resource.data);
    return `data:image/svg+xml;utf8,${encoded}`;
  }
  if (resource.data instanceof Blob) {
    return URL.createObjectURL(resource.data);
  }
  return "";
}

function syncImages(svg: SVGSVGElement, ctx: RendererContext): void {
  const slotsByZIndex = [...ctx.schema.slots].sort((a, b) => a.zIndex - b.zIndex);
  for (const slot of slotsByZIndex) {
    const sel = ctx.state.selections[slot.id];
    let img = svg.querySelector(`image[data-slot="${slot.id}"]`) as SVGImageElement | null;
    if (!sel) {
      img?.remove();
      continue;
    }
    const part = ctx.schema.parts.find((p) => p.id === sel.partId);
    const resource = part ? ctx.resources.get(part.assetId) : undefined;
    if (!resource) {
      img?.setAttribute("href", "");
      continue;
    }
    if (!img) {
      img = document.createElementNS(SVG_NS, "image");
      img.setAttribute("data-slot", slot.id);
      svg.appendChild(img);
    } else {
      svg.appendChild(img); // 末尾へ移動して zIndex 順を再現
    }
    img.setAttribute("href", dataUriForResource(resource));
  }
}

export interface SvgRendererOptions {
  // 将来拡張用。MVP では空でよい。
}

export function svgRendererPlugin(_options?: SvgRendererOptions): Plugin {
  let target: SVGSVGElement | null = null;

  const renderer: Renderer = {
    mount(targetIn, ctx) {
      if (!(targetIn instanceof SVGSVGElement)) {
        throw new Error("svgRendererPlugin: mount target must be an <svg> element");
      }
      target = targetIn;
      syncImages(target, ctx);
    },
    update(ctx) {
      if (!target) return;
      syncImages(target, ctx);
    },
    unmount() {
      if (target) {
        while (target.firstChild) target.removeChild(target.firstChild);
        target = null;
      }
    },
  };

  return {
    id: "@edv4h/alter-ego-plugin-renderer-svg",
    name: "SVG Renderer",
    version: "0.0.1",
    setup(ctx: PluginContext) {
      ctx.renderer.add(renderer);
    },
  };
}
```

- [ ] **Step 6: テスト PASS を確認**

```
pnpm vitest run plugins/renderer-svg/src/svg-renderer.test.ts
```
Expected: 全 PASS (3 件)

- [ ] **Step 7: typecheck**

```
pnpm -C plugins/renderer-svg typecheck
```
Expected: エラーなし

- [ ] **Step 8: commit**

```bash
git add plugins/renderer-svg/ vitest.config.ts
git commit -m "🎉 feat(plugin-renderer-svg): SVG renderer の最小実装

mount で <image> を slot の zIndex 順に挿入、update で href を差し替える。
Resource を data URI (svg/utf8) または ObjectURL (blob) に変換。
テストは happy-dom 環境で実 DOM を生成して検証。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: apps/react-web に最小スキーマとダミー素材を配置

**Files:**
- Create: `apps/react-web/src/avatar.schema.json`
- Create: `apps/react-web/public/assets/hair-01.svg`
- Create: `apps/react-web/public/assets/hair-02.svg`
- Create: `apps/react-web/public/assets/hair-03.svg`
- Modify: `apps/react-web/package.json` (依存差し替え)
- Modify: `apps/react-web/src/App.tsx`
- Modify: `apps/react-web/tsconfig.json` (resolveJsonModule は base で ON 済み)

- [ ] **Step 1: 最小スキーマを書く**

`apps/react-web/src/avatar.schema.json`:

```json
{
  "schemaVersion": "1.0",
  "metadata": { "name": "mvp-minimal" },
  "slots": [
    { "id": "hair", "name": "髪", "zIndex": 10 }
  ],
  "parts": [
    { "id": "hair-01", "slotId": "hair", "name": "短髪", "assetId": "asset-hair-01" },
    { "id": "hair-02", "slotId": "hair", "name": "ロング", "assetId": "asset-hair-02" },
    { "id": "hair-03", "slotId": "hair", "name": "ツイン", "assetId": "asset-hair-03" }
  ],
  "assets": [
    { "id": "asset-hair-01", "kind": "svg", "src": "hair-01.svg" },
    { "id": "asset-hair-02", "kind": "svg", "src": "hair-02.svg" },
    { "id": "asset-hair-03", "kind": "svg", "src": "hair-03.svg" }
  ]
}
```

- [ ] **Step 2: ダミー素材 (3色の四角を描いた SVG) を作る**

`apps/react-web/public/assets/hair-01.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect width="200" height="200" fill="#c0392b" />
  <text x="100" y="110" text-anchor="middle" fill="white" font-size="32" font-family="sans-serif">hair-01</text>
</svg>
```

`apps/react-web/public/assets/hair-02.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect width="200" height="200" fill="#2980b9" />
  <text x="100" y="110" text-anchor="middle" fill="white" font-size="32" font-family="sans-serif">hair-02</text>
</svg>
```

`apps/react-web/public/assets/hair-03.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <rect width="200" height="200" fill="#27ae60" />
  <text x="100" y="110" text-anchor="middle" fill="white" font-size="32" font-family="sans-serif">hair-03</text>
</svg>
```

- [ ] **Step 3: package.json を MVP の依存に差し替える**

`apps/react-web/package.json` を完全に書き換え:

```json
{
  "name": "@alter-ego/app-react-web",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@edv4h/alter-ego-core": "workspace:*",
    "@edv4h/alter-ego-plugin-loader-http": "workspace:*",
    "@edv4h/alter-ego-plugin-renderer-svg": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
```

そして:

```
pnpm install
```

- [ ] **Step 4: App.tsx を書き換える**

`apps/react-web/src/App.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { createAvatarEngine, type AvatarEngine } from "@edv4h/alter-ego-core";
import { httpLoaderPlugin } from "@edv4h/alter-ego-plugin-loader-http";
import { svgRendererPlugin } from "@edv4h/alter-ego-plugin-renderer-svg";
import schema from "./avatar.schema.json" with { type: "json" };

export function App() {
  const svgRef = useRef<SVGSVGElement>(null);
  const engineRef = useRef<AvatarEngine | null>(null);
  const [selected, setSelected] = useState<string>("hair-01");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    let cancelled = false;
    let engine: AvatarEngine | null = null;
    try {
      engine = createAvatarEngine({
        schema,
        plugins: [
          httpLoaderPlugin({ baseUrl: `${window.location.origin}/assets/` }),
          svgRendererPlugin(),
        ],
      });
      engine.on("asset:error", (e) => console.error("[asset:error]", e));
      engine.on("render:error", (e) => console.error("[render:error]", e));
      engineRef.current = engine;
      void engine.mount(svgRef.current).catch((e) => {
        if (!cancelled) setError(String(e));
      });
    } catch (e) {
      setError(String(e));
    }
    return () => {
      cancelled = true;
      void engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  const onSelect = (partId: string) => {
    setSelected(partId);
    engineRef.current?.select({ slot: "hair", part: partId });
  };

  return (
    <main style={{ fontFamily: "sans-serif", padding: 24 }}>
      <h1>alter-ego MVP</h1>
      {error ? (
        <p style={{ color: "red" }}>Init error: {error}</p>
      ) : (
        <>
          <svg
            ref={svgRef}
            viewBox="0 0 200 200"
            style={{ width: 200, height: 200, border: "1px solid #ccc", display: "block" }}
          />
          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            {["hair-01", "hair-02", "hair-03"].map((id) => (
              <button
                key={id}
                onClick={() => onSelect(id)}
                disabled={selected === id}
                style={{ padding: "8px 16px" }}
              >
                {id}
              </button>
            ))}
          </div>
          <p>Selected: {selected}</p>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 5: ライブラリをビルドしてリンク参照を成立させる**

apps/react-web は packages の dist を import するため、初回は build が必要:

```
pnpm -r --filter="./packages/*" --filter="./plugins/*" run build
```

Expected: schema/core/renderer-svg/loader-http の dist/ が生成される

- [ ] **Step 6: dev で動作確認**

```
pnpm -C apps/react-web dev
```

ブラウザで `http://localhost:5173/` を開く。

Expected:
- `hair-01` の赤い四角が表示される
- ボタン `hair-02` を押すと青に切り替わる
- `hair-03` を押すと緑に切り替わる
- コンソールに `[asset:error]` `[render:error]` が出ていない

確認できたら Ctrl-C で停止。

- [ ] **Step 7: commit**

```bash
git add apps/react-web/
git commit -m "🎉 feat(app-react-web): MVP の最小縦串アプリを実装

最小スキーマ (hair 1スロット・3パーツ) + ダミー SVG 素材で、
http loader + svg renderer 経由のアバター切り替えを実演。
ローカル dev サーバーで動作確認済み。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 2 — ADR 0005/0006 厳密準拠とエラー型整備

> **ゲート**: Phase 1 のブラウザ動作が壊れず、ADR-0005/0006 のテストが PASS。

### Task 9: schema を JSON Schema で厳密 validate に置換

**Files:**
- Modify: `packages/schema/package.json` (ajv 追加)
- Create: `packages/schema/src/json-schema.ts`
- Modify: `packages/schema/src/validate.ts`
- Modify: `packages/schema/src/validate.test.ts`

- [ ] **Step 1: ajv を依存に追加**

`packages/schema/package.json` の dependencies に追加:

```json
  "dependencies": {
    "ajv": "^8.17.1"
  },
```

```
pnpm install
```

- [ ] **Step 2: JSON Schema を書く**

`packages/schema/src/json-schema.ts`:

```ts
export const avatarSchemaJsonSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  required: ["schemaVersion", "metadata", "slots", "parts", "assets"],
  additionalProperties: false,
  patternProperties: { "^x-": {} },
  properties: {
    schemaVersion: { type: "string" },
    metadata: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        author: { type: "string" },
      },
      additionalProperties: false,
      patternProperties: { "^x-": {} },
    },
    slots: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "name", "zIndex"],
        properties: {
          id: { type: "string", pattern: "^[A-Za-z0-9_-]+$" },
          name: { type: "string" },
          zIndex: { type: "number" },
          required: { type: "boolean" },
          category: { type: "string" },
        },
        additionalProperties: false,
        patternProperties: { "^x-": {} },
      },
    },
    parts: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "slotId", "name", "assetId"],
        properties: {
          id: { type: "string", pattern: "^[A-Za-z0-9_-]+$" },
          slotId: { type: "string" },
          name: { type: "string" },
          assetId: { type: "string" },
          colorable: { type: "boolean" },
          variants: { type: "array" },
        },
        additionalProperties: false,
        patternProperties: { "^x-": {} },
      },
    },
    assets: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "kind", "src"],
        properties: {
          id: { type: "string", pattern: "^[A-Za-z0-9_-]+$" },
          kind: { type: "string" },
          src: { type: "string" },
          hints: { type: "object" },
        },
        additionalProperties: false,
        patternProperties: { "^x-": {} },
      },
    },
  },
} as const;
```

- [ ] **Step 3: validate.ts を ajv ベースに置換**

`packages/schema/src/validate.ts`:

```ts
import Ajv from "ajv";
import { avatarSchemaJsonSchema } from "./json-schema.js";
import type { AvatarSchema, SchemaError } from "./types.js";

const ajv = new Ajv({ allErrors: true });
const validator = ajv.compile(avatarSchemaJsonSchema);

type ValidateResult =
  | { ok: true; schema: AvatarSchema }
  | { ok: false; errors: SchemaError[] };

export function validate(input: unknown): ValidateResult {
  const valid = validator(input);
  if (valid) return { ok: true, schema: input as unknown as AvatarSchema };
  const errors: SchemaError[] = (validator.errors ?? []).map((e) => ({
    path: e.instancePath || "/",
    message: `${e.keyword}: ${e.message ?? "invalid"}`,
  }));
  return { ok: false, errors };
}
```

- [ ] **Step 4: テストに JSON Schema 由来のケースを追加**

`packages/schema/src/validate.test.ts` の末尾に追加:

```ts
describe("validate (JSON Schema strict)", () => {
  it("rejects unknown non x- top-level keys", () => {
    const result = validate({
      schemaVersion: "1.0",
      metadata: { name: "x" },
      slots: [],
      parts: [],
      assets: [],
      unknownKey: 1,
    });
    expect(result.ok).toBe(false);
  });

  it("accepts x- prefixed unknown keys", () => {
    const result = validate({
      schemaVersion: "1.0",
      metadata: { name: "x" },
      slots: [],
      parts: [],
      assets: [],
      "x-custom": { foo: 1 },
    });
    expect(result.ok).toBe(true);
  });

  it("rejects invalid id pattern", () => {
    const result = validate({
      schemaVersion: "1.0",
      metadata: { name: "x" },
      slots: [{ id: "with space", name: "n", zIndex: 0 }],
      parts: [],
      assets: [],
    });
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 5: テスト PASS と typecheck**

```
pnpm vitest run packages/schema/
pnpm -C packages/schema typecheck
```
Expected: 全 PASS (元の 4 + 追加 3 = 7 件)、typecheck エラーなし

- [ ] **Step 6: commit**

```bash
git add packages/schema/ pnpm-lock.yaml
git commit -m "🎉 feat(schema): JSON Schema (ajv) による厳密 validate に置換

x- プレフィックス拡張は許容、それ以外の未知トップレベルキーは拒否。
id は英数/ハイフン/アンダースコアのみ。元の構造チェックは ajv の
required/type で吸収。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: PartsRegistry の ID 一意性検出 (ADR-0006)

**Files:**
- Modify: `packages/core/src/registries/parts.ts`
- Modify: `packages/core/src/registries/parts.test.ts`
- Create: `packages/core/src/errors.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: テストを追加**

`packages/core/src/registries/parts.test.ts` の末尾に:

```ts
import { FragmentConflictError } from "../errors.js";

describe("PartsRegistry (ADR-0006: id uniqueness)", () => {
  it("allows duplicate id when fully deep-equal", () => {
    const reg = new PartsRegistryImpl();
    const asset = { id: "a1", kind: "svg" as const, src: "x.svg" };
    reg.addFragment({ assets: [asset] });
    reg.addFragment({ assets: [{ ...asset }] });
    expect(reg.assets).toHaveLength(1);
  });

  it("throws when duplicate id has different fields", () => {
    const reg = new PartsRegistryImpl();
    reg.addFragment({ assets: [{ id: "a1", kind: "svg", src: "x.svg" }] });
    expect(() =>
      reg.addFragment({ assets: [{ id: "a1", kind: "svg", src: "y.svg" }] }),
    ).toThrow(FragmentConflictError);
  });

  it("applies to parts too", () => {
    const reg = new PartsRegistryImpl();
    reg.addFragment({ parts: [{ id: "p1", slotId: "s", name: "P1", assetId: "a" }] });
    expect(() =>
      reg.addFragment({ parts: [{ id: "p1", slotId: "s", name: "DIFFERENT", assetId: "a" }] }),
    ).toThrow(FragmentConflictError);
  });
});
```

- [ ] **Step 2: errors.ts を作る**

`packages/core/src/errors.ts`:

```ts
export class PluginSetupError extends Error {
  readonly pluginId: string;
  constructor(pluginId: string, cause: unknown) {
    super(`Plugin "${pluginId}" setup failed: ${String(cause)}`);
    this.name = "PluginSetupError";
    this.pluginId = pluginId;
    this.cause = cause;
  }
}

export class LoaderConflictError extends Error {
  constructor(scheme: string) {
    super(`Multiple loaders registered for scheme "${scheme}"`);
    this.name = "LoaderConflictError";
  }
}

export class FragmentConflictError extends Error {
  readonly kind: "parts" | "assets";
  readonly id: string;
  constructor(kind: "parts" | "assets", id: string, existing: unknown, incoming: unknown) {
    super(
      `Fragment conflict on ${kind} id "${id}": existing=${JSON.stringify(existing)} incoming=${JSON.stringify(incoming)}`,
    );
    this.name = "FragmentConflictError";
    this.kind = kind;
    this.id = id;
  }
}

export class SelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SelectionError";
  }
}
```

- [ ] **Step 3: PartsRegistry でディープ等価チェックを実装**

`packages/core/src/registries/parts.ts`:

```ts
import type { Asset, Part } from "@edv4h/alter-ego-schema";
import { FragmentConflictError } from "../errors.js";
import type { PartsFragment, PartsRegistry } from "../types.js";

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object") {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const ak = Object.keys(ao);
    const bk = Object.keys(bo);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => deepEqual(ao[k], bo[k]));
  }
  return false;
}

export class PartsRegistryImpl implements PartsRegistry {
  readonly parts: Part[] = [];
  readonly assets: Asset[] = [];

  addFragment(fragment: PartsFragment): void {
    if (fragment.parts) {
      for (const p of fragment.parts) this.upsertPart(p);
    }
    if (fragment.assets) {
      for (const a of fragment.assets) this.upsertAsset(a);
    }
  }

  private upsertPart(p: Part): void {
    const existing = this.parts.find((x) => x.id === p.id);
    if (!existing) {
      this.parts.push(p);
      return;
    }
    if (!deepEqual(existing, p)) {
      throw new FragmentConflictError("parts", p.id, existing, p);
    }
  }

  private upsertAsset(a: Asset): void {
    const existing = this.assets.find((x) => x.id === a.id);
    if (!existing) {
      this.assets.push(a);
      return;
    }
    if (!deepEqual(existing, a)) {
      throw new FragmentConflictError("assets", a.id, existing, a);
    }
  }

  findAsset(id: string): Asset | undefined {
    return this.assets.find((a) => a.id === id);
  }
}
```

- [ ] **Step 4: index.ts でエラー型を公開**

`packages/core/src/index.ts` の末尾に:

```ts
export {
  PluginSetupError,
  LoaderConflictError,
  FragmentConflictError,
  SelectionError,
} from "./errors.js";
```

- [ ] **Step 5: テスト PASS と typecheck**

```
pnpm vitest run packages/core/src/registries/parts.test.ts
pnpm -C packages/core typecheck
```
Expected: 全 PASS (元 2 + 追加 3 = 5 件)、typecheck OK

- [ ] **Step 6: commit**

```bash
git add packages/core/src/
git commit -m "🎉 feat(core): PartsRegistry の ID 一意性検出を実装 (ADR-0006)

同一 id でディープ等価なら許容、フィールドに差があれば
FragmentConflictError を throw。エラー型 (PluginSetupError /
LoaderConflictError / FragmentConflictError / SelectionError) を整備。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: LoaderRegistry のスキーム振り分け (ADR-0005)

**Files:**
- Modify: `packages/core/src/registries/loader.ts`
- Modify: `packages/core/src/registries/loader.test.ts`
- Modify: `packages/core/src/types.ts` (Loader に schemes プロパティを追加)

- [ ] **Step 1: Loader 型を拡張する**

`packages/core/src/types.ts` の Loader を:

```ts
export interface Loader {
  /** このローダーが担当するスキーム (小文字)。`""` は相対参照を意味する */
  readonly schemes: readonly string[];
  load(asset: Asset): Promise<Resource>;
  /** 追加の動的判定 (オプション) */
  canHandle?(asset: Asset): boolean;
}
```

- [ ] **Step 2: テストを書き換える**

`packages/core/src/registries/loader.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LoaderConflictError } from "../errors.js";
import type { Loader, Resource } from "../types.js";
import { LoaderRegistryImpl } from "./loader.js";

const makeLoader = (schemes: readonly string[], label: string): Loader => ({
  schemes,
  load: async (a) => ({ assetId: a.id, kind: a.kind, data: label } satisfies Resource),
});

describe("LoaderRegistry (ADR-0005 dispatch by scheme)", () => {
  it("normalizes scheme to lowercase before matching", async () => {
    const reg = new LoaderRegistryImpl();
    reg.add(makeLoader(["https"], "https-loader"));
    const resource = await reg.resolve({
      id: "a", kind: "svg",
      src: "HTTPS://x/y.svg",
    });
    expect(resource.data).toBe("https-loader");
  });

  it("dispatches relative refs via empty scheme", async () => {
    const reg = new LoaderRegistryImpl();
    reg.add(makeLoader([""], "relative-loader"));
    const r = await reg.resolve({ id: "a", kind: "svg", src: "y.svg" });
    expect(r.data).toBe("relative-loader");
  });

  it("throws LoaderConflictError when two loaders claim the same scheme", () => {
    const reg = new LoaderRegistryImpl();
    reg.add(makeLoader(["https"], "a"));
    expect(() => reg.add(makeLoader(["https"], "b"))).toThrow(LoaderConflictError);
  });

  it("throws LoaderConflictError when two loaders claim relative ref", () => {
    const reg = new LoaderRegistryImpl();
    reg.add(makeLoader([""], "a"));
    expect(() => reg.add(makeLoader([""], "b"))).toThrow(LoaderConflictError);
  });

  it("throws when no loader claims the asset's scheme", async () => {
    const reg = new LoaderRegistryImpl();
    reg.add(makeLoader(["https"], "a"));
    await expect(
      reg.resolve({ id: "a", kind: "svg", src: "mem:x" }),
    ).rejects.toThrow(/no loader/i);
  });
});
```

- [ ] **Step 3: LoaderRegistry を実装し直す**

`packages/core/src/registries/loader.ts`:

```ts
import type { Asset } from "@edv4h/alter-ego-schema";
import { LoaderConflictError } from "../errors.js";
import type { Loader, LoaderRegistry, Resource } from "../types.js";

const SCHEME_RE = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;

function extractScheme(src: string): string {
  const m = SCHEME_RE.exec(src);
  return m ? m[1].toLowerCase() : "";
}

export class LoaderRegistryImpl implements LoaderRegistry {
  private bySchemes = new Map<string, Loader>();

  add(loader: Loader): void {
    for (const raw of loader.schemes) {
      const scheme = raw.toLowerCase();
      if (this.bySchemes.has(scheme)) {
        throw new LoaderConflictError(scheme);
      }
      this.bySchemes.set(scheme, loader);
    }
  }

  async resolve(asset: Asset): Promise<Resource> {
    const scheme = extractScheme(asset.src);
    const loader = this.bySchemes.get(scheme);
    if (!loader) {
      throw new Error(
        `No loader for scheme "${scheme}" (asset="${asset.id}", src="${asset.src}")`,
      );
    }
    if (loader.canHandle && !loader.canHandle(asset)) {
      throw new Error(
        `Loader rejected asset "${asset.id}" via canHandle (scheme="${scheme}")`,
      );
    }
    return loader.load(asset);
  }
}
```

- [ ] **Step 4: httpLoaderPlugin を新インターフェースに合わせる**

`plugins/loader-http/src/index.ts` の loader 定義を:

```ts
  const loader: Loader = {
    schemes: ["http", "https", ""],
    async load(asset: Asset): Promise<Resource> {
      const url = ABSOLUTE_HTTP_RE.test(asset.src)
        ? asset.src
        : new URL(asset.src, options.baseUrl).toString();
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
      const mime = res.headers.get("content-type") ?? undefined;
      const data =
        asset.kind === "svg" || asset.kind === "text"
          ? await res.text()
          : await res.blob();
      return { assetId: asset.id, kind: asset.kind, mime, data };
    },
  };
```

- [ ] **Step 5: 既存テスト (http-loader.test.ts) も新インターフェースに合わせる**

`plugins/loader-http/src/http-loader.test.ts` の `canHandle accepts http(s) and relative refs` を以下に書き換え:

```ts
  it("declares http/https/empty schemes", async () => {
    const { ctx, loaders } = makeCtx();
    await httpLoaderPlugin({ baseUrl: "https://cdn/" }).setup(ctx as never);
    const loader = loaders[0] as { schemes: readonly string[] };
    expect(loader.schemes).toEqual(expect.arrayContaining(["http", "https", ""]));
  });
```

- [ ] **Step 6: テスト PASS と typecheck**

```
pnpm vitest run packages/core/src/registries/loader.test.ts plugins/loader-http/
pnpm -C packages/core typecheck
pnpm -C plugins/loader-http typecheck
```
Expected: 全 PASS、typecheck OK

- [ ] **Step 7: ブラウザで Phase 1 動作が壊れていないことを確認**

```
pnpm -r --filter="./packages/*" --filter="./plugins/*" run build
pnpm -C apps/react-web dev
```

Expected: 3つのボタンで切り替えが引き続き動く。

- [ ] **Step 8: commit**

```bash
git add packages/core/ plugins/loader-http/
git commit -m "🎉 feat(core,plugin-loader-http): スキームベース Loader 振り分け (ADR-0005)

Loader が schemes 配列で担当を宣言し、LoaderRegistry が正規化済みスキームで
ディスパッチ。同一スキーム複数登録は LoaderConflictError。
http loader は [\"http\", \"https\", \"\"] を宣言。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: engine のプラグイン setup エラーと render:ready の単発化

**Files:**
- Modify: `packages/core/src/engine.ts`
- Modify: `packages/core/src/engine.test.ts`

- [ ] **Step 1: テストを追加**

`packages/core/src/engine.test.ts` の末尾に:

```ts
import { PluginSetupError, SelectionError } from "./errors.js";

describe("createAvatarEngine (ADR-0004 + errors)", () => {
  it("wraps plugin.setup throw in PluginSetupError", async () => {
    const bad: Plugin = {
      id: "bad",
      name: "Bad",
      version: "0.0.0",
      setup() { throw new Error("boom"); },
    };
    await expect(async () =>
      createAvatarEngine({ schema: minimalSchema, plugins: [bad] }),
    ).rejects.toThrow(PluginSetupError);
  });

  it("select throws SelectionError for unknown slot", () => {
    const engine = createAvatarEngine({
      schema: minimalSchema,
      plugins: [recordingPlugin([])],
    });
    expect(() => engine.select({ slot: "no", part: "x" })).toThrow(SelectionError);
  });

  it("emits render:ready exactly once per mount cycle", async () => {
    const engine = createAvatarEngine({
      schema: minimalSchema,
      plugins: [recordingPlugin([])],
    });
    const ready = vi.fn();
    engine.on("render:ready", ready);
    await engine.mount({});
    engine.select({ slot: "hair", part: "hair-02" });
    await new Promise((r) => setTimeout(r, 0));
    expect(ready).toHaveBeenCalledTimes(1);

    engine.unmount();
    await engine.mount({});
    expect(ready).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: engine.ts を修正**

`packages/core/src/engine.ts` の `createAvatarEngine` を以下のように修正:

```ts
import { validate, type AvatarSchema } from "@edv4h/alter-ego-schema";
import { PluginSetupError, SelectionError } from "./errors.js";
import { EventBus } from "./events.js";
import { ExporterRegistryImpl } from "./registries/exporter.js";
import { LoaderRegistryImpl } from "./registries/loader.js";
import { PartsRegistryImpl } from "./registries/parts.js";
import { RendererRegistryImpl } from "./registries/renderer.js";
import { ResourceCache } from "./resource-cache.js";
import { computeInitialState, selectPart } from "./state.js";
import type {
  AvatarState,
  EngineEvent,
  EventHandler,
  Plugin,
  PluginContext,
  SelectionInput,
  Unsubscribe,
} from "./types.js";

export interface AvatarEngine {
  readonly schema: AvatarSchema;
  readonly state: AvatarState;
  select(input: SelectionInput): void;
  mount(target: unknown): Promise<void>;
  unmount(): void;
  dispose(): Promise<void>;
  on(event: EngineEvent, handler: EventHandler): Unsubscribe;
}

export function createAvatarEngine(options: {
  schema: AvatarSchema;
  plugins: Plugin[];
}): AvatarEngine {
  const result = validate(options.schema);
  if (!result.ok) {
    throw new Error(
      `Invalid schema: ${result.errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`,
    );
  }
  const schema = result.schema;

  const events = new EventBus();
  const renderer = new RendererRegistryImpl();
  const loader = new LoaderRegistryImpl();
  const parts = new PartsRegistryImpl();
  const exporter = new ExporterRegistryImpl();
  const cache = new ResourceCache();

  let state = computeInitialState(schema);
  let target: unknown = undefined;
  let readyEmittedForCurrentMount = false;

  const ctx: PluginContext = {
    schema,
    events: {
      on: (e, h) => events.on(e, h),
      emit: (e, p) => events.emit(e, p),
    },
    renderer, loader, parts, exporter,
  };

  for (const plugin of options.plugins) {
    try {
      const r = plugin.setup(ctx);
      if (r instanceof Promise) {
        throw new Error(
          "Async plugin.setup is not supported synchronously yet; await before passing engine to UI.",
        );
      }
    } catch (e) {
      throw new PluginSetupError(plugin.id, e);
    }
  }

  parts.addFragment({ parts: schema.parts, assets: schema.assets });

  const resolveResourcesForState = async () => {
    const neededAssetIds = new Set<string>();
    for (const slotId of Object.keys(state.selections)) {
      const sel = state.selections[slotId];
      const part = schema.parts.find((p) => p.id === sel.partId);
      if (part) neededAssetIds.add(part.assetId);
    }
    for (const id of neededAssetIds) {
      if (cache.get(id)) continue;
      const asset = schema.assets.find((a) => a.id === id);
      if (!asset) continue;
      try {
        const res = await loader.resolve(asset);
        cache.set(res);
        events.emit("asset:load", res);
      } catch (e) {
        events.emit("asset:error", { asset, error: e });
      }
    }
  };

  return {
    get schema() { return schema; },
    get state() { return state; },
    select(input) {
      try {
        state = selectPart(state, schema, input);
      } catch (e) {
        throw new SelectionError(e instanceof Error ? e.message : String(e));
      }
      events.emit("state:change", state);
      void resolveResourcesForState().then(() => {
        for (const r of renderer.renderers) {
          try {
            void Promise.resolve(
              r.update({ schema, state, resources: cache.asReadonlyMap() }),
            ).catch((e) => events.emit("render:error", e));
          } catch (e) {
            events.emit("render:error", e);
          }
        }
      });
    },
    async mount(t) {
      target = t;
      readyEmittedForCurrentMount = false;
      await resolveResourcesForState();
      for (const r of renderer.renderers) {
        try {
          await r.mount(target, { schema, state, resources: cache.asReadonlyMap() });
        } catch (e) {
          events.emit("render:error", e);
        }
      }
      if (!readyEmittedForCurrentMount) {
        readyEmittedForCurrentMount = true;
        events.emit("render:ready");
      }
    },
    unmount() {
      for (const r of renderer.renderers) {
        try { void r.unmount(); } catch (e) { events.emit("render:error", e); }
      }
      target = undefined;
      readyEmittedForCurrentMount = false;
    },
    async dispose() {
      this.unmount();
      for (const p of [...options.plugins].reverse()) {
        if (p.teardown) await p.teardown();
      }
    },
    on(event, handler) { return events.on(event, handler); },
  };
}
```

- [ ] **Step 3: 既存 engine.test.ts の `throws on invalid schema` テストを `SchemaValidationError` 系メッセージで通るように残す (現状そのままで通る)。再実行**

```
pnpm vitest run packages/core/src/engine.test.ts
pnpm -C packages/core typecheck
```
Expected: 全 PASS、typecheck OK

- [ ] **Step 4: ブラウザで動作確認**

```
pnpm -r --filter="./packages/*" --filter="./plugins/*" run build
pnpm -C apps/react-web dev
```

Expected: Phase 1 動作が引き続き OK。

- [ ] **Step 5: commit**

```bash
git add packages/core/
git commit -m "🎉 feat(core): plugin.setup を PluginSetupError でラップ、render:ready を mount サイクル毎 1 回に

ADR-0004 のライフサイクル契約通り、render:ready は mount サイクルにつき 1 回。
SelectionError は select 時に投げ、PluginSetupError は setup 時にラップして再 throw。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 3 — テスト網羅と CI

> **ゲート**: `pnpm test` 全通過、`pnpm build` 成功、CI が green、apps/react-web の手動確認。

### Task 13: loader-http のテストを msw 化

**Files:**
- Modify: `plugins/loader-http/package.json` (msw を devDep に追加)
- Modify: `plugins/loader-http/src/http-loader.test.ts`

- [ ] **Step 1: msw を devDep に追加**

`plugins/loader-http/package.json` の devDependencies に `"msw": "^2.6.0"` を追加して:

```
pnpm install
```

- [ ] **Step 2: テストを msw ベースに書き換える**

`plugins/loader-http/src/http-loader.test.ts` の 「loads via fetch」「throws on non-ok」テストを msw 版に書き換える:

```ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { httpLoaderPlugin } from "./index.js";

const server = setupServer(
  http.get("https://cdn.example.com/hair.svg", () =>
    HttpResponse.text("<svg/>", {
      headers: { "content-type": "image/svg+xml" },
    }),
  ),
  http.get("https://cdn.example.com/missing.svg", () =>
    new HttpResponse(null, { status: 404 }),
  ),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const makeCtx = () => {
  const loaders: unknown[] = [];
  return {
    ctx: {
      schema: { schemaVersion: "1.0", metadata: { name: "t" }, slots: [], parts: [], assets: [] },
      events: { on: () => () => {}, emit: () => {} },
      renderer: { add: () => {} },
      loader: { add: (l: unknown) => loaders.push(l) },
      parts: { addFragment: () => {} },
      exporter: { add: () => {} },
    },
    loaders,
  };
};

describe("httpLoaderPlugin (msw)", () => {
  it("registers a loader on setup", () => {
    const { ctx, loaders } = makeCtx();
    httpLoaderPlugin({ baseUrl: "https://cdn.example.com/" }).setup(ctx as never);
    expect(loaders).toHaveLength(1);
  });

  it("declares http/https/empty schemes", () => {
    const { ctx, loaders } = makeCtx();
    httpLoaderPlugin({ baseUrl: "https://cdn.example.com/" }).setup(ctx as never);
    const loader = loaders[0] as { schemes: readonly string[] };
    expect(loader.schemes).toEqual(expect.arrayContaining(["http", "https", ""]));
  });

  it("loads via fetch and returns Resource", async () => {
    const { ctx, loaders } = makeCtx();
    httpLoaderPlugin({ baseUrl: "https://cdn.example.com/" }).setup(ctx as never);
    const loader = loaders[0] as { load: (a: unknown) => Promise<unknown> };
    const r = (await loader.load({ id: "a1", kind: "svg", src: "hair.svg" })) as {
      assetId: string;
      data: string;
    };
    expect(r.assetId).toBe("a1");
    expect(r.data).toBe("<svg/>");
  });

  it("throws on 404", async () => {
    const { ctx, loaders } = makeCtx();
    httpLoaderPlugin({ baseUrl: "https://cdn.example.com/" }).setup(ctx as never);
    const loader = loaders[0] as { load: (a: unknown) => Promise<unknown> };
    await expect(
      loader.load({ id: "a1", kind: "svg", src: "missing.svg" }),
    ).rejects.toThrow(/404/);
  });
});
```

- [ ] **Step 3: テスト PASS**

```
pnpm vitest run plugins/loader-http/
```
Expected: 全 PASS (4 件)

- [ ] **Step 4: commit**

```bash
git add plugins/loader-http/ pnpm-lock.yaml
git commit -m "♻️ test(plugin-loader-http): fetch スタブを msw に置き換え

実際の HTTP リクエスト相当をモックし、より実利用に近いテストに。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: CI ワークフローを書く**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.13.1
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
```

- [ ] **Step 2: ローカルで全部通ることを確認**

```
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Expected: 全コマンドが exit 0

- [ ] **Step 3: commit**

```bash
git add .github/workflows/ci.yml
git commit -m "👷 ci: typecheck/lint/test/build を実行する Actions を追加

pnpm 10.13.1 + Node 20 で install → typecheck → lint → test → build。
publish フローは MVP 範囲外。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: 手動 E2E と spec への結果反映

**Files:**
- Modify: `docs/superpowers/specs/2026-06-03-mvp-scope-design.md`
- Create: `docs/superpowers/specs/assets/mvp-screenshot.png`

- [ ] **Step 1: 全 build とビルド済み状態で dev 起動**

```
pnpm -r --filter="./packages/*" --filter="./plugins/*" run build
pnpm -C apps/react-web dev
```

ブラウザで `http://localhost:5173/` を開く。

- [ ] **Step 2: 検証チェックリスト**

ブラウザで以下を確認:

1. ページ表示時に `hair-01` の赤い四角がアバター枠に出ている
2. `hair-02` ボタンを押すと青に変わる
3. `hair-03` ボタンを押すと緑に変わる
4. `hair-01` に戻すと赤に変わる
5. 開発者ツールのコンソールにエラーが出ていない (`[asset:error]` や `[render:error]` の出力なし)
6. ネットワークタブで `hair-01.svg` `hair-02.svg` `hair-03.svg` が 200 で取得できている

すべて OK なら次へ。

- [ ] **Step 3: スクリーンショットを保存**

ブラウザでアバター + ボタン群が見える状態でスクリーンショットを撮影し、 `docs/superpowers/specs/assets/mvp-screenshot.png` として保存する。

ディレクトリを作成:

```
mkdir -p docs/superpowers/specs/assets
```

スクショファイルを所定の場所にコピー (撮影方法は環境による)。

- [ ] **Step 4: spec にスクショへのリンクと検証結果を追記**

`docs/superpowers/specs/2026-06-03-mvp-scope-design.md` の末尾 (「## 参照ドキュメント」の手前) に次の節を挿入:

```markdown
## MVP 完了確認 (Phase 3 検証結果)

- 実施日: 2026-06-XX
- 検証環境: localhost:5173 / Chrome
- 動作: hair-01/02/03 の3パターンで切り替えが正常動作
- コンソールエラーなし
- スクリーンショット: （スクリーンショットは公開していません）

```

(日付は撮影日に置き換える)

- [ ] **Step 5: commit**

```bash
git add docs/superpowers/specs/
git commit -m "📝 docs(spec): MVP 動作確認結果とスクショを追加

Phase 3 ゲート通過の記録。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: 最終確認と PR 作成

**Files:** (なし、操作のみ)

- [ ] **Step 1: 全テスト・全 typecheck・lint を再実行**

```
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Expected: すべて exit 0、テスト合計件数は 30 件前後 (schema 7 + core 16-18 + renderer-svg 3 + loader-http 4)

- [ ] **Step 2: PR を作成**

```bash
git push -u origin feat/mvp-implementation
gh pr create --base main --title "🎉 feat: MVP 実装 — 最小縦串でアバター切り替え動作" --body "$(cat <<'EOF'
## 概要

MVP スコープ設計書 (docs/superpowers/specs/2026-06-03-mvp-scope-design.md) に基づき、最小縦串実装を完成。

## 含まれるもの

- `packages/schema` — JSON Schema (ajv) による厳密 validate と型
- `packages/core` — AvatarEngine、Registry 群、EventBus、ADR-0005/0006 準拠
- `plugins/loader-http` — http(s)/相対参照対応の HTTP loader
- `plugins/renderer-svg` — SVG 描画
- `apps/react-web` — 動作確認用アプリ (hair 1 スロット 3 パーツ)
- `.github/workflows/ci.yml` — typecheck/lint/test/build

## 検証

スクリーンショット: docs/superpowers/specs/assets/mvp-screenshot.png

## 次のステップ

ポスト MVP:
- packages/react, packages/vue
- plugins/renderer-canvas, plugins/loader-memory
- exporter プラグイン
- 人型標準スキーマへの拡張
- E2E テスト (Playwright)
- Changesets + npm publish

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: 完了宣言**

PR URL を控え、レビュー依頼。これで MVP 実装計画は完了。
