/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENAI_MODEL?: string;
  /** "true" のとき人のスキーマを出す（素材を手元に置いたときだけ） */
  readonly VITE_DEMO_HUMAN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
