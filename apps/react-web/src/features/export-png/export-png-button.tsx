import { useState, type RefObject } from "react";
import { PNG_EXPORT_SIZE } from "../../app/config.js";
import { Button } from "../../ui/button.js";
import { getBackground } from "../background/background.js";
import { downloadBlob, pngFilename, renderAvatarPng } from "./export-png.js";

/** 描画中のアバターを背景ごと PNG で保存するボタン */
export function ExportPngButton({
  svgRef,
  disabled,
}: {
  readonly svgRef: RefObject<SVGSVGElement | null>;
  readonly disabled: boolean;
}) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    const svg = svgRef.current;
    if (!svg || busy) return;
    setBusy(true);
    try {
      downloadBlob(await renderAvatarPng(svg, getBackground(), PNG_EXPORT_SIZE), pngFilename());
    } catch (e) {
      console.error("[export-png]", e);
      window.alert(`PNG の書き出しに失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="primary" onClick={onClick} disabled={disabled || busy} aria-label="アバターを PNG で保存">
      {busy ? "書き出し中…" : "PNG で保存"}
    </Button>
  );
}
