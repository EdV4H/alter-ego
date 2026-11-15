import { Button } from "../../ui/button.js";
import { Spinner } from "../../ui/section.js";
import type { PhotoToAvatar } from "./use-photo-to-avatar.js";
import styles from "./photo-to-avatar.module.css";

/** 推定中・失敗時にプレビューの上へ重ねる表示 */
export function PhotoToAvatarOverlay({ photo }: { readonly photo: PhotoToAvatar }) {
  const { status } = photo;
  if (status.kind === "idle") return null;
  return (
    <div className={styles.overlay} role="status" aria-live="polite">
      {status.kind === "loading" ? (
        <>
          <Spinner />
          <p className={styles.message}>写真を解析中…</p>
          <Button onClick={photo.cancel}>キャンセル</Button>
        </>
      ) : (
        <>
          <p className={styles.error}>{status.message}</p>
          <div className={styles.overlayActions}>
            <Button variant="primary" onClick={photo.retry}>
              再試行
            </Button>
            <Button onClick={photo.cancel}>閉じる</Button>
          </div>
        </>
      )}
    </div>
  );
}
