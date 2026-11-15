import { colorOf, hasSelection, setColor } from "../editor/actions.js";
import { Section } from "../ui/section.js";
import { sameColor, Swatch, SwatchGrid } from "../ui/swatch.js";
import type { CategoryPanel, CategoryPanelProps } from "./types.js";

/** 基準 Slot の palette から色を選ぶ。肌色などの連動はスキーマの colorBindings に任せる */
function ColorPanel({ engine, state, category }: CategoryPanelProps) {
  const current = colorOf(state, category);
  const disabled = !hasSelection(state, category);
  return (
    <Section title="色">
      <SwatchGrid label={`${category.name}の色`}>
        {(category.palette ?? []).map((c) => (
          <Swatch
            key={c}
            color={c}
            label={c}
            selected={sameColor(current, c)}
            onSelect={() => {
              if (!disabled) setColor(engine, category, c);
            }}
          />
        ))}
      </SwatchGrid>
    </Section>
  );
}

export const colorPanel: CategoryPanel = {
  id: "color",
  isAvailable: (category) => (category.palette?.length ?? 0) > 0,
  Component: ColorPanel,
};
