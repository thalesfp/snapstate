import { bench, describe } from "vitest";
import { createStore } from "../src/core/store.js";
import { SubscriptionTrie } from "../src/core/trie.js";
import { applyUpdate } from "../src/core/structural.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDeepState(depth: number): Record<string, unknown> {
  let obj: Record<string, unknown> = { value: 0 };
  for (let i = depth - 1; i >= 0; i--) {
    obj = { [`k${i}`]: obj };
  }
  return obj;
}

function deepPath(depth: number): string {
  return Array.from({ length: depth }, (_, i) => `k${i}`)
    .concat("value")
    .join(".");
}

function buildWideState(width: number): Record<string, number> {
  const obj: Record<string, number> = {};
  for (let i = 0; i < width; i++) obj[`f${i}`] = i;
  return obj;
}

// ---------------------------------------------------------------------------
// Store: get / set
// ---------------------------------------------------------------------------

describe("store.get", () => {
  const store = createStore(buildDeepState(5));

  bench("shallow path (depth 1)", () => {
    store.get("k0");
  });

  bench("deep path (depth 5)", () => {
    store.get(deepPath(5));
  });

  bench("full snapshot", () => {
    store.getSnapshot();
  });
});

describe("store.set (autoBatch, no subscribers)", () => {
  const store = createStore({ count: 0 });

  bench("single shallow set", () => {
    store.set("count", (c: any) => c + 1);
  });
});

describe("store.set (depth comparison)", () => {
  const shallow = createStore({ value: 0 }, { autoBatch: false });
  const deep = createStore(buildDeepState(10), { autoBatch: false });
  const path10 = deepPath(10);

  bench("depth 1", () => {
    shallow.set("value", (v: any) => v + 1);
  });

  bench("depth 10", () => {
    deep.set(path10, (v: any) => v + 1);
  });
});

describe("store.batch", () => {
  const store = createStore(buildWideState(100), { autoBatch: false });
  const listener = () => {};
  for (let i = 0; i < 100; i++) store.subscribe(`f${i}`, listener);

  bench("batch 100 sets", () => {
    store.batch(() => {
      for (let i = 0; i < 100; i++) {
        store.set(`f${i}`, i);
      }
    });
  });

  bench("100 individual sets", () => {
    for (let i = 0; i < 100; i++) {
      store.set(`f${i}`, i);
    }
  });
});

// ---------------------------------------------------------------------------
// Subscription trie
// ---------------------------------------------------------------------------

describe("trie.notify (fan-out)", () => {
  const trie10 = new SubscriptionTrie();
  const trie1000 = new SubscriptionTrie();
  const noop = () => {};

  for (let i = 0; i < 10; i++) trie10.add(`root.child${i}`, noop);
  for (let i = 0; i < 1000; i++) trie1000.add(`root.child${i}`, noop);

  bench("notify parent with 10 child subscribers", () => {
    trie10.notify("root");
  });

  bench("notify parent with 1000 child subscribers", () => {
    trie1000.notify("root");
  });
});

describe("trie.notify (depth)", () => {
  const trieShallow = new SubscriptionTrie();
  const trieDeep = new SubscriptionTrie();
  const noop = () => {};

  trieShallow.add("a", noop);
  trieDeep.add("a.b.c.d.e.f.g.h", noop);

  bench("depth 1", () => {
    trieShallow.notify("a");
  });

  bench("depth 8", () => {
    trieDeep.notify("a.b.c.d.e.f.g.h");
  });
});

describe("trie.add/remove churn", () => {
  const trie = new SubscriptionTrie();
  const noop = () => {};

  bench("add + remove", () => {
    const unsub = trie.add("a.b.c", noop);
    unsub();
  });
});

// ---------------------------------------------------------------------------
// Structural sharing
// ---------------------------------------------------------------------------

describe("structural sharing", () => {
  const shallow = { a: 1, b: 2, c: 3 };
  const deep = buildDeepState(10);
  const wide = buildWideState(100);
  const path10 = deepPath(10);

  bench("shallow object (3 keys, depth 1)", () => {
    applyUpdate(shallow, "a", 99);
  });

  bench("deep object (depth 10)", () => {
    applyUpdate(deep, path10, 99);
  });

  bench("wide object (100 keys, depth 1)", () => {
    applyUpdate(wide, "f50", 99);
  });

  bench("no-op (same value)", () => {
    applyUpdate(shallow, "a", 1);
  });
});

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

describe("computed", () => {
  const store = createStore(
    { a: 1, b: 2, c: 3 },
    { autoBatch: false },
  );
  const sum = store.computed(["a", "b", "c"], (s) => s.a + s.b + s.c);

  bench("cache hit (no deps changed)", () => {
    sum.get();
  });

  bench("recompute after dep change", () => {
    store.set("a", (v: any) => v + 1);
    sum.get();
  });
});

// ---------------------------------------------------------------------------
// End-to-end: subscribe + set + notify
// ---------------------------------------------------------------------------

describe("e2e: set with subscribers", () => {
  const store = createStore(
    { x: 0, y: 0, z: 0 },
    { autoBatch: false },
  );
  let calls = 0;
  store.subscribe("x", () => { calls++; });

  bench("set + notify (1 subscriber)", () => {
    store.set("x", (v: any) => v + 1);
  });
});

describe("e2e: set with many subscribers", () => {
  const state = buildWideState(10);
  const store = createStore(state, { autoBatch: false });
  let calls = 0;
  // 100 subscribers on 10 different paths
  for (let i = 0; i < 10; i++) {
    for (let j = 0; j < 10; j++) {
      store.subscribe(`f${i}`, () => { calls++; });
    }
  }

  bench("set + notify (10 subscribers on path)", () => {
    store.set("f0", (v: any) => v + 1);
  });
});
