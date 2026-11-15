import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import { createGeminiPerceiver } from "./gemini.js";
import { PerceiveError } from "./errors.js";

// resize を stub: happy-dom で Image.onload が発火しない問題を回避する
// (openai.test.ts と同じ理由・同じ stub)
vi.mock("./resize.js", () => ({
  resizeImageBlob: async (b: Blob) => b,
  blobToDataUrl: async (b: Blob) =>
    `data:${b.type};base64,${btoa("stub")}`,
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

// Gemini generateContent 形式の成功レスポンス
const mockOkResponse = (json: unknown): Response =>
  new Response(
    JSON.stringify({
      candidates: [
        { content: { parts: [{ text: JSON.stringify(json) }] } },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

describe("createGeminiPerceiver", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("成功時に AvatarSeed を返す", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockOkResponse({ selections: { face: { partId: "face-01" } } }),
    );
    const perceiver = createGeminiPerceiver({ apiKey: "g-test", schema });
    const seed = await perceiver.perceive(dummyBlob());
    expect(seed.selections).toEqual({ face: { partId: "face-01" } });
  });

  it("既定モデル gemini-2.5-flash-lite が URL に入る", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockOkResponse({ selections: { face: { partId: "face-01" } } }),
    );
    const perceiver = createGeminiPerceiver({ apiKey: "g", schema });
    await perceiver.perceive(dummyBlob());
    const url = String(fetchSpy.mock.calls[0]![0]);
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent",
    );
  });

  it("opts.model で URL のモデルを override 可能", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockOkResponse({ selections: { face: { partId: "face-01" } } }),
    );
    const perceiver = createGeminiPerceiver({
      apiKey: "g",
      schema,
      model: "gemini-3.5-flash",
    });
    await perceiver.perceive(dummyBlob());
    const url = String(fetchSpy.mock.calls[0]![0]);
    expect(url).toContain("/models/gemini-3.5-flash:generateContent");
  });

  it("endpoint 指定時はその URL にそのまま POST する (proxy モード)", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockOkResponse({ selections: { face: { partId: "face-01" } } }),
    );
    const perceiver = createGeminiPerceiver({
      schema,
      endpoint: "/api/perceive/gemini",
    });
    await perceiver.perceive(dummyBlob());
    expect(String(fetchSpy.mock.calls[0]![0])).toBe("/api/perceive/gemini");
  });

  it("apiKey 指定時は x-goog-api-key ヘッダーを付ける", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockOkResponse({ selections: { face: { partId: "face-01" } } }),
    );
    const perceiver = createGeminiPerceiver({ apiKey: "g-key", schema });
    await perceiver.perceive(dummyBlob());
    const headers = fetchSpy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe("g-key");
  });

  it("apiKey 未指定のとき x-goog-api-key ヘッダーを付けない (proxy モード)", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockOkResponse({ selections: { face: { partId: "face-01" } } }),
    );
    const perceiver = createGeminiPerceiver({
      schema,
      endpoint: "/api/perceive/gemini",
    });
    await perceiver.perceive(dummyBlob());
    const headers = fetchSpy.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBeUndefined();
    expect(headers["content-type"]).toBe("application/json");
  });

  it("リクエスト body が Gemini generateContent 形式になっている", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockOkResponse({ selections: { face: { partId: "face-01" } } }),
    );
    const perceiver = createGeminiPerceiver({ apiKey: "g", schema });
    await perceiver.perceive(dummyBlob());
    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string);
    expect(body.systemInstruction.parts[0].text).toContain("アバター生成アシスタント");
    expect(body.contents[0].parts[0].text).toContain("face-01");
    expect(body.contents[0].parts[1].inline_data.mime_type).toBe("image/jpeg");
    expect(body.contents[0].parts[1].inline_data.data).toBe(btoa("stub"));
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });

  it("401 で auth エラーを投げる", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("unauth", { status: 401 }));
    const perceiver = createGeminiPerceiver({ apiKey: "bad", schema });
    await expect(perceiver.perceive(dummyBlob())).rejects.toMatchObject({
      kind: "auth",
    });
  });

  it("403 でも auth エラーを投げる (Gemini は無効キーで 403 を返すことがある)", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("forbidden", { status: 403 }));
    const perceiver = createGeminiPerceiver({ apiKey: "bad", schema });
    await expect(perceiver.perceive(dummyBlob())).rejects.toMatchObject({
      kind: "auth",
    });
  });

  it("500 系で network エラーを投げる", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("oops", { status: 500 }));
    const perceiver = createGeminiPerceiver({ apiKey: "g", schema });
    await expect(perceiver.perceive(dummyBlob())).rejects.toMatchObject({
      kind: "network",
    });
  });

  it("candidates の text が JSON でないと parse エラー", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "not json" }] } }],
        }),
        { status: 200 },
      ),
    );
    const perceiver = createGeminiPerceiver({ apiKey: "g", schema });
    await expect(perceiver.perceive(dummyBlob())).rejects.toMatchObject({
      kind: "parse",
    });
  });

  it("空 seed (schema に無い partId だけ) なら validate エラー", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockOkResponse({ selections: { face: { partId: "face-99" } } }),
    );
    const perceiver = createGeminiPerceiver({ apiKey: "g", schema });
    await expect(perceiver.perceive(dummyBlob())).rejects.toMatchObject({
      kind: "validate",
    });
  });

  it("AbortSignal を fetch に渡し、 abort 時は cancelled エラー", async () => {
    const controller = new AbortController();
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
    const perceiver = createGeminiPerceiver({ apiKey: "g", schema });
    controller.abort();
    const p = perceiver.perceive(dummyBlob(), { signal: controller.signal });
    await expect(p).rejects.toBeInstanceOf(PerceiveError);
    await expect(p).rejects.toMatchObject({ kind: "cancelled" });
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
    const perceiver = createGeminiPerceiver({ apiKey: "g", schema });
    const seed = await perceiver.perceive(dummyBlob());
    expect(seed.selections!.eye_right).toEqual({ partId: "eye-right-01" });
  });
});
