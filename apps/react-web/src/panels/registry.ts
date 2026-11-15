import type { AppSection, CategoryPanel } from "./types.js";
import { backgroundSection } from "./background-panel.js";
import { colorPanel } from "./color-panel.js";
import { devtoolsSection } from "./devtools-panel.js";
import { partsPanel } from "./parts-panel.js";
import { schemaPanel } from "./schema-panel.js";
import { transformPanel } from "./transform-panel.js";

/**
 * カテゴリを選んでいるときに右ペインへ上から並べるパネル。
 * 新しいパネルはここに足すだけでよく、app.tsx は触らない。
 * パーツ一覧は長くなるので後ろに、開発者向けのスキーマ表示は一番下に置く。
 */
export const CATEGORY_PANELS: readonly CategoryPanel[] = [colorPanel, transformPanel, partsPanel, schemaPanel];

/** カテゴリ一覧の末尾に並ぶ、アプリ独自の項目 */
export const APP_SECTIONS: readonly AppSection[] = [backgroundSection, devtoolsSection];
