import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import type { Connect, Plugin } from "vite";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// /api/perceive (OpenAI) と /api/perceive/gemini (Gemini) を proxy する
// dev server middleware。 .env.local 等の API キーを server side でヘッダーに
// 足し、 クライアントにはキーを露出させない。 production build (vite build)
// では middleware は含まれないので、 別途 backend が必要 (現状は dev 専用)。
//
// 注意: Vite は VITE_ prefix 無しの env を自動では process.env に展開しない。
// `loadEnv(mode, root, "")` で prefix なし全件を明示的に読み込む必要がある。
function perceiveProxyPlugin(): Plugin {
  let openaiKey: string | undefined;
  let geminiKey: string | undefined;
  let geminiModel = "gemini-2.5-flash-lite";
  return {
    name: "perceive-proxy",
    config(_config, { mode }) {
      // apps/react-web/.env* および process.env の両方からキーを取得
      const env = loadEnv(mode, process.cwd(), "");
      openaiKey = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      geminiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
      geminiModel =
        env.GEMINI_MODEL || process.env.GEMINI_MODEL || geminiModel;
    },
    configureServer(server) {
      const handler: Connect.NextHandleFunction = async (req, res, next) => {
        if (req.method !== "POST") return next();

        // use("/api/perceive") は prefix を strip するため、
        // req.url は "/" (OpenAI) または "/gemini" (Gemini) になる
        const isGemini = req.url === "/gemini";
        const apiKey = isGemini ? geminiKey : openaiKey;
        const keyName = isGemini ? "GEMINI_API_KEY" : "OPENAI_API_KEY";

        if (!apiKey) {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              error: {
                message: `${keyName} が dev server の env に設定されていません`,
              },
            }),
          );
          return;
        }

        try {
          // request body を読み出す
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(chunk as Buffer);
          }
          const body = Buffer.concat(chunks).toString("utf8");

          const upstream = await fetch(
            isGemini
              ? `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`
              : "https://api.openai.com/v1/chat/completions",
            {
              method: "POST",
              headers: isGemini
                ? {
                    "content-type": "application/json",
                    "x-goog-api-key": apiKey,
                  }
                : {
                    "content-type": "application/json",
                    authorization: `Bearer ${apiKey}`,
                  },
              body,
            },
          );

          res.statusCode = upstream.status;
          res.setHeader(
            "content-type",
            upstream.headers.get("content-type") ?? "application/json",
          );
          res.end(await upstream.text());
        } catch (e) {
          console.error("[perceive-proxy] forward failed:", e);
          res.statusCode = 502;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              error: { message: "perceive proxy forward failed" },
            }),
          );
        }
      };

      server.middlewares.use("/api/perceive", handler);
    },
  };
}

// Vite の既定（5173 / 4173）は他のプロジェクトとぶつかりやすいので、このアプリ専用の番号を使う。
// strictPort: 使われていたら別の番号に逃げず、起動を失敗させる（開く URL がずれないように）
export default defineConfig({
  plugins: [react(), perceiveProxyPlugin()],
  server: { port: 5480, strictPort: true },
  preview: { port: 5481, strictPort: true },
  resolve: {
    alias: {
      "@edv4h/alter-ego-core": r("../../packages/core/src/index.ts"),
      "@edv4h/alter-ego-perceive": r("../../packages/perceive/src/index.ts"),
      "@edv4h/alter-ego-plugin-loader-http": r("../../plugins/loader-http/src/index.ts"),
      "@edv4h/alter-ego-plugin-renderer-svg": r("../../plugins/renderer-svg/src/index.ts"),
      "@edv4h/alter-ego-react": r("../../packages/react/src/index.ts"),
      "@edv4h/alter-ego-schema": r("../../packages/schema/src/index.ts"),
    },
  },
});
