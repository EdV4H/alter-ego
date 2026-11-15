import type {
  Plugin,
  PluginContext,
  Renderer,
  RendererContext,
} from "@edv4h/alter-ego-core";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * SVG 文字列内の sourceColor を targetColor で置換する。
 * hex 値 (#RRGGBB / #RGB) のみ対応、大文字小文字を区別しない。
 *
 * サムネイル等の用途で renderer 外部からも使えるよう export する。
 */
export function applyColorReplace(
  svgData: string,
  sourceColor: string,
  targetColor: string,
): string {
  const escaped = sourceColor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escaped, "gi");
  return svgData.replace(re, targetColor);
}

/**
 * slot ごとの色置換ルール 1 件。
 * - from: SVG 内で置換対象となる元 hex 色
 * - fromSlot: 置換先 (target) の color を取得するスロット。
 *   "self" は当該 slot 自身、 他の slot id を指定すれば別 slot の selection.color を参照する。
 *   例: hair_back/hair_front の skin 部分を face.color に追従させる場合 fromSlot: "face"。
 */
export interface ColorReplaceEntry {
  from: string;
  fromSlot: string;
}

/**
 * slot id → 色置換ルール配列。
 * @deprecated スキーマの `Asset.colorBindings`（ADR-0008）を使う
 */
export type ColorReplaceMap = Record<string, ColorReplaceEntry[]>;

/** SelectionEntry 互換: selections 引数を最小限の形で受け取れるよう緩める。 */
type SelectionsLike = Record<string, { color?: string } | undefined>;

/**
 * slot ごとの <image> 配置オプション。
 * 親 SVG のビューボックス座標系での位置とサイズを直接指定する。
 * 省略フィールドはデフォルト (width/height = "100%", preserveAspectRatio = "xMidYMid meet") のまま。
 * rotation を指定すると、 配置の中心 (x + w/2, y + h/2) を回転中心として
 * deg 度回転する。 width/height が数値の場合のみ有効。
 * 例: mouth (288×288 viewBox を 400×400 親に配置する場合) などで使う。
 */
export interface SlotPlacement {
  x?: number;
  y?: number;
  width?: number | string;
  height?: number | string;
  preserveAspectRatio?: string;
  rotation?: number;
}

/** slot id → 配置設定 */
export type SlotPlacementMap = Record<string, SlotPlacement>;

/**
 * SlotPlacementMap または 都度それを返す関数。
 * 関数を渡すと update のたびに評価され、 動的な placement 更新 (例: ユーザーが
 * UI で位置・サイズを変えるとき) に対応できる。
 */
export type SlotPlacementsResolver = SlotPlacementMap | (() => SlotPlacementMap);

function resolvePlacements(resolver: SlotPlacementsResolver): SlotPlacementMap {
  return typeof resolver === "function" ? resolver() : resolver;
}

/**
 * slot に紐づく ColorReplaceEntry[] を SVG 文字列に適用する。
 *
 * 連鎖置換バグを避けるため、 まず全 entry の from を 1 つの正規表現に
 * alternation でまとめ、 single-pass で各マッチを対応する target 色に置換する。
 * 順次置換にすると、 ある entry の target 色が後続 entry の from と一致した時に
 * 置換済みの領域が再置換されてしまう (例: face.color = "#FCD0D0" のとき、
 * skin (#50C7FF) → #FCD0D0 となった後で hair (#FCD0D0) → hair.color に
 * 巻き込まれる) — single-pass マッチングはこれを防ぐ。
 *
 * 同じ from 色が entries 内で重複した場合は 配列上の最初の entry を優先する。
 * 参照先 slot に selection が無い entry はスキップ (= 該当 from 色は置換せず残す)。
 *
 * サムネイル等の用途で renderer 外部からも使えるよう export する。
 */
export function applyColorReplaceMap(
  svgData: string,
  entries: ColorReplaceEntry[] | undefined,
  slotId: string,
  selections: SelectionsLike,
): string {
  if (!entries || entries.length === 0) return svgData;

  // 解決済み (from → target) のペアを構築する。 同じ from は最初の出現を優先。
  const resolved = new Map<string, string>();
  for (const e of entries) {
    const fromKey = e.from.toLowerCase();
    if (resolved.has(fromKey)) continue;
    const fromSlotId = e.fromSlot === "self" ? slotId : e.fromSlot;
    const target = selections[fromSlotId]?.color;
    if (!target) continue;
    resolved.set(fromKey, target);
  }
  return replaceColors(svgData, resolved);
}

