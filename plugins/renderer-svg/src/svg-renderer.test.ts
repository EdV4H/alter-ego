import { describe, expect, it } from "vitest";
import { applyColorReplaceMap, applyResolvedColors, svgRendererPlugin } from "./index.js";
import type { Renderer, RendererContext } from "@edv4h/alter-ego-core";
import type { AvatarSchema } from "@edv4h/alter-ego-schema";

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

// テスト用スキーマ。as const で定義し、型注釈でキャストする
const schema: AvatarSchema = {
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
};

describe("svgRendererPlugin", () => {
  it("registers a renderer on setup", async () => {
    const { ctx, renderers } = setupCtx();
    await svgRendererPlugin().setup(ctx as never);
    expect(renderers).toHaveLength(1);
  });

  it("mount inserts <image> elements ordered by zIndex", async () => {
    const { ctx, renderers } = setupCtx();
    await svgRendererPlugin().setup(ctx as never);
    const renderer = renderers[0]!;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    document.body.appendChild(svg);

    const resources = new Map([
      ["a-base-01", { assetId: "a-base-01", kind: "svg", data: "<svg/>", mime: "image/svg+xml" }],
      ["a-hair-01", { assetId: "a-hair-01", kind: "svg", data: "<svg/>", mime: "image/svg+xml" }],
    ]);
    const rctx: RendererContext = {
      schema,
      state: { transforms: {}, selections: { base: { partId: "base-01" }, hair: { partId: "hair-01" } } },
      resources,
      colors: {},
      placements: {},
    };
    await renderer.mount(svg, rctx);

    const images = svg.querySelectorAll("image");
    expect(images).toHaveLength(2);
    expect(images[0]!.getAttribute("data-slot")).toBe("base");
    expect(images[1]!.getAttribute("data-slot")).toBe("hair");
  });

  it("does not cascade replacements when one entry's target equals another entry's from", () => {
    // skin (#50C7FF) → base.color = #FCD0D0 となるとき、
    // 次の entry の from (#FCD0D0) に巻き込まれて hair.color に再置換されないこと。
    const svgData = '<svg><path fill="#50C7FF"/><path fill="#FCD0D0"/></svg>';
    const entries = [
      { from: "#50C7FF", fromSlot: "base" },
      { from: "#FCD0D0", fromSlot: "self" },
    ];
    const out = applyColorReplaceMap(svgData, entries, "hair", {
      base: { color: "#FCD0D0" },
      hair: { color: "#112233" },
    });
    // 元の skin 領域は base.color (#FCD0D0) のまま、 元の hair 領域だけ #112233 に。
    expect(out).toBe('<svg><path fill="#FCD0D0"/><path fill="#112233"/></svg>');
  });

  it("leaves the from color untouched when fromSlot has no selection", () => {
    const svgData = '<svg><path fill="#50C7FF"/><path fill="#FCD0D0"/></svg>';
    const entries = [
      { from: "#50C7FF", fromSlot: "base" },     // base.color が無い → skip
      { from: "#FCD0D0", fromSlot: "self" },     // hair.color はある → 置換
    ];
    const out = applyColorReplaceMap(svgData, entries, "hair", {
      hair: { color: "#112233" },
      // base に selection なし
    });
    // base に selection がないので skin はそのまま、 hair は #112233 に。
    expect(out).toContain('#50C7FF');
    expect(out).toContain('#112233');
    expect(out).not.toContain('#FCD0D0');
  });

  it("slotPlacements accepts a resolver function and re-evaluates on update", async () => {
    let currentX = 10;
    const { ctx, renderers } = setupCtx();
    await svgRendererPlugin({
      slotPlacements: () => ({ hair: { x: currentX, y: 0, width: 100, height: 100 } }),
    }).setup(ctx as never);
    const renderer = renderers[0]!;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    document.body.appendChild(svg);

    const resources = new Map([
      ["a-hair-01", { assetId: "a-hair-01", kind: "svg", data: "<svg/>", mime: "image/svg+xml" }],
    ]);
    await renderer.mount(svg, {
      schema,
      state: { transforms: {}, selections: { hair: { partId: "hair-01" } } },
      resources,
      colors: {},
      placements: {},
    });

    const img = svg.querySelector('image[data-slot="hair"]') as SVGImageElement;
    expect(img.getAttribute("x")).toBe("10");

    // 外部 state を変えて update を呼ぶと、 resolver が再評価される
    currentX = 50;
    await renderer.update({
      schema,
      state: { transforms: {}, selections: { hair: { partId: "hair-01" } } },
      resources,
      colors: {},
      placements: {},
    });
    expect(img.getAttribute("x")).toBe("50");
  });

  it("slotPlacement rotation sets transform attribute around center", async () => {
    const { ctx, renderers } = setupCtx();
    await svgRendererPlugin({
      slotPlacements: { hair: { x: 100, y: 50, width: 80, height: 80, rotation: 30 } },
    }).setup(ctx as never);
    const renderer = renderers[0]!;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    document.body.appendChild(svg);

    const resources = new Map([
      ["a-hair-01", { assetId: "a-hair-01", kind: "svg", data: "<svg/>", mime: "image/svg+xml" }],
    ]);
    await renderer.mount(svg, {
      schema,
      state: { transforms: {}, selections: { hair: { partId: "hair-01" } } },
      resources,
      colors: {},
      placements: {},
    });

    const img = svg.querySelector('image[data-slot="hair"]') as SVGImageElement;
    // center = (100+40, 50+40) = (140, 90)
    expect(img.getAttribute("transform")).toBe("rotate(30 140 90)");
  });

  it("slotPlacements override default x/y/width/height/preserveAspectRatio", async () => {
    const { ctx, renderers } = setupCtx();
    await svgRendererPlugin({
      slotPlacements: {
        hair: { x: 56, y: 120, width: 288, height: 288, preserveAspectRatio: "xMidYMid slice" },
      },
    }).setup(ctx as never);
    const renderer = renderers[0]!;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    document.body.appendChild(svg);

    const resources = new Map([
      ["a-hair-01", { assetId: "a-hair-01", kind: "svg", data: "<svg/>", mime: "image/svg+xml" }],
    ]);
    await renderer.mount(svg, {
      schema,
      state: { transforms: {}, selections: { hair: { partId: "hair-01" } } },
      resources,
      colors: {},
      placements: {},
    });

    const img = svg.querySelector('image[data-slot="hair"]') as SVGImageElement;
    expect(img.getAttribute("x")).toBe("56");
    expect(img.getAttribute("y")).toBe("120");
    expect(img.getAttribute("width")).toBe("288");
    expect(img.getAttribute("height")).toBe("288");
    expect(img.getAttribute("preserveAspectRatio")).toBe("xMidYMid slice");
  });

  it("colorReplaceMap entries apply both self and cross-slot color references", async () => {
    const { ctx, renderers } = setupCtx();
    await svgRendererPlugin({
      colorReplaceMap: {
        hair: [
          // hair の skin 部分は face.color で置換
          { from: "#50C7FF", fromSlot: "base" },
          // hair の hair 部分は自スロットの color で置換
          { from: "#FCD0D0", fromSlot: "self" },
        ],
      },
    }).setup(ctx as never);
    const renderer = renderers[0]!;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    document.body.appendChild(svg);

    const resources = new Map([
      [
        "a-hair-01",
        {
          assetId: "a-hair-01",
          kind: "svg",
          data: '<svg><path fill="#50C7FF"/><path fill="#FCD0D0"/></svg>',
          mime: "image/svg+xml",
        },
      ],
    ]);
    await renderer.mount(svg, {
      schema,
      state: { transforms: {},
        selections: {
          base: { partId: "base-01", color: "#aabbcc" },
          hair: { partId: "hair-01", color: "#112233" },
        },
      },
      resources,
      colors: {},
      placements: {},
    });

    const hairImg = svg.querySelector('image[data-slot="hair"]') as SVGImageElement;
    const href = hairImg.getAttribute("href") ?? "";
    const decoded = decodeURIComponent(href.replace(/^data:image\/svg\+xml;utf8,/, ""));
    // skin → base.color = #aabbcc, hair → self.color = #112233
    expect(decoded).toContain("#aabbcc");
    expect(decoded).toContain("#112233");
    expect(decoded).not.toContain("#50C7FF");
    expect(decoded).not.toContain("#FCD0D0");
  });

  it("applies ctx.colors resolved by core (ADR-0008)", async () => {
    const { ctx, renderers } = setupCtx();
    await svgRendererPlugin().setup(ctx as never);
    const renderer = renderers[0]!;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    document.body.appendChild(svg);

    await renderer.mount(svg, {
      schema,
      state: { transforms: {}, selections: { hair: { partId: "hair-01" } } },
      resources: new Map([
        ["a-hair-01", { assetId: "a-hair-01", kind: "svg", data: '<path fill="#50C7FF"/><path fill="#FCD0D0"/>' }],
      ]),
      colors: { hair: [{ target: "#50c7ff", color: "#FCD0D0" }, { target: "#FCD0D0", color: "#112233" }] },
      placements: {},
    });

    const href = svg.querySelector('image[data-slot="hair"]')!.getAttribute("href") ?? "";
    const decoded = decodeURIComponent(href.replace(/^data:image\/svg\+xml;utf8,/, ""));
    // single-pass なので 1 つ目の置換結果が 2 つ目に巻き込まれない
    expect(decoded).toBe('<path fill="#FCD0D0"/><path fill="#112233"/>');
  });

  it("applyResolvedColors uses the first entry for a repeated target", () => {
    const out = applyResolvedColors("#AAAAAA", [
      { target: "#aaaaaa", color: "#111111" },
      { target: "#AAAAAA", color: "#222222" },
    ]);
    expect(out).toBe("#111111");
    expect(applyResolvedColors("#AAAAAA", undefined)).toBe("#AAAAAA");
  });

  it("uses ctx.placements resolved by core, and slotPlacements wins for its slots (ADR-0009)", async () => {
    const { ctx, renderers } = setupCtx();
    await svgRendererPlugin({ slotPlacements: { base: { x: 1, y: 2, width: 3, height: 4 } } }).setup(ctx as never);
    const renderer = renderers[0]!;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    document.body.appendChild(svg);
    const res = { kind: "svg", data: "<svg/>" };
    await renderer.mount(svg, {
      schema,
      state: { transforms: {}, selections: { base: { partId: "base-01" }, hair: { partId: "hair-01" } } },
      resources: new Map([
        ["a-base-01", { assetId: "a-base-01", ...res }],
        ["a-hair-01", { assetId: "a-hair-01", ...res }],
      ]),
      colors: {},
      placements: {
        base: { x: 0, y: 0, width: 400, height: 400, rotation: 0 },
        hair: { x: 10, y: 20, width: 100, height: 50, rotation: 30 },
      },
    });
    const hair = svg.querySelector('image[data-slot="hair"]')!;
    expect([hair.getAttribute("x"), hair.getAttribute("y"), hair.getAttribute("width"), hair.getAttribute("height")]).toEqual(["10", "20", "100", "50"]);
    expect(hair.getAttribute("transform")).toBe("rotate(30 60 45)");
    expect(svg.querySelector('image[data-slot="base"]')!.getAttribute("width")).toBe("3");
  });

  it("update swaps href when selection changes", async () => {
    const { ctx, renderers } = setupCtx();
    await svgRendererPlugin().setup(ctx as never);
    const renderer = renderers[0]!;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    document.body.appendChild(svg);

    const baseResources = new Map([
      ["a-hair-01", { assetId: "a-hair-01", kind: "svg", data: "first", mime: "image/svg+xml" }],
    ]);
    await renderer.mount(svg, {
      schema,
      state: { transforms: {}, selections: { hair: { partId: "hair-01" } } },
      resources: baseResources,
      colors: {},
      placements: {},
    });

    const updatedResources = new Map([
      ["a-hair-01", { assetId: "a-hair-01", kind: "svg", data: "first", mime: "image/svg+xml" }],
      ["a-hair-02", { assetId: "a-hair-02", kind: "svg", data: "second", mime: "image/svg+xml" }],
    ]);
    await renderer.update({
      schema,
      state: { transforms: {}, selections: { hair: { partId: "hair-02" } } },
      resources: updatedResources,
      colors: {},
      placements: {},
    });

    const img = svg.querySelector('image[data-slot="hair"]') as SVGImageElement;
    expect(img.getAttribute("href")).toContain("second");
  });
});
