import { describe, it, expect, vi } from "vitest";
import { createStore } from "../src/core/store.js";
import { SnapStore, setHttpClient } from "../src/index.js";

describe("Store", () => {
  it("reads initial state", () => {
    const store = createStore({ count: 0, name: "test" });
    expect(store.get()).toEqual({ count: 0, name: "test" });
    expect(store.get("count")).toBe(0);
    expect(store.get("name")).toBe("test");
  });

  it("sets values by path", async () => {
    const store = createStore({ count: 0 });
    store.set("count", 5);
    expect(store.get("count")).toBe(5);
  });

  it("supports functional updaters", () => {
    const store = createStore({ count: 0 });
    store.set("count", ((prev: number) => prev + 1) as any);
    expect(store.get("count")).toBe(1);
  });

  it("returns immutable snapshots with structural sharing", () => {
    const store = createStore({ a: { x: 1 }, b: { y: 2 } });
    const snap1 = store.getSnapshot();
    store.set("a.x", 10);
    const snap2 = store.getSnapshot();

    expect(snap1).not.toBe(snap2);
    expect(snap1.b).toBe(snap2.b); // structural sharing
    expect(snap2.a.x).toBe(10);
  });

  describe("subscriptions with autoBatch (microtask)", () => {
    it("notifies path subscribers after microtask", async () => {
      const store = createStore({ count: 0 });
      const listener = vi.fn();
      store.subscribe("count", listener);

      store.set("count", 1);
      expect(listener).not.toHaveBeenCalled(); // not yet

      await Promise.resolve(); // flush microtask
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("coalesces multiple synchronous sets", async () => {
      const store = createStore({ a: 1, b: 2 });
      const listener = vi.fn();
      store.subscribe("a", listener);

      store.set("a", 10);
      store.set("a", 20);

      await Promise.resolve();
      // Deduplicated: same path "a" fires once
      expect(listener).toHaveBeenCalledTimes(1);
      expect(store.get("a")).toBe(20);
    });

    it("notifies global subscribers", async () => {
      const store = createStore({ x: 1 });
      const listener = vi.fn();
      store.subscribe(listener);

      store.set("x", 2);
      await Promise.resolve();
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("subscriptions without autoBatch", () => {
    it("notifies synchronously", () => {
      const store = createStore({ count: 0 }, { autoBatch: false });
      const listener = vi.fn();
      store.subscribe("count", listener);

      store.set("count", 1);
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("batch", () => {
    it("defers notifications until batch completes", () => {
      const store = createStore({ a: 1, b: 2 }, { autoBatch: false });
      const listenerA = vi.fn();
      const listenerB = vi.fn();
      store.subscribe("a", listenerA);
      store.subscribe("b", listenerB);

      store.batch(() => {
        store.set("a", 10);
        store.set("b", 20);
        expect(listenerA).not.toHaveBeenCalled();
        expect(listenerB).not.toHaveBeenCalled();
      });

      expect(listenerA).toHaveBeenCalledTimes(1);
      expect(listenerB).toHaveBeenCalledTimes(1);
    });

    it("deduplicates paths within batch", () => {
      const store = createStore({ count: 0 }, { autoBatch: false });
      const listener = vi.fn();
      store.subscribe("count", listener);

      store.batch(() => {
        store.set("count", 1);
        store.set("count", 2);
        store.set("count", 3);
      });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(store.get("count")).toBe(3);
    });

    it("deduplicates parent/child paths within batch", () => {
      const store = createStore(
        { user: { name: "a", age: 1 } },
        { autoBatch: false },
      );
      const listener = vi.fn();
      store.subscribe("user", listener);

      store.batch(() => {
        store.set("user.name", "b");
        store.set("user", { name: "c", age: 2 } as any);
      });

      // "user" subsumes "user.name", so only one notification
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  it("unsubscribes correctly", async () => {
    const store = createStore({ x: 1 });
    const listener = vi.fn();
    const unsub = store.subscribe("x", listener);

    unsub();
    store.set("x", 2);
    await Promise.resolve();
    expect(listener).not.toHaveBeenCalled();
  });

  it("destroy clears all subscriptions", async () => {
    const store = createStore({ x: 1 });
    const listener = vi.fn();
    store.subscribe("x", listener);

    store.destroy();
    store.set("x", 2);
    await Promise.resolve();
    expect(listener).not.toHaveBeenCalled();
  });

  it("throws when setting with empty path", () => {
    const store = createStore({ x: 1 });
    expect(() => store.set("" as any, 2)).toThrow("Cannot set with an empty path");
  });

  it("skips notification when set produces no state change", async () => {
    const store = createStore({ x: 1 }, { autoBatch: false });
    const listener = vi.fn();
    store.subscribe("x", listener);

    store.set("x", 1);
    expect(listener).not.toHaveBeenCalled();
  });

  it("skips notification for no-op functional updater", async () => {
    const store = createStore({ x: 1 }, { autoBatch: false });
    const listener = vi.fn();
    store.subscribe("x", listener);

    store.set("x", ((prev: number) => prev) as any);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("setHttpClient export", () => {
  it("is exported as a function from core entrypoint", () => {
    expect(typeof setHttpClient).toBe("function");
  });
});

describe("resetStatus", () => {
  class TestStore extends SnapStore<{ value: string }, "load" | "save"> {
    doFetch(key: "load" | "save", fn: () => Promise<void>) {
      return this.api.fetch(key, fn);
    }
  }

  it("resets a single operation back to idle", async () => {
    const store = new TestStore({ value: "" });
    await store.doFetch("load", async () => {});
    expect(store.getStatus("load").status.isReady).toBe(true);

    store.resetStatus("load");
    expect(store.getStatus("load").status.isIdle).toBe(true);
    expect(store.getStatus("load").error).toBeNull();
  });

  it("resets all operations when called without a key", async () => {
    const store = new TestStore({ value: "" });
    await store.doFetch("load", async () => {});
    await store.doFetch("save", async () => {});
    expect(store.getStatus("load").status.isReady).toBe(true);
    expect(store.getStatus("save").status.isReady).toBe(true);

    store.resetStatus();
    expect(store.getStatus("load").status.isIdle).toBe(true);
    expect(store.getStatus("save").status.isIdle).toBe(true);
  });

  it("notifies subscribers on reset", async () => {
    const store = new TestStore({ value: "" });
    await store.doFetch("load", async () => {});

    const listener = vi.fn();
    store.subscribe(listener);

    store.resetStatus("load");
    expect(listener).toHaveBeenCalled();
  });

  it("does not notify when resetting a key that was never used", () => {
    const store = new TestStore({ value: "" });
    const listener = vi.fn();
    store.subscribe(listener);

    store.resetStatus("load");
    expect(listener).not.toHaveBeenCalled();
  });

  it("does not notify when clearing already-empty operations", () => {
    const store = new TestStore({ value: "" });
    const listener = vi.fn();
    store.subscribe(listener);

    store.resetStatus();
    expect(listener).not.toHaveBeenCalled();
  });

  it("reset during in-flight fetch causes fetch to be silently ignored", async () => {
    const store = new TestStore({ value: "" });
    let resolve!: () => void;

    const fetchPromise = store.doFetch("load", () => new Promise<void>((r) => { resolve = r; }));
    expect(store.getStatus("load").status.isLoading).toBe(true);

    store.resetStatus("load");
    expect(store.getStatus("load").status.isIdle).toBe(true);

    resolve();
    await fetchPromise;
    expect(store.getStatus("load").status.isIdle).toBe(true);
  });

  it("stale request does not overwrite new request after reset", async () => {
    const store = new TestStore({ value: "" });
    let resolveOld!: () => void;
    let resolveNew!: () => void;

    const oldFetch = store.doFetch("load", () => new Promise<void>((r) => { resolveOld = r; }));
    store.resetStatus("load");
    const newFetch = store.doFetch("load", () => new Promise<void>((r) => { resolveNew = r; }));
    expect(store.getStatus("load").status.isLoading).toBe(true);

    resolveOld();
    await oldFetch;
    expect(store.getStatus("load").status.isLoading).toBe(true);

    resolveNew();
    await newFetch;
    expect(store.getStatus("load").status.isReady).toBe(true);
  });

  it("allows a fresh fetch cycle after reset", async () => {
    const store = new TestStore({ value: "" });
    await store.doFetch("load", async () => {});
    expect(store.getStatus("load").status.isReady).toBe(true);

    store.resetStatus("load");
    expect(store.getStatus("load").status.isIdle).toBe(true);

    const fetchPromise = store.doFetch("load", async () => {});
    expect(store.getStatus("load").status.isLoading).toBe(true);

    await fetchPromise;
    expect(store.getStatus("load").status.isReady).toBe(true);
  });
});

describe("SnapStore async race condition", () => {
  class TestStore extends SnapStore<{ value: string }, "op"> {
    doFetch(key: "op", fn: () => Promise<void>) {
      return this.api.fetch(key, fn);
    }
  }

  it("newer fetch wins when older resolves after newer", async () => {
    const store = new TestStore({ value: "" });
    let resolveOld!: () => void;
    let resolveNew!: () => void;

    const oldFetch = store.doFetch("op", () => new Promise<void>((r) => { resolveOld = r; }));
    const newFetch = store.doFetch("op", () => new Promise<void>((r) => { resolveNew = r; }));

    resolveNew();
    await newFetch;
    expect(store.getStatus("op").status.isReady).toBe(true);

    resolveOld();
    await oldFetch;
    expect(store.getStatus("op").status.isReady).toBe(true);
  });

  it("newer fetch wins when older rejects after newer resolves", async () => {
    const store = new TestStore({ value: "" });
    let rejectOld!: (e: Error) => void;
    let resolveNew!: () => void;

    const oldFetch = store.doFetch("op", () => new Promise<void>((_, r) => { rejectOld = r; }));
    const newFetch = store.doFetch("op", () => new Promise<void>((r) => { resolveNew = r; }));

    resolveNew();
    await newFetch;
    expect(store.getStatus("op").status.isReady).toBe(true);

    rejectOld(new Error("stale"));
    await oldFetch;
    expect(store.getStatus("op").status.isReady).toBe(true);
  });
});
