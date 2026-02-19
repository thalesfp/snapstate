import { describe, it, expect } from "vitest";
import { SnapStore } from "../src/core/base.js";

interface TestState {
  nums: number[];
  items: { id: number; name: string; done: boolean }[];
  label: string;
}

class TestStore extends SnapStore<TestState, "load"> {
  constructor(state: TestState) {
    super(state);
  }

  async doFetch(key: "load", fn: () => Promise<void>) {
    return this.api.fetch(key, fn);
  }

  doAppend<P extends "nums" | "items">(path: P, ...items: any[]) {
    this.state.append(path, ...items);
  }

  doPrepend<P extends "nums" | "items">(path: P, ...items: any[]) {
    this.state.prepend(path, ...items);
  }

  doPatch<P extends "nums" | "items">(path: P, predicate: (item: any) => boolean, updates: any) {
    this.state.patch(path, predicate, updates);
  }

  doRemove<P extends "nums" | "items">(path: P, predicate: (item: any) => boolean) {
    this.state.remove(path, predicate);
  }

  doRemoveAt<P extends "nums" | "items">(path: P, index: number) {
    this.state.removeAt(path, index);
  }

  doInsertAt<P extends "nums" | "items">(path: P, index: number, ...items: any[]) {
    this.state.insertAt(path, index, ...items);
  }

  snapshot() {
    return this.getSnapshot();
  }
}

const defaultItems = () => [
  { id: 1, name: "a", done: false },
  { id: 2, name: "b", done: false },
  { id: 3, name: "c", done: true },
];

