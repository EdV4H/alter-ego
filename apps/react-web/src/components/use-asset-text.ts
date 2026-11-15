import { useEffect, useReducer } from "react";

// アセット（SVG）の中身を URL ごとに 1 回だけ取ってきて覚えておく。
// サムネイルに色を付けるには SVG の文字列が要るため。
const cache = new Map<string, string>();
const inflight = new Set<string>();
const listeners = new Set<() => void>();

function load(url: string): void {
  if (cache.has(url) || inflight.has(url)) return;
  inflight.add(url);
  void fetch(url)
    .then((res) => (res.ok ? res.text() : null))
    .then((text) => {
      if (text !== null) cache.set(url, text);
    })
    .catch(() => {})
    .finally(() => {
      inflight.delete(url);
      for (const l of listeners) l();
    });
}

/**
 * 渡した URL の中身を読み込み、読めたものから返す。読み込み中のものは入っていない。
 */
export function useAssetText(urls: readonly string[]): ReadonlyMap<string, string> {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const key = urls.join("\n");

  useEffect(() => {
    listeners.add(bump);
    for (const url of key.split("\n")) if (url) load(url);
    return () => {
      listeners.delete(bump);
    };
  }, [key]);

  return cache;
}
