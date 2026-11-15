import { useMemo } from "react";
import { categoryViewBox, partsOfCategory } from "../editor/categories.js";
import { clearCategory, hasSelection, selectPart, selectedPartOf } from "../editor/actions.js";
import { PartThumbnail, partAssetUrl, thumbnailLayers } from "../components/part-thumbnail.js";
import { useAssetText } from "../components/use-asset-text.js";
import { Button } from "../ui/button.js";
import { Section } from "../ui/section.js";
import type { CategoryPanel, CategoryPanelProps } from "./types.js";
import styles from "./panels.module.css";

function PartsPanel({ engine, state, category, assetBase }: CategoryPanelProps) {
  const schema = engine.schema;
  const parts = useMemo(() => partsOfCategory(schema, category), [schema, category]);
  const viewBox = useMemo(() => categoryViewBox(schema, category), [schema, category]);
  const urls = useMemo(
    () => parts.flatMap((p) => thumbnailLayers(schema, p.id).map((id) => partAssetUrl(schema, assetBase, id))),
    [schema, parts, assetBase],
  );
  const texts = useAssetText(urls);
  const source = { schema, state, assetBase, texts };
  const selected = selectedPartOf(state, category);

  return (
    <Section
      title="パーツ"
      aside={
        category.deselectable && (
          <Button
            size="sm"
            variant="ghost"
            disabled={!hasSelection(state, category)}
            onClick={() => clearCategory(engine, category)}
          >
            なしにする
          </Button>
        )
      }
    >
      <div className={styles.thumbGrid}>
        {parts.map((p) => {
          const isSelected = p.id === selected;
          return (
            <button
              key={p.id}
              type="button"
              className={styles.thumb}
              aria-pressed={isSelected}
              aria-label={p.name}
              title={p.name}
              onClick={isSelected ? undefined : () => selectPart(engine, category, p.id)}
            >
              <PartThumbnail source={source} partId={p.id} viewBox={viewBox} />
            </button>
          );
        })}
      </div>
    </Section>
  );
}

export const partsPanel: CategoryPanel = {
  id: "parts",
  isAvailable: (category, engine) => partsOfCategory(engine.schema, category).length > 0,
  Component: PartsPanel,
};