describe("array methods", () => {
  describe("append", () => {
    it("appends a single item", () => {
      const store = new TestStore({ nums: [1, 2], items: [], label: "" });
      store.doAppend("nums", 3);
      expect(store.snapshot().nums).toEqual([1, 2, 3]);
    });

    it("appends multiple items", () => {
      const store = new TestStore({ nums: [1, 2], items: [], label: "" });
      store.doAppend("nums", 3, 4);
      expect(store.snapshot().nums).toEqual([1, 2, 3, 4]);
    });

    it("works on empty array", () => {
      const store = new TestStore({ nums: [], items: [], label: "" });
      store.doAppend("nums", 1);
      expect(store.snapshot().nums).toEqual([1]);
    });
  });

  describe("prepend", () => {
    it("prepends a single item", () => {
      const store = new TestStore({ nums: [1, 2], items: [], label: "" });
      store.doPrepend("nums", 0);
      expect(store.snapshot().nums).toEqual([0, 1, 2]);
    });

    it("prepends multiple items preserving order", () => {
      const store = new TestStore({ nums: [1, 2], items: [], label: "" });
      store.doPrepend("nums", -1, 0);
      expect(store.snapshot().nums).toEqual([-1, 0, 1, 2]);
    });

    it("works on empty array", () => {
      const store = new TestStore({ nums: [], items: [], label: "" });
      store.doPrepend("nums", 1);
      expect(store.snapshot().nums).toEqual([1]);
    });
  });

  describe("patch", () => {
    it("patches matching items", () => {
      const store = new TestStore({ nums: [], items: defaultItems(), label: "" });
      store.doPatch("items", (t) => t.id === 2, { done: true });
      expect(store.snapshot().items[1]).toEqual({ id: 2, name: "b", done: true });
    });

    it("leaves non-matching items unchanged (reference equal)", () => {
      const items = defaultItems();
      const store = new TestStore({ nums: [], items, label: "" });
      store.doPatch("items", (t) => t.id === 2, { done: true });
      expect(store.snapshot().items[0]).toBe(items[0]);
      expect(store.snapshot().items[2]).toBe(items[2]);
    });

    it("patches all matching items", () => {
      const store = new TestStore({ nums: [], items: defaultItems(), label: "" });
      store.doPatch("items", (t) => !t.done, { done: true });
      expect(store.snapshot().items.every((t) => t.done)).toBe(true);
    });

    it("returns mapped array when nothing matches", () => {
      const items = defaultItems();
      const store = new TestStore({ nums: [], items, label: "" });
      store.doPatch("items", (t) => t.id === 99, { done: true });
      expect(store.snapshot().items).toEqual(items);
    });

    it("skips null items without crashing", () => {
      const items = [
        { id: 1, name: "a", done: false },
        null as any,
        { id: 3, name: "c", done: false },
      ];
      const store = new TestStore({ nums: [], items, label: "" });
      store.doPatch("items", (t) => t?.id === 3, { done: true });
      const result = store.snapshot().items;
      expect(result[0]).toEqual({ id: 1, name: "a", done: false });
      expect(result[1]).toBeNull();
      expect(result[2]).toEqual({ id: 3, name: "c", done: true });
    });
  });

  describe("patch prototype preservation", () => {
    it("preserves prototype chain on class instances", () => {
      class Todo {
        constructor(public id: number, public title: string, public done: boolean) {}
        toggle() { return !this.done; }
      }

      const items = [new Todo(1, "a", false), new Todo(2, "b", false)];
      const store = new TestStore({ nums: [], items: items as any, label: "" });
      store.doPatch("items", (t: any) => t.id === 1, { done: true });
      const patched = store.snapshot().items[0] as unknown as Todo;
      expect(patched).toBeInstanceOf(Todo);
      expect(patched.done).toBe(true);
      expect(patched.toggle()).toBe(false);
    });
  });

  describe("remove", () => {
    it("removes matching items", () => {
      const store = new TestStore({ nums: [1, 2, 3], items: [], label: "" });
      store.doRemove("nums", (n) => n === 2);
      expect(store.snapshot().nums).toEqual([1, 3]);
    });

    it("removes all matching items", () => {
      const store = new TestStore({ nums: [1, 2, 3, 4], items: [], label: "" });
      store.doRemove("nums", (n) => n % 2 === 0);
      expect(store.snapshot().nums).toEqual([1, 3]);
    });

    it("returns same content when nothing matches", () => {
      const store = new TestStore({ nums: [1, 2, 3], items: [], label: "" });
      store.doRemove("nums", (n) => n > 10);
      expect(store.snapshot().nums).toEqual([1, 2, 3]);
    });
  });

  describe("insertAt", () => {
    it("inserts at the beginning", () => {
      const store = new TestStore({ nums: [1, 2], items: [], label: "" });
      store.doInsertAt("nums", 0, 0);
      expect(store.snapshot().nums).toEqual([0, 1, 2]);
    });

    it("inserts in the middle", () => {
      const store = new TestStore({ nums: [1, 3], items: [], label: "" });
      store.doInsertAt("nums", 1, 2);
      expect(store.snapshot().nums).toEqual([1, 2, 3]);
    });

    it("inserts at the end", () => {
      const store = new TestStore({ nums: [1, 2], items: [], label: "" });
      store.doInsertAt("nums", 2, 3);
      expect(store.snapshot().nums).toEqual([1, 2, 3]);
    });

    it("inserts multiple items preserving order", () => {
      const store = new TestStore({ nums: [1, 4], items: [], label: "" });
      store.doInsertAt("nums", 1, 2, 3);
      expect(store.snapshot().nums).toEqual([1, 2, 3, 4]);
    });

    it("works on empty array", () => {
      const store = new TestStore({ nums: [], items: [], label: "" });
      store.doInsertAt("nums", 0, 1);
      expect(store.snapshot().nums).toEqual([1]);
    });
  });

  describe("removeAt", () => {
    it("removes by positive index", () => {
      const store = new TestStore({ nums: [1, 2, 3], items: [], label: "" });
      store.doRemoveAt("nums", 1);
      expect(store.snapshot().nums).toEqual([1, 3]);
    });

    it("removes by negative index", () => {
      const store = new TestStore({ nums: [1, 2, 3], items: [], label: "" });
      store.doRemoveAt("nums", -1);
      expect(store.snapshot().nums).toEqual([1, 2]);
    });

    it("throws RangeError for index beyond array length", () => {
      const store = new TestStore({ nums: [1, 2, 3], items: [], label: "" });
      expect(() => store.doRemoveAt("nums", 5)).toThrow(RangeError);
    });

    it("throws RangeError for negative index beyond array length", () => {
      const store = new TestStore({ nums: [1, 2, 3], items: [], label: "" });
      expect(() => store.doRemoveAt("nums", -4)).toThrow(RangeError);
    });

    it("throws RangeError on empty array", () => {
      const store = new TestStore({ nums: [], items: [], label: "" });
      expect(() => store.doRemoveAt("nums", 0)).toThrow(RangeError);
    });
  });

  describe("getStatus immutability", () => {
    it("returns a new object each call so mutations do not affect store", async () => {
      const store = new TestStore({ nums: [], items: [], label: "" });
      const s1 = store.getStatus("load");
      s1.status = "loading";
      const s2 = store.getStatus("load");
      expect(s2.status).toBe("idle");
    });

    it("does not leak internal reference after fetch", async () => {
      const store = new TestStore({ nums: [], items: [], label: "" });
      await store.doFetch("load", async () => {});
      const s1 = store.getStatus("load");
      s1.status = "error";
      const s2 = store.getStatus("load");
      expect(s2.status).toBe("ready");
    });
  });
});
