import qs from "qs";
import type { Subscribable, Unsubscribe } from "../core/types.js";
import { shallowEqual } from "../core/shallow-equal.js";

export interface SyncToUrlOptions<T extends object, P extends Record<string, unknown> = Record<string, unknown>> {
  /** Map from URL param name to a selector on the store's state. */
  params: { [K in keyof P]: (state: T) => P[K] };
  /** Use replaceState (default) or pushState. */
  history?: "replace" | "push";
}

export function syncToUrl<T extends object, P extends Record<string, unknown> = Record<string, unknown>>(
  store: Subscribable<T>,
  options: SyncToUrlOptions<T, P>,
): Unsubscribe {
  const hasBrowser = typeof window !== "undefined";
  if (!hasBrowser) return () => {};

  const { params, history: historyMode = "replace" } = options;
  const keys = Object.keys(params);
  let prev: Record<string, unknown> = {};

  return store.subscribe(() => {
    const state = store.getSnapshot();
    const next: Record<string, unknown> = {};
    for (const key of keys) {
      const value = params[key](state);
      if (value !== undefined && value !== null && value !== "") {
        next[key] = value;
      }
    }

    if (shallowEqual(prev, next)) return;
    prev = next;

    const nextSearch = qs.stringify(next, { addQueryPrefix: true, allowDots: true });
    const currentSearch = window.location.search || "";

    if (nextSearch === currentSearch || (nextSearch === "?" && currentSearch === "")) return;

    const url = window.location.pathname + nextSearch + window.location.hash;
    if (historyMode === "push") {
      window.history.pushState(null, "", url);
    } else {
      window.history.replaceState(null, "", url);
    }
  });
}
