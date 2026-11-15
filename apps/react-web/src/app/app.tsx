import { useMemo, useState } from "react";
import type { AvatarEngine } from "@edv4h/alter-ego-core";
import { httpLoaderPlugin } from "@edv4h/alter-ego-plugin-loader-http";
import { svgRendererPlugin } from "@edv4h/alter-ego-plugin-renderer-svg";
import { useAvatarEngine, useAvatarState } from "@edv4h/alter-ego-react";
import { deriveCategories } from "../editor/categories.js";
import { backgroundStyle, useBackground } from "../features/background/background.js";
import { attachEventLog, clearEventLog } from "../features/devtools/event-log.js";
import { ExportPngButton } from "../features/export-png/export-png-button.js";
import { restoreSaved, startAutoSave } from "../features/persistence/persistence.js";
import { PhotoToAvatarOverlay } from "../features/photo-to-avatar/overlay.js";
import { PhotoToAvatarButton } from "../features/photo-to-avatar/photo-to-avatar-button.js";
import { usePhotoToAvatar } from "../features/photo-to-avatar/use-photo-to-avatar.js";
import { initialDemoSchema, rememberDemoSchema } from "../features/schema-switch/schema-choice.js";
import { APP_SECTIONS, CATEGORY_PANELS } from "../panels/registry.js";
import { applyInitialSelections, assetBaseUrl, type DemoSchema } from "./config.js";
import { CategoryNav } from "./category-nav.js";
import { SchemaSelect } from "./schema-select.js";
import { ThemeToggle } from "./theme-toggle.js";
import styles from "./app.module.css";

const createPlugins = () => [httpLoaderPlugin({ baseUrl: assetBaseUrl() }), svgRendererPlugin()];

/** エンジンを作った直後: 読み込みと描画の失敗をコンソールに出し、開発者パネルのイベントログをつなぐ */
const onCreate = (engine: AvatarEngine) => {
  const offs = [
    engine.on("asset:error", (e) => console.error("[asset:error]", e)),
    engine.on("render:error", (e) => console.error("[render:error]", e)),
    attachEventLog(engine),
  ];
  return () => {
    for (const off of offs) off();
  };
};

/** mount 直後: 初期の選択を当て、保存があれば戻し、以後の変更を保存し始める */
const onReady = (engine: AvatarEngine) => {
  applyInitialSelections(engine);
  restoreSaved(engine);
  return startAutoSave(engine);
};

/**
 * スキーマを選ぶ。スキーマを変えたら、エディタを丸ごと作り直す（key を変える）。
 * カテゴリの選択やパネルの中の状態を、前のスキーマから持ち越さないため。
 */
export function App() {
  const [demo, setDemo] = useState<DemoSchema>(initialDemoSchema);
  const changeSchema = (next: DemoSchema) => {
    rememberDemoSchema(next.id);
    clearEventLog();
    setDemo(next);
  };
  return <Editor key={demo.id} demo={demo} onChangeSchema={changeSchema} />;
}

interface EditorProps {
  readonly demo: DemoSchema;
  readonly onChangeSchema: (demo: DemoSchema) => void;
}

/**
 * 画面の殻。カテゴリ一覧・プレビュー・パネルを並べるだけで、
 * 何を出すかはスキーマ（editor/）とパネルの登録（panels/registry.ts）が決める。
 */
function Editor({ demo, onChangeSchema }: EditorProps) {
  const { schema } = demo;
  const assetBase = assetBaseUrl();
  const { mountRef, engine, error } = useAvatarEngine<SVGSVGElement>({
    schema,
    createPlugins,
    onCreate,
    onReady,
  });
  const state = useAvatarState(engine);
  const photo = usePhotoToAvatar(engine);
  const background = useBackground();

  const categories = useMemo(() => deriveCategories(schema), [schema]);
  const [currentId, setCurrentId] = useState<string>(() => categories[0]?.id ?? APP_SECTIONS[0]?.id ?? "");
  const category = categories.find((c) => c.id === currentId);
  const section = APP_SECTIONS.find((s) => s.id === currentId);
  const ready = engine !== null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Avatar? Avatar!</h1>
        <div className={styles.headerActions}>
          <SchemaSelect value={demo.id} onChange={onChangeSchema} />
          <ThemeToggle />
          <PhotoToAvatarButton photo={photo} disabled={!ready} />
          <ExportPngButton svgRef={mountRef} disabled={!ready} />
        </div>
      </header>

      {error ? (
        <div className={styles.error} role="alert">
          初期化に失敗しました: {error.message}
        </div>
      ) : (
        <main className={styles.main}>
          <CategoryNav
            schema={schema}
            state={state}
            assetBase={assetBase}
            categories={categories}
            sections={APP_SECTIONS}
            currentId={currentId}
            onSelect={setCurrentId}
          />

          <section className={styles.preview} style={backgroundStyle(background)} aria-label="プレビュー">
            <svg
              ref={mountRef}
              className={styles.avatar}
              viewBox={`0 0 ${schema.canvas?.width ?? 400} ${schema.canvas?.height ?? 400}`}
              role="img"
              aria-label="アバター"
            />
            {!ready && <p className={styles.loading}>読み込み中…</p>}
            <PhotoToAvatarOverlay photo={photo} />
          </section>

          <aside className={styles.inspector} aria-label={category?.name ?? section?.name}>
            {section && <section.Component engine={engine} state={state} />}
            {engine &&
              category &&
              CATEGORY_PANELS.filter((p) => p.isAvailable(category, engine)).map((p) => (
                <p.Component key={p.id} engine={engine} state={state} category={category} assetBase={assetBase} />
              ))}
          </aside>
        </main>
      )}
    </div>
  );
}
