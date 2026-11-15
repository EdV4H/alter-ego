import {
  BACKGROUND_PALETTE,
  readFileAsDataUri,
  setBackground,
  useBackground,
} from "../features/background/background.js";
import { Section } from "../ui/section.js";
import { sameColor, Swatch, SwatchGrid } from "../ui/swatch.js";
import type { AppSection } from "./types.js";
import styles from "./panels.module.css";

function BackgroundPanel() {
  const bg = useBackground();
  return (
    <>
      <Section title="透明 / 単色">
        <SwatchGrid label="背景の色">
          <Swatch
            color={null}
            label="透明"
            selected={bg.kind === "transparent"}
            onSelect={() => setBackground({ kind: "transparent" })}
          />
          {BACKGROUND_PALETTE.map((c) => (
            <Swatch
              key={c}
              color={c}
              label={c}
              selected={bg.kind === "color" && sameColor(bg.color, c)}
              onSelect={() => setBackground({ kind: "color", color: c })}
            />
          ))}
        </SwatchGrid>
      </Section>
      <Section title="画像（400×400 推奨）">
        <input
          type="file"
          accept="image/*"
          className={styles.fileInput}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            // 同じファイルを続けて選び直せるようにする
            e.target.value = "";
            if (file) setBackground({ kind: "image", dataUri: await readFileAsDataUri(file) });
          }}
        />
      </Section>
    </>
  );
}

function BackgroundIcon() {
  return <span className={styles.backgroundIcon} aria-hidden />;
}

export const backgroundSection: AppSection = {
  id: "background",
  name: "背景",
  Icon: BackgroundIcon,
  Component: BackgroundPanel,
};
