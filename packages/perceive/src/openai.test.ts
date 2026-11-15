import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import { createOpenAIPerceiver } from "./openai.js";
import { PerceiveError } from "./errors.js";

// resize を stub: happy-dom で Image.onload が発火しない問題を回避し、
// テスト実行時間も短縮する (元 Blob をそのまま返す)。
vi.mock("./resize.js", () => ({
  resizeImageBlob: async (b: Blob) => b,
  blobToDataUrl: async (b: Blob) =>
    `data:${b.type};base64,${btoa("stub")}`,
  // calcTargetSize は openai では未使用だが、 import 元の export 表面と
  // 一致させるため stub に含める
  calcTargetSize: (w: number, h: number) => ({ width: w, height: h }),
}));

const schema: AvatarSchema = {
  schemaVersion: "1.0",
  metadata: { name: "t" },
  slots: [
    { id: "face", name: "顔", zIndex: 10, required: true },
    { id: "hair_front", name: "髪 (前)", zIndex: 45 },
    { id: "eye_left", name: "目 (左)", zIndex: 30, required: true },
    { id: "eye_right", name: "目 (右)", zIndex: 30, required: true },
  ],
  parts: [
    { id: "face-01", slotId: "face", name: "F1", assetId: "a-face-01" },
    { id: "hair-front-01", slotId: "hair_front", name: "H1", assetId: "a-hf-01" },
    { id: "eye-left-01", slotId: "eye_left", name: "EL1", assetId: "a-face-01", pairKey: "01" },
    { id: "eye-left-02", slotId: "eye_left", name: "EL2", assetId: "a-face-01", pairKey: "02" },
    { id: "eye-right-01", slotId: "eye_right", name: "ER1", assetId: "a-face-01", pairKey: "01" },
    { id: "eye-right-02", slotId: "eye_right", name: "ER2", assetId: "a-face-01", pairKey: "02" },
  ],
  assets: [
    { id: "a-face-01", kind: "svg", src: "face-01.svg" },
    { id: "a-hf-01", kind: "svg", src: "hair-front-01.svg" },
  ],
  groups: [{ id: "eye", name: "目", slots: ["eye_left", "eye_right"] }],
};

const dummyBlob = () => new Blob(["x"], { type: "image/jpeg" });

const mockOkResponse = (json: unknown): Response =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(json) } }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

describe("createOpenAIPerceiver", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("成功時に AvatarSeed を返す", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockOkResponse({
        selections: { face: { partId: "face-01" } },
      }),
    );
    const perceiver = createOpenAIPerceiver({ apiKey: "sk-test", schema });
    const seed = await perceiver.perceive(dummyBlob());
    expect(seed.selections).toEqual({ face: { partId: "face-01" } });
  });

  it("401 で auth エラーを投げる", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("unauth", { status: 401 }));
    const perceiver = createOpenAIPerceiver({ apiKey: "bad", schema });
    await expect(perceiver.perceive(dummyBlob())).rejects.toMatchObject({
      kind: "auth",
    });
  });

  it("500 系で network エラーを投げる", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("oops", { status: 500 }));
    const perceiver = createOpenAIPerceiver({ apiKey: "sk", schema });
    await expect(perceiver.perceive(dummyBlob())).rejects.toMatchObject({
      kind: "network",
    });
  });

  it("レスポンス content が JSON でないと parse エラー", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "not json" } }] }),
        { status: 200 },
      ),
    );
    const perceiver = createOpenAIPerceiver({ apiKey: "sk", schema });
    await expect(perceiver.perceive(dummyBlob())).rejects.toMatchObject({
      kind: "parse",
    });
  });

  it("空 seed (schema に無い partId だけ) なら validate エラー", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockOkResponse({ selections: { face: { partId: "face-99" } } }),
    );
    const perceiver = createOpenAIPerceiver({ apiKey: "sk", schema });
    await expect(perceiver.perceive(dummyBlob())).rejects.toMatchObject({
      kind: "validate",
    });
  });

  it("AbortSignal を fetch に渡し、 abort 時は cancelled エラー", async () => {
    const controller = new AbortController();
    // happy-dom で addEventListener が発火しない環境でも動作するよう、
    // mock 内でポーリングせず reject を直接呼ぶ形にする
    fetchSpy.mockImplementationOnce(
      (_url, init) =>
        new Promise((_, reject) => {
          const signal = init?.signal as AbortSignal;
          if (signal.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
          }
          signal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    const perceiver = createOpenAIPerceiver({ apiKey: "sk", schema });
    // perceive を呼ぶ前に abort しておくことで、
    // fetch に渡った signal.aborted === true の状態で mock が即座に reject する
    controller.abort();
    const p = perceiver.perceive(dummyBlob(), { signal: controller.signal });
    await expect(p).rejects.toBeInstanceOf(PerceiveError);
    await expect(p).rejects.toMatchObject({ kind: "cancelled" });
  });

  it("既定モデルは gpt-5.4-mini", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockOkResponse({ selections: { face: { partId: "face-01" } } }),
    );
    const perceiver = createOpenAIPerceiver({ apiKey: "sk", schema });
    await perceiver.perceive(dummyBlob());
    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body.model).toBe("gpt-5.4-mini");
  });

  it("opts.model で override 可能", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockOkResponse({ selections: { face: { partId: "face-01" } } }),
    );
    const perceiver = createOpenAIPerceiver({
      apiKey: "sk",
      schema,
      model: "gpt-5",
    });
    await perceiver.perceive(dummyBlob());
    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body.model).toBe("gpt-5");
  });

  it("apiKey が未指定のとき Authorization ヘッダーを付けない (proxy モード)", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockOkResponse({ selections: { face: { partId: "face-01" } } }),
    );
    const perceiver = createOpenAIPerceiver({
      schema,
      endpoint: "/api/perceive",
    });
    await perceiver.perceive(dummyBlob());
    const init = fetchSpy.mock.calls[0]![1]!;
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBeUndefined();
    expect(headers["content-type"]).toBe("application/json");
  });

  it("左右の目の番号不一致は正規化されて左に揃う", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockOkResponse({
        selections: {
          eye_left: { partId: "eye-left-01" },
          eye_right: { partId: "eye-right-02" },
        },
      }),
    );
    const perceiver = createOpenAIPerceiver({ apiKey: "sk", schema });
    const seed = await perceiver.perceive(dummyBlob());
    expect(seed.selections!.eye_right).toEqual({ partId: "eye-right-01" });
  });
});
