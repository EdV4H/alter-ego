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
