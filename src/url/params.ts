import qs from "qs";
import type { Listener, Unsubscribe, Subscribable } from "../core/types.js";

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Patch pushState/replaceState to emit a custom event so createUrlParams
// can detect SPA navigation (these APIs don't fire popstate).
let historyPatched = false;
const HISTORY_EVENT = "snapstate:urlchange";

function patchHistory(): void {
  if (historyPatched || typeof window === "undefined") return;
  historyPatched = true;

  for (const method of ["pushState", "replaceState"] as const) {
    const original = window.history[method];
    window.history[method] = function (this: History, ...args: Parameters<typeof original>) {
      const result = original.apply(this, args);
      window.dispatchEvent(new Event(HISTORY_EVENT));
      return result;
    };
  }
}

/** Options for `createUrlParams()`. */
export interface UrlParamsOptions<T extends Record<string, unknown> = Record<string, unknown>> {
  /** Provide initial params for SSR or testing (no window.location access). */
  initialParams?: T;
  /** Listen to popstate/navigation events. Default: true in browser. */
  listen?: boolean;
  /** Max nesting depth for parsed params. Default: 5. */
  depth?: number;
  /** Max number of params to parse. Default: 1000. */
  parameterLimit?: number;
  /** Array format hint. Default: auto-detect by qs. */
  arrayFormat?: "brackets" | "indices" | "comma" | "repeat";
}

/** Reactive URL search-params reader. Subscribe to be notified when the URL changes. */
export interface UrlParams<T extends Record<string, unknown> = Record<string, unknown>> extends Subscribable<T> {
  getSnapshot(): T;
  subscribe(callback: Listener): Unsubscribe;
  /** Re-read URL params (useful after programmatic navigation). */
  refresh(): void;
  /** Stop listening to browser events. */
  destroy(): void;
}

/** Parse a URL search string into a plain object using `qs`. */
export function parseSearch(search: string, options: UrlParamsOptions = {}): Record<string, unknown> {
  return qs.parse(search, {
    ignoreQueryPrefix: true,
    depth: options.depth ?? 5,
    parameterLimit: options.parameterLimit ?? 1000,
    comma: options.arrayFormat === "comma",
    allowDots: true,
  }) as Record<string, unknown>;
}

/**
 * Create a reactive URL search-params reader that notifies subscribers on navigation.
 * @example
 * const params = createUrlParams<{ filter: string }>()
 * params.subscribe(() => console.log(params.getSnapshot()))
 */
export function createUrlParams<T extends Record<string, unknown> = Record<string, unknown>>(
  options: UrlParamsOptions<T> = {},
): UrlParams<T> {
  const listeners = new Set<Listener>();
  const hasBrowser = typeof window !== "undefined";

  let snapshot = (options.initialParams
    ? { ...options.initialParams }
    : hasBrowser
      ? parseSearch(window.location.search, options)
      : {}) as T;

  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  let lastSearch = hasBrowser ? window.location.search : "";

  const refresh = () => {
    if (!hasBrowser) return;
    const currentSearch = window.location.search;
    if (currentSearch === lastSearch) return;
    lastSearch = currentSearch;
    const next = parseSearch(currentSearch, options) as T;
    if (!deepEqual(snapshot, next)) {
      snapshot = next;
      notify();
    }
  };

  const shouldListen = options.listen ?? hasBrowser;
  if (shouldListen && hasBrowser) {
    patchHistory();
    window.addEventListener("popstate", refresh);
    window.addEventListener(HISTORY_EVENT, refresh);
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (callback: Listener): Unsubscribe => {
      listeners.add(callback);
      return () => { listeners.delete(callback); };
    },
    refresh,
    destroy: () => {
      listeners.clear();
      if (hasBrowser) {
        window.removeEventListener("popstate", refresh);
        window.removeEventListener(HISTORY_EVENT, refresh);
      }
    },
  };
}
