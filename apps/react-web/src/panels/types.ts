import type { ComponentType } from "react";
import type { AvatarEngine, AvatarState } from "@edv4h/alter-ego-core";
import type { Category } from "../editor/categories.js";

/** カテゴリ用パネルが受け取るもの */
export interface CategoryPanelProps {
  readonly engine: AvatarEngine;
  readonly state: AvatarState;
  readonly category: Category;
  /** アセットの基点 URL（サムネイル用） */
  readonly assetBase: string;
}

/**
 * スキーマのカテゴリを選んでいるときに右ペインへ並ぶパネル。
 * パネルを足すときは、このファイルの型に合わせて 1 ファイル作り、registry.ts に並べる。
 */
export interface CategoryPanel {
  readonly id: string;
  /** そのカテゴリで出すかどうか（例: palette が無ければ色のパネルは出さない） */
  readonly isAvailable: (category: Category, engine: AvatarEngine) => boolean;
  readonly Component: ComponentType<CategoryPanelProps>;
}

/** アプリ独自の項目が受け取るもの。エンジンは準備中なら null */
export interface AppSectionProps {
  readonly engine: AvatarEngine | null;
  readonly state: AvatarState;
}

/**
 * スキーマに由来しない、アプリ独自の項目（背景、開発など）。
 * 左のカテゴリ一覧の末尾に並び、選ぶと Component だけが右ペインに出る。
 */
export interface AppSection {
  readonly id: string;
  readonly name: string;
  readonly Icon: ComponentType;
  readonly Component: ComponentType<AppSectionProps>;
}
