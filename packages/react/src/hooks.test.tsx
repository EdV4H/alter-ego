import { StrictMode, act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AvatarEngine, Plugin } from "@edv4h/alter-ego-core";
import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import { useAvatarEngine, useAvatarState, type UseAvatarEngineResult } from "./index.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const makeSchema = (name: string): AvatarSchema => ({
  schemaVersion: "1.1",
  metadata: { name },
  slots: [{ id: "hat", name: "帽子", zIndex: 0 }],
  parts: [{ id: "cap", slotId: "hat", name: "キャップ", assetId: "a" }],
  assets: [{ id: "a", kind: "svg", src: "a.svg" }],
});

/** mount された描画先と、作られたエンジンの数・破棄された数を記録するプラグイン */
function recorder() {
  const log = { targets: [] as unknown[], setups: 0, teardowns: 0 };
  const createPlugins = (): Plugin[] => [
    {
      id: "test-renderer",
      name: "test",
      version: "0.0.0",
      setup(ctx) {
        log.setups += 1;
        ctx.renderer.add({
          mount: (target) => {
            log.targets.push(target);
          },
          update: () => {},
          unmount: () => {},
        });
      },
      teardown() {
        log.teardowns += 1;
      },
    },
  ];
  return { log, createPlugins };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

/** 非同期の mount と effect が落ち着くまで待つ */
const settle = () => act(async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
});

interface Captured {
  result: UseAvatarEngineResult<HTMLDivElement> | null;
  selections: Record<string, unknown>;
}

function Harness(props: {
  schema: AvatarSchema;
  createPlugins: () => Plugin[];
  captured: Captured;
  onReady?: (engine: AvatarEngine) => void;
}) {
  const result = useAvatarEngine<HTMLDivElement>({
    schema: props.schema,
    createPlugins: props.createPlugins,
    ...(props.onReady ? { onReady: props.onReady } : {}),
  });
  const state = useAvatarState(result.engine);
  props.captured.result = result;
  props.captured.selections = state.selections;
  return <div ref={result.mountRef} data-testid="target" />;
}

const render = (node: ReactNode) => act(async () => root.render(node));

describe("useAvatarEngine / useAvatarState", () => {
  it("描画先に mount し、状態の変化を読める", async () => {
    const { log, createPlugins } = recorder();
    const captured: Captured = { result: null, selections: {} };
    await render(<Harness schema={makeSchema("a")} createPlugins={createPlugins} captured={captured} />);
    await settle();

    const engine = captured.result?.engine;
    expect(engine).not.toBeNull();
    expect(log.targets).toEqual([container.querySelector("[data-testid=target]")]);
    expect(captured.selections).toEqual({});

    await act(async () => engine?.select({ slot: "hat", part: "cap" }));
    expect(captured.selections).toEqual({ hat: { partId: "cap" } });
  });

  it("StrictMode の 2 回実行でも、残るエンジンは 1 つ", async () => {
    const { log, createPlugins } = recorder();
    const captured: Captured = { result: null, selections: {} };
    let ready = 0;
    await render(
      <StrictMode>
        <Harness schema={makeSchema("a")} createPlugins={createPlugins} captured={captured} onReady={() => void ready++} />
      </StrictMode>,
    );
    await settle();
    expect(captured.result?.engine).not.toBeNull();
    expect(log.setups - log.teardowns).toBe(1);
    expect(ready).toBe(1);
  });

  it("schema が変わったらエンジンを作り直し、古いエンジンは破棄する", async () => {
    const { log, createPlugins } = recorder();
    const captured: Captured = { result: null, selections: {} };
    await render(<Harness schema={makeSchema("a")} createPlugins={createPlugins} captured={captured} />);
    await settle();
    const first = captured.result?.engine;

    await render(<Harness schema={makeSchema("b")} createPlugins={createPlugins} captured={captured} />);
    await settle();
    expect(captured.result?.engine).not.toBe(first);
    expect(captured.result?.engine?.schema.metadata.name).toBe("b");
    expect(log.teardowns).toBe(1);
  });

  it("エンジンを作れなければ error に Error が入る", async () => {
    const { createPlugins } = recorder();
    const captured: Captured = { result: null, selections: {} };
    const broken = { ...makeSchema("a"), slots: "nope" } as unknown as AvatarSchema;
    await render(<Harness schema={broken} createPlugins={createPlugins} captured={captured} />);
    await settle();
    expect(captured.result?.engine).toBeNull();
    expect(captured.result?.error).toBeInstanceOf(Error);
  });
});
