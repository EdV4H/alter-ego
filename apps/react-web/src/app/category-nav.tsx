import { useMemo } from "react";
import type { AvatarSchema } from "@edv4h/alter-ego-schema";
import type { AvatarState } from "@edv4h/alter-ego-core";
import { categoryViewBox, partsOfCategory, type Category } from "../editor/categories.js";
import { PartThumbnail, partAssetUrl, thumbnailLayers } from "../components/part-thumbnail.js";
import { useAssetText } from "../components/use-asset-text.js";
import type { AppSection } from "../panels/types.js";
import styles from "./app.module.css";

export interface CategoryNavProps {
  readonly schema: AvatarSchema;
  readonly state: AvatarState;
  readonly assetBase: string;
  readonly categories: readonly Category[];
  readonly sections: readonly AppSection[];
  readonly currentId: string;
  readonly onSelect: (id: string) => void;
}

/** アイコンに使う Part。今選ばれている Part、無ければ先頭の Part */
function iconPartOf(schema: AvatarSchema, state: AvatarState, category: Category): string | null {
  return state.selections[category.baseSlot]?.partId ?? partsOfCategory(schema, category)[0]?.id ?? null;
}

/** 左のカテゴリ一覧。スキーマのカテゴリの後に、アプリ独自の項目（背景）を並べる */
export function CategoryNav(props: CategoryNavProps) {
  const { schema, state, assetBase, categories, sections, currentId, onSelect } = props;
  const icons = categories.map((c) => iconPartOf(schema, state, c));
  const urls = useMemo(
    () =>
      icons.flatMap((id) => (id ? thumbnailLayers(schema, id).map((l) => partAssetUrl(schema, assetBase, l)) : [])),
    // icons は毎回作り直すので、中身で比べる
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schema, assetBase, icons.join(",")],
  );
  const texts = useAssetText(urls);
  const source = { schema, state, assetBase, texts };

  return (
    <nav className={styles.nav} aria-label="カテゴリ">
      {categories.map((c, i) => {
        const iconPart = icons[i];
        return (
          <button
            key={c.id}
            type="button"
            className={styles.navItem}
            aria-current={c.id === currentId ? "true" : undefined}
            onClick={() => onSelect(c.id)}
          >
            <span className={styles.navIcon}>
              {iconPart && <PartThumbnail source={source} partId={iconPart} viewBox={categoryViewBox(schema, c)} />}
            </span>
            {c.name}
          </button>
        );
      })}
      {sections.map((s) => (
        <button
          key={s.id}
          type="button"
          className={styles.navItem}
          aria-current={s.id === currentId ? "true" : undefined}
          onClick={() => onSelect(s.id)}
        >
          <span className={styles.navIcon}>
            <s.Icon />
          </span>
          {s.name}
        </button>
      ))}
    </nav>
  );
}
