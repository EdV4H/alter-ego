import { useRef, useState } from "react";
import { Button } from "../../ui/button.js";
import { Dialog } from "../../ui/dialog.js";
import { PROVIDER_LABEL, type PerceiveProvider, type PhotoToAvatar } from "./use-photo-to-avatar.js";
import styles from "./photo-to-avatar.module.css";

const PROVIDERS: readonly PerceiveProvider[] = ["openai", "gemini"];

/**
 * 「写真から作る」ボタン。押すと上書きの確認とプロバイダ選択を出し、
 * 続行でファイル選択を開く。
 */
export function PhotoToAvatarButton({ photo, disabled }: { readonly photo: PhotoToAvatar; readonly disabled: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <Button
        onClick={() => setConfirming(true)}
        disabled={disabled || photo.status.kind === "loading"}
        aria-label="写真からアバターを作る"
      >
        写真から作る
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          // 同じ写真を続けて選び直せるようにする
          e.target.value = "";
          if (file) void photo.run(file);
        }}
      />
      <Dialog
        open={confirming}
        title="現在の編集を上書きします"
        onClose={() => setConfirming(false)}
        actions={
          <>
            <Button onClick={() => setConfirming(false)}>キャンセル</Button>
            <Button
              variant="primary"
              autoFocus
              onClick={() => {
                setConfirming(false);
                input.current?.click();
              }}
            >
              続行
            </Button>
          </>
        }
      >
        <p className={styles.text}>写真から作ると、今のパーツ・色・配置はすべて置き換わります。続けますか?</p>
        <fieldset className={styles.providers}>
          <legend className={styles.legend}>推定に使う AI</legend>
          {PROVIDERS.map((p) => (
            <label key={p} className={styles.provider}>
              <input
                type="radio"
                name="perceive-provider"
                value={p}
                checked={photo.provider === p}
                onChange={() => photo.setProvider(p)}
              />
              {PROVIDER_LABEL[p]}
            </label>
          ))}
        </fieldset>
      </Dialog>
    </>
  );
}
