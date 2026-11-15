import { useState } from "react";
import { createAvatarEngine, type AvatarEngine } from "@edv4h/alter-ego-core";
import { applyInitialSelections } from "../app/config.js";
import { applyStateToEngine, formatState } from "../editor/state.js";
import { DEFAULT_BACKGROUND, setBackground } from "../features/background/background.js";
import { clearEventLog, useEventLog } from "../features/devtools/event-log.js";
import { Button } from "../ui/button.js";
import { Dialog } from "../ui/dialog.js";
import { Section } from "../ui/section.js";
import type { AppSection, AppSectionProps } from "./types.js";
import styles from "./panels.module.css";

/** 起動直後と同じ構成に戻す（初期色も当てる）。背景も既定に戻す */
function resetToInitial(engine: AvatarEngine): void {
  const fresh = createAvatarEngine({ schema: engine.schema, plugins: [] });
  applyInitialSelections(fresh);
  applyStateToEngine(engine, fresh.state);
  setBackground(DEFAULT_BACKGROUND);
}

const time = (d: Date) =>
  `${d.toLocaleTimeString("ja-JP", { hour12: false })}.${String(d.getMilliseconds()).padStart(3, "0")}`;

function StateSection({ engine, state }: { readonly engine: AvatarEngine; readonly state: AppSectionProps["state"] }) {
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const json = formatState(state);

  return (
    <Section
      title="状態（AvatarState）"
      aside={
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            void navigator.clipboard
              .writeText(json)
              .then(() => setMessage({ ok: true, text: "コピーしました" }))
              .catch(() => setMessage({ ok: false, text: "コピーできませんでした" }));
          }}
        >
          コピー
        </Button>
      }
    >
      <pre className={styles.code}>{json}</pre>
      <textarea
        className={styles.textarea}
        placeholder="ここに状態の JSON を貼り付けて「読み込む」"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={4}
        aria-label="読み込む状態の JSON"
      />
      <div className={styles.row}>
        <Button
          size="sm"
          disabled={draft.trim() === ""}
          onClick={() => {
            try {
              applyStateToEngine(engine, draft);
              setDraft("");
              setMessage({ ok: true, text: "読み込みました" });
            } catch (e) {
              setMessage({ ok: false, text: `読み込めませんでした: ${e instanceof Error ? e.message : String(e)}` });
            }
          }}
        >
          読み込む
        </Button>
        {message && (
          <span className={message.ok ? styles.note : styles.errorText} role="status">
            {message.text}
          </span>
        )}
      </div>
    </Section>
  );
}

function EventLogSection() {
  const entries = useEventLog();
  return (
    <Section
      title="イベントログ"
      aside={
        <Button size="sm" variant="ghost" disabled={entries.length === 0} onClick={clearEventLog}>
          消す
        </Button>
      }
    >
      {entries.length === 0 ? (
        <p className={styles.note}>まだイベントはありません</p>
      ) : (
        <ol className={styles.log}>
          {entries.map((e) => (
            <li key={e.id} className={styles.logItem}>
              <span className={styles.logTime}>{time(e.at)}</span>
              <span className={e.event.endsWith(":error") ? styles.logEventError : styles.logEvent}>{e.event}</span>
              <span className={styles.logDetail}>{e.detail}</span>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

function SaveSection({ engine }: { readonly engine: AvatarEngine }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <Section title="保存">
      <p className={styles.note}>構成と背景は、このブラウザに自動で保存しています。リロードしても続きから作業できます。</p>
      <div className={styles.row}>
        <Button size="sm" onClick={() => setConfirming(true)}>
          最初からやり直す
        </Button>
      </div>
      <Dialog
        open={confirming}
        title="最初からやり直します"
        onClose={() => setConfirming(false)}
        actions={
          <>
            <Button onClick={() => setConfirming(false)}>キャンセル</Button>
            <Button
              variant="primary"
              onClick={() => {
                resetToInitial(engine);
                setConfirming(false);
              }}
            >
              やり直す
            </Button>
          </>
        }
      >
        <p className={styles.dialogText}>パーツ・色・配置・背景を、起動したときの状態に戻します。</p>
      </Dialog>
    </Section>
  );
}

function DevtoolsPanel({ engine, state }: AppSectionProps) {
  if (!engine) return <p className={styles.note}>読み込み中…</p>;
  return (
    <>
      <SaveSection engine={engine} />
      <StateSection engine={engine} state={state} />
      <EventLogSection />
    </>
  );
}

function DevtoolsIcon() {
  return (
    <span className={styles.textIcon} aria-hidden>
      {"{ }"}
    </span>
  );
}

export const devtoolsSection: AppSection = {
  id: "devtools",
  name: "開発",
  Icon: DevtoolsIcon,
  Component: DevtoolsPanel,
};
