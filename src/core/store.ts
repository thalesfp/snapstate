import type {
  RawStore,
  StoreOptions,
  Listener,
  Unsubscribe,
  Updater,
  ComputedRef,
  GetByPath,
} from "./types.js";
import { SubscriptionTrie } from "./trie.js";
import { applyUpdate, getAtPath } from "./structural.js";
import { createComputed } from "./computed.js";

export function createStore<T extends object>(
  initialState: T,
  options: StoreOptions = {},
): RawStore<T> {
  const { autoBatch = true } = options;

  let state: T = initialState;
  const trie = new SubscriptionTrie();

  // Batching
  let batchDepth = 0;
  let pendingPaths = new Set<string>();
  let microtaskScheduled = false;

  function flushNotifications(): void {
    const paths = pendingPaths;
    pendingPaths = new Set();
    microtaskScheduled = false;

    if (paths.size === 0) { return; }

    // Deduplicate: if a parent path is present, skip its children
    const sorted = [...paths].sort();
    const deduped: string[] = [];
    for (const p of sorted) {
      const last = deduped[deduped.length - 1];
      if (last !== undefined && p.startsWith(last + ".")) { continue; }
      deduped.push(p);
    }

    for (const path of deduped) {
      trie.notify(path);
    }
  }

  function scheduleFlush(): void {
    if (batchDepth > 0) { return; }
    if (autoBatch && !microtaskScheduled) {
      microtaskScheduled = true;
      queueMicrotask(flushNotifications);
    } else if (!autoBatch) {
      flushNotifications();
    }
  }

  function get(): T;
  function get<P extends string>(path: P): GetByPath<T, P>;
  function get(path?: string): unknown {
    if (path === undefined || path === "") { return state; }
    return getAtPath(state, path);
  }

  function set<P extends string>(
    path: P,
    value: Updater<GetByPath<T, P>>,
  ): void {
    if (path === "") {
      throw new Error("Cannot set with an empty path. Use a specific path to update state.");
    }
    const prev = state;
    state = applyUpdate(state, path, value);
    if (state !== prev) {
      pendingPaths.add(path);
      scheduleFlush();
    }
  }

  function batch(fn: () => void): void {
    batchDepth++;
    try {
      fn();
    } finally {
      batchDepth--;
      if (batchDepth === 0) {
        flushNotifications();
      }
    }
  }

  function subscribe(callback: Listener): Unsubscribe;
  function subscribe(path: string, callback: Listener): Unsubscribe;
  function subscribe(
    pathOrCallback: string | Listener,
    callback?: Listener,
  ): Unsubscribe {
    if (typeof pathOrCallback === "function") {
      return trie.addGlobal(pathOrCallback);
    }
    return trie.add(pathOrCallback, callback!);
  }

  function getSnapshot(): T {
    return state;
  }

  function computed<V>(deps: (keyof T & string)[], fn: (state: T) => V): ComputedRef<V> {
    return createComputed<T, V>({ getSnapshot, subscribe }, deps, fn);
  }

  function notify(): void {
    trie.notifyAll();
  }

  function destroy(): void {
    trie.clear();
    pendingPaths.clear();
  }

  return {
    get,
    set,
    batch,
    subscribe,
    getSnapshot,
    computed,
    notify,
    destroy,
  } as RawStore<T>;
}
