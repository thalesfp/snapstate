/**
 * Immutable update with structural sharing.
 * Only clones objects along the changed path; unchanged subtrees keep their references.
 */
export function applyUpdate<T extends object>(
  state: T,
  path: string,
  value: unknown,
): T {
  const segments = path.split(".");
  return updateAtPath(state, segments, 0, value) as T;
}

function updateAtPath(
  current: unknown,
  segments: string[],
  index: number,
  value: unknown,
): unknown {
  if (index === segments.length) {
    // Functional updater support
    if (typeof value === "function") {
      return (value as (prev: unknown) => unknown)(current);
    }
    return value;
  }

  const key = segments[index];

  if (Array.isArray(current)) {
    const i = Number(key);
    const next = updateAtPath(current[i], segments, index + 1, value);
    if (Object.is(next, current[i])) { return current; }
    const copy = current.slice();
    copy[i] = next;
    return copy;
  }

  if (current !== null && typeof current === "object") {
    const obj = current as Record<string, unknown>;
    const next = updateAtPath(obj[key], segments, index + 1, value);
    if (Object.is(next, obj[key])) { return current; }
    return { ...obj, [key]: next };
  }

  // Path doesn't exist yet: create an array for a numeric segment, else an object
  const next = updateAtPath(undefined, segments, index + 1, value);
  if (/^(0|[1-9]\d*)$/.test(key)) {
    const arr: unknown[] = [];
    arr[Number(key)] = next;
    return arr;
  }
  return { [key]: next };
}

/** Read a value at a pre-split path. */
export function getAtSegments(state: unknown, segments: string[]): unknown {
  let current = state;
  for (const seg of segments) {
    if (current === null || current === undefined) { return undefined; }
    current = (current as Record<string, unknown>)[seg];
  }
  return current;
}

/** Read a value at a dot-separated path. */
export function getAtPath(state: unknown, path: string): unknown {
  if (path === "") { return state; }
  return getAtSegments(state, path.split("."));
}

/**
 * Wrap a value for `set()`/`applyUpdate` so it is stored verbatim.
 * Without this, function values are invoked as updaters (the documented
 * `Updater` contract). Every internal writer that passes through raw values
 * (reset, merge, derive, API target writes, form.setValue) must use it.
 */
export function storedValue<V>(value: V): () => V {
  return () => value;
}
