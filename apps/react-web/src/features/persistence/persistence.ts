import { serializeState, type AvatarEngine, type StateReadIssue } from "@edv4h/alter-ego-core";
import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import { applyStateToEngine } from "../../editor/state.js";
import {
  getBackground,
  setBackground,
  subscribeBackground,
  type BackgroundConfig,
} from "../background/background.js";

// 開発中にリロードしても続きから作業できるよう、構成と背景をブラウザに覚えておく。
// 保存先はこのブラウザの localStorage だけ。アカウントやサーバへの保存はしない（非目標）。

const VERSION = 1;
const SAVE_DELAY_MS = 300;
/** 背景画像がこれより大きければ保存しない（localStorage の容量を食い尽くさないため） */
const MAX_BACKGROUND_IMAGE_CHARS = 1_000_000;

interface Saved {
  readonly version: number;
  readonly state: string;
  readonly background?: BackgroundConfig;
}

/** スキーマごとに別の場所へ保存する（スキーマを切り替えても混ざらない） */
export const storageKeyOf = (schema: AvatarSchema): string =>
  `alter-ego-demo:state:${schema.metadata.name}`;

function read(key: string): Saved | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Saved>;
    return v.version === VERSION && typeof v.state === "string" ? (v as Saved) : null;
  } catch {
    return null;
  }
}

function write(key: string, engine: AvatarEngine): void {
  const bg = getBackground();
  const background =
    bg.kind === "image" && bg.dataUri.length > MAX_BACKGROUND_IMAGE_CHARS ? undefined : bg;
  const saved: Saved = { version: VERSION, state: serializeState(engine.state), ...(background ? { background } : {}) };
  try {
    localStorage.setItem(key, JSON.stringify(saved));
  } catch (e) {
    // 容量オーバーやプライベートモードでは保存できない。作業は続けられるので警告だけ
    console.warn("[persistence] 保存できませんでした", e);
  }
}

/**
 * 保存しておいた構成と背景を戻す。戻せたら true。
 * スキーマで改名された id は読み替え、スキーマから消えたパーツなどは捨てて、読めた分だけ戻す（ADR-0012）。
 * 読み替えたり捨てたりしたら、今の id で保存し直す。全体が読めない保存は捨てる。
 */
export function restoreSaved(engine: AvatarEngine): boolean {
  const key = storageKeyOf(engine.schema);
  const saved = read(key);
  if (!saved) return false;
  try {
    const issues: StateReadIssue[] = [];
    applyStateToEngine(engine, saved.state, { unknown: "drop", onIssue: (i) => issues.push(i) });
    if (saved.background) setBackground(saved.background);
    if (issues.length > 0) {
      console.info("[persistence] 保存した構成をスキーマに合わせて直しました", issues);
      write(key, engine);
    }
    return true;
  } catch (e) {
    console.warn("[persistence] 保存した構成がスキーマに合わないので捨てます", e);
    clearSaved(engine.schema);
    return false;
  }
}

export function clearSaved(schema: AvatarSchema): void {
  try {
    localStorage.removeItem(storageKeyOf(schema));
  } catch {
    // 消せなくても困らない
  }
}

/**
 * 構成か背景が変わるたびに（少し待ってまとめて）保存する。止める関数を返す。
 */
export function startAutoSave(engine: AvatarEngine): () => void {
  const key = storageKeyOf(engine.schema);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => write(key, engine), SAVE_DELAY_MS);
  };
  const offState = engine.on("state:change", schedule);
  const offBackground = subscribeBackground(schedule);
  return () => {
    clearTimeout(timer);
    offState();
    offBackground();
  };
}
