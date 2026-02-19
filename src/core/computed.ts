import type { ComputedRef, Listener, Unsubscribe } from "./types.js";

interface ComputedHost {
  getSnapshot(): object;
  subscribe(path: string, callback: Listener): Unsubscribe;
}

export function createComputed<T extends object, V>(
  host: ComputedHost,
  deps: string[],
  fn: (state: T) => V,
): ComputedRef<V> {
  let cachedValue: V;
  let dirty = true;
  const unsubs: Unsubscribe[] = [];

  const markDirty = () => {
    dirty = true;
  };

  for (const dep of deps) {
    unsubs.push(host.subscribe(dep, markDirty));
  }

  // Compute initial value; clean up subscriptions if it throws
  try {
    cachedValue = fn(host.getSnapshot() as T);
  } catch (e) {
    for (const unsub of unsubs) unsub();
    unsubs.length = 0;
    throw e;
  }
  dirty = false;

  return {
    get(): V {
      if (dirty) {
        cachedValue = fn(host.getSnapshot() as T);
        dirty = false;
      }
      return cachedValue;
    },
    destroy(): void {
      for (const unsub of unsubs) unsub();
      unsubs.length = 0;
    },
  };
}