/** from(小文字) → 置換後の色 を single-pass で適用する */
function replaceColors(svgData: string, resolved: ReadonlyMap<string, string>): string {
  if (resolved.size === 0) return svgData;
  // alternation: from を 1 つの正規表現にまとめ、 マッチを対応する target で置換する。
  const pattern = [...resolved.keys()]
    .map((from) => from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const re = new RegExp(pattern, "gi");
  return svgData.replace(re, (match) => resolved.get(match.toLowerCase()) ?? match);
}

/**
 * core が解決した着色領域（`RendererContext.colors`、ADR-0008）を SVG 文字列に適用する。
 * renderer-svg では `target` を「置換元の hex」と解釈する。
 * 置換は single-pass で行い、同じ target が重複した場合は最初の 1 件を使う。
 *
 * サムネイル等の用途で renderer 外部からも使えるよう export する。
 */
export function applyResolvedColors(
  svgData: string,
  resolved: readonly { target: string; color: string }[] | undefined,
): string {
  if (!resolved || resolved.length === 0) return svgData;
  const map = new Map<string, string>();
  for (const { target, color } of resolved) {
    const key = target.toLowerCase();
    if (!map.has(key)) map.set(key, color);
  }
  return replaceColors(svgData, map);
}

/**
 * リソースを data URI に変換する。
 * SVG 文字列なら recolor で色を置換してから encode する。
 */
function dataUriForResource(
  resource: { kind: string; data: unknown; mime?: string },
  recolor: (svgData: string) => string,
): string {
  if (resource.kind === "svg" && typeof resource.data === "string") {
    const replaced = recolor(resource.data);
    const encoded = encodeURIComponent(replaced);
    return `data:image/svg+xml;utf8,${encoded}`;
  }
  if (resource.data instanceof Blob) {
    return URL.createObjectURL(resource.data);
  }
  return "";
}

/** SlotPlacement を SVGImageElement の属性に反映する。 */
function applyPlacement(img: SVGImageElement, placement: SlotPlacement | undefined): void {
  const width = placement?.width ?? "100%";
  const height = placement?.height ?? "100%";
  const par = placement?.preserveAspectRatio ?? "xMidYMid meet";
  img.setAttribute("width", String(width));
  img.setAttribute("height", String(height));
  img.setAttribute("preserveAspectRatio", par);
  if (placement?.x !== undefined) img.setAttribute("x", String(placement.x));
  else img.removeAttribute("x");
  if (placement?.y !== undefined) img.setAttribute("y", String(placement.y));
  else img.removeAttribute("y");

  // rotation: 配置の中心を回転中心にする。 width/height が数値のときのみ。
  if (
    placement?.rotation !== undefined &&
    placement.rotation !== 0 &&
    typeof placement.width === "number" &&
    typeof placement.height === "number"
  ) {
    const cx = (placement.x ?? 0) + placement.width / 2;
    const cy = (placement.y ?? 0) + placement.height / 2;
    img.setAttribute("transform", `rotate(${placement.rotation} ${cx} ${cy})`);
  } else {
    img.removeAttribute("transform");
  }
}

/**
 * スロットの zIndex 順に <image> 要素を同期する。
 * 既存要素は再利用し、選択なし or リソースなしのスロットは要素を削除する。
 */
function syncImages(
  svg: SVGSVGElement,
  ctx: RendererContext,
  colorReplaceMap: ColorReplaceMap,
  placementsResolver: SlotPlacementsResolver,
): void {
  const slotsByZIndex = [...ctx.schema.slots].toSorted((a, b) => a.zIndex - b.zIndex);
  const slotPlacements = resolvePlacements(placementsResolver);

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
      if (img) {
        img.setAttribute("href", "");
      }
      continue;
    }

    if (!img) {
      img = document.createElementNS(SVG_NS, "image");
      img.setAttribute("data-slot", slot.id);
      svg.appendChild(img);
    } else {
      svg.appendChild(img);
    }

    // 旧オプション slotPlacements にこの Slot の指定があればそちらを使う（移行期間のみ）
    applyPlacement(img, slotPlacements[slot.id] ?? ctx.placements[slot.id]);

    // 旧オプション colorReplaceMap にこの Slot の指定があればそちらを使う（移行期間のみ）
    const entries = colorReplaceMap[slot.id];
    const recolor =
      entries && entries.length > 0
        ? (data: string) => applyColorReplaceMap(data, entries, slot.id, ctx.state.selections)
        : (data: string) => applyResolvedColors(data, ctx.colors[slot.id]);
    img.setAttribute("href", dataUriForResource(resource, recolor));
  }
}

/** SVG レンダラープラグインのオプション */
export interface SvgRendererOptions {
  /**
   * スロットごとの色置換ルール。
   * 1 slot に複数 entry を指定でき、 順に累積適用される。
   * 指定した Slot ではスキーマの colorBindings より優先する。
   *
   * @deprecated スキーマの `Asset.colorBindings`（ADR-0008）を使う。次のメジャーで削除する
   * 各 entry の fromSlot を "self" 以外にすると、 他 slot の selection.color を target にできる
   * (例: hair_back の skin 部分を face.color で置換)。
   */
  colorReplaceMap?: ColorReplaceMap;
  /**
   * スロットごとの <image> 配置 (x, y, width, height, preserveAspectRatio)。
   * 指定した Slot ではスキーマの placement と AvatarState.transforms から core が合成した配置より優先する。
   * 親 SVG の viewBox 座標系で指定する。 省略時は width/height = 100%, preserveAspectRatio = xMidYMid meet。
   * 関数を渡すと update のたびに評価される (動的な位置・サイズ調整に使用)。
   *
   * @deprecated スキーマの `Slot.placement` と `engine.setTransform`（ADR-0009）を使う。次のメジャーで削除する
   */
  slotPlacements?: SlotPlacementsResolver;
}

/**
 * SVG レンダラープラグイン。
 * mount で <image> をスロットの zIndex 順に挿入し、
 * update で href を差し替える。
 */
export function svgRendererPlugin(options: SvgRendererOptions = {}): Plugin {
  let target: SVGSVGElement | null = null;
  const colorReplaceMap = options.colorReplaceMap ?? {};
  const slotPlacements: SlotPlacementsResolver = options.slotPlacements ?? {};

  const renderer: Renderer = {
    mount(targetIn, ctx) {
      if (!(targetIn instanceof SVGSVGElement)) {
        throw new Error("svgRendererPlugin: mount target must be an <svg> element");
      }
      target = targetIn;
      syncImages(target, ctx, colorReplaceMap, slotPlacements);
    },
    update(ctx) {
      if (!target) return;
      syncImages(target, ctx, colorReplaceMap, slotPlacements);
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
