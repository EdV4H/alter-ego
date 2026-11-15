import type { Loader, Plugin, PluginContext, Resource } from "@edv4h/alter-ego-core";
import type { Asset } from "@edv4h/alter-ego-schema";

const ABSOLUTE_HTTP_RE = /^https?:\/\//i;

/** httpLoaderPlugin の設定オプション */
export interface HttpLoaderOptions {
  /** 相対パスのアセットを解決する際のベース URL */
  baseUrl: string;
}

/**
 * HTTP(S) および相対パスのアセットを fetch で読み込む Loader プラグイン。
 *
 * - `http://` / `https://` で始まる src はそのまま fetch する
 * - スキームを持たない相対パスは baseUrl を基点に解決する
 * - 担当スキーム: ["http", "https", ""]
 */
export function httpLoaderPlugin(options: HttpLoaderOptions): Plugin {
  const loader: Loader = {
    schemes: ["http", "https", ""],
    async load(asset: Asset): Promise<Resource> {
      // 絶対 URL はそのまま使い、相対パスは baseUrl で解決する
      const url = ABSOLUTE_HTTP_RE.test(asset.src)
        ? asset.src
        : new URL(asset.src, options.baseUrl).toString();

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} fetching ${url}`);
      }

      const mime = res.headers.get("content-type") ?? undefined;
      // svg / text は文字列として扱い、それ以外は Blob として返す
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
