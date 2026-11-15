import { DEFAULT_DEMO_SCHEMA, DEMO_SCHEMAS, type DemoSchema } from "../../app/config.js";

// どのスキーマで開くか。URL の ?schema= を優先し、無ければ前回選んだものを使う。
// URL で指定できるので、E2E テストや人に見せるときにスキーマを固定できる。

const STORAGE_KEY = "alter-ego-demo:schema";
const PARAM = "schema";

const find = (id: string | null | undefined): DemoSchema | undefined => DEMO_SCHEMAS.find((d) => d.id === id);

function stored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function store(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // 保存できなくても切り替えはできる
  }
}

/** 起動時に開くスキーマ。URL で指定されたものは、次に URL なしで開いたときにも使う */
export function initialDemoSchema(): DemoSchema {
  const fromUrl = find(new URLSearchParams(window.location.search).get(PARAM));
  if (fromUrl) {
    store(fromUrl.id);
    return fromUrl;
  }
  return find(stored()) ?? DEFAULT_DEMO_SCHEMA;
}

/** 選んだスキーマを覚え、URL にも反映する（リロードや共有で同じスキーマが開く） */
export function rememberDemoSchema(id: string): void {
  store(id);
  const url = new URL(window.location.href);
  url.searchParams.set(PARAM, id);
  window.history.replaceState(null, "", url);
}
