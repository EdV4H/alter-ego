import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import { PerceiveError } from "./errors.js";
import type { Perceiver, PerceiveOptions } from "./perceiver.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";
import { blobToDataUrl, resizeImageBlob } from "./resize.js";
import type { AvatarSeed } from "./types.js";
import { validateSeed } from "./validate.js";
import { normalizePairSelections } from "./normalize.js";

const DEFAULT_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_ENDPOINT_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

export interface GeminiPerceiverOptions {
  /** 省略時は x-goog-api-key ヘッダーを送らない (proxy モード、 server side でキー付与する想定) */
  apiKey?: string;
  /** perceiver が認識する slot/partId の根拠 */
  schema: AvatarSchema;
  /** 既定 "gemini-2.5-flash-lite"。 endpoint 指定時は無視される (モデルは proxy 側の責務) */
  model?: string;
  /** 指定時はこの URL にそのまま POST する (proxy モード用フック) */
  endpoint?: string;
}

export function createGeminiPerceiver(
  opts: GeminiPerceiverOptions,
): Perceiver {
  const { apiKey, schema } = opts;
  const model = opts.model ?? DEFAULT_MODEL;
  // Gemini はモデル名が URL パスに入るため、 endpoint 指定時はモデル選択を
  // 呼び出し先 (proxy) に委ねる
  const endpoint =
    opts.endpoint ?? `${DEFAULT_ENDPOINT_BASE}/${model}:generateContent`;

  return {
    async perceive(file: Blob, options?: PerceiveOptions): Promise<AvatarSeed> {
      try {
        const resized = await resizeImageBlob(file);
        const dataUrl = await blobToDataUrl(resized);
        const { mimeType, base64 } = splitDataUrl(dataUrl);

        const body = {
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [
            {
              role: "user",
              parts: [
                { text: buildUserPrompt(schema) },
                { inline_data: { mime_type: mimeType, data: base64 } },
              ],
            },
          ],
          generationConfig: { responseMimeType: "application/json" },
        };

        const headers: Record<string, string> = {
          "content-type": "application/json",
        };
        if (apiKey) {
          headers["x-goog-api-key"] = apiKey;
        }

        const res = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: options?.signal,
        });

        // Gemini は無効キーで 400/403 を返すことがあるが、 400 は
        // リクエスト不正と区別できないため auth 扱いは 401/403 のみとする
        if (res.status === 401 || res.status === 403) {
          throw new PerceiveError("auth", `Gemini returned ${res.status}`, {
            status: res.status,
          });
        }
        if (!res.ok) {
          throw new PerceiveError(
            "network",
            `Gemini returned ${res.status}`,
            { status: res.status },
          );
        }

        const json = (await res.json()) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
          }>;
        };
        const content = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!content) {
          throw new PerceiveError("parse", "Gemini response missing content");
        }

        let raw: unknown;
        try {
          raw = JSON.parse(content);
        } catch (e) {
          throw new PerceiveError("parse", "content is not JSON", e);
        }

        const seed = normalizePairSelections(validateSeed(raw, schema), schema);
        if (
          !seed.selections &&
          !seed.slotTransforms &&
          !seed.salientFeatures
        ) {
          throw new PerceiveError(
            "validate",
            "seed is empty after validation",
          );
        }
        return seed;
      } catch (e) {
        if (e instanceof PerceiveError) throw e;
        if (e instanceof DOMException && e.name === "AbortError") {
          throw new PerceiveError("cancelled", "request aborted", e);
        }
        if (e instanceof Error && /abort/i.test(e.message)) {
          throw new PerceiveError("cancelled", "request aborted", e);
        }
        throw new PerceiveError(
          "network",
          e instanceof Error ? e.message : String(e),
          e,
        );
      }
    },
  };
}

/** data URL から MIME type と base64 部分を取り出す (inline_data 形式用) */
function splitDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!m) {
    throw new PerceiveError("parse", "unexpected data URL format");
  }
  return { mimeType: m[1]!, base64: m[2]! };
}
