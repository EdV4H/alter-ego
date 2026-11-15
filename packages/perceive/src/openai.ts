import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import { PerceiveError } from "./errors.js";
import type { Perceiver, PerceiveOptions } from "./perceiver.js";
import { blobToDataUrl, resizeImageBlob } from "./resize.js";
import type { AvatarSeed } from "./types.js";
import { validateSeed } from "./validate.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";
import { normalizePairSelections } from "./normalize.js";

const DEFAULT_MODEL = "gpt-5.4-mini";
const DEFAULT_ENDPOINT = "https://api.openai.com/v1/chat/completions";

export interface OpenAIPerceiverOptions {
  /** 省略時は Authorization ヘッダーを送らない (proxy モード、 server side でヘッダー付与する想定) */
  apiKey?: string;
  /** perceiver が認識する slot/partId の根拠 */
  schema: AvatarSchema;
  /** 既定 "gpt-5.4-mini" */
  model?: string;
  /** 既定 OpenAI 標準エンドポイント */
  endpoint?: string;
}

export function createOpenAIPerceiver(
  opts: OpenAIPerceiverOptions,
): Perceiver {
  const { apiKey, schema } = opts;
  const model = opts.model ?? DEFAULT_MODEL;
  const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;

  return {
    async perceive(file: Blob, options?: PerceiveOptions): Promise<AvatarSeed> {
      try {
        const resized = await resizeImageBlob(file);
        const dataUrl = await blobToDataUrl(resized);
        const userText = buildUserPrompt(schema);

        const body = {
          model,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "text", text: userText },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            },
          ],
        };

        const headers: Record<string, string> = {
          "content-type": "application/json",
        };
        if (apiKey) {
          headers.authorization = `Bearer ${apiKey}`;
        }

        const res = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: options?.signal,
        });

        if (res.status === 401) {
          throw new PerceiveError("auth", "OpenAI returned 401", { status: 401 });
        }
        if (!res.ok) {
          throw new PerceiveError(
            "network",
            `OpenAI returned ${res.status}`,
            { status: res.status },
          );
        }

        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = json.choices?.[0]?.message?.content;
        if (!content) {
          throw new PerceiveError("parse", "OpenAI response missing content");
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

