import { Button } from "../ui/button.js";
import { nextTheme, setTheme, THEME_LABEL, useTheme } from "../ui/theme.js";

/** テーマを OS に合わせる → ライト → ダーク の順に切り替える */
export function ThemeToggle() {
  const theme = useTheme();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setTheme(nextTheme(theme))}
      title={`テーマ: ${THEME_LABEL[theme]}（押すと切り替え）`}
    >
      {THEME_LABEL[theme]}
    </Button>
  );
}
