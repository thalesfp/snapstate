import type { ComputedRef } from "./types.js";
import { getAtSegments } from "./structural.js";

interface ComputedHost {
  getSnapshot(): object;
}

export function createComputed<T extends object, V>(
  host: ComputedHost,
  deps: string[],
  fn: (state: T) => V,
): ComputedRef<V> {
  let destroyed = false;

  const depSegments = deps.map((dep) => (dep === "" ? [] : dep.split(".")));
  const readDeps = (state: object): unknown[] => {
    return depSegments.map((segments) => getAtSegments(state, segments));
  };

  // Dep values are compared by reference on every get(). Structural sharing
  // guarantees a changed subtree gets a new reference, so reads stay fresh
  // even while notifications are deferred (autoBatch) or held by batch().
  const initial = host.getSnapshot();
  let cachedDepValues = readDeps(initial);
  let cachedValue = fn(initial as T);

  return {
    get(): V {
      if (destroyed) { return cachedValue; }

      const state = host.getSnapshot();
      let changed = false;
      for (let i = 0; i < depSegments.length; i++) {
        if (!Object.is(getAtSegments(state, depSegments[i]), cachedDepValues[i])) {
          changed = true;
          break;
        }
      }

      if (changed) {
        // Cached dep values update only after fn succeeds so a throwing fn retries
        cachedValue = fn(state as T);
        cachedDepValues = readDeps(state);
      }
      return cachedValue;
    },
    destroy(): void {
      destroyed = true;
    },
  };
}
