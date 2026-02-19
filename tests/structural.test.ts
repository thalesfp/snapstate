import { describe, it, expect } from "vitest";
import { applyUpdate, getAtPath } from "../src/core/structural.js";

describe("structural sharing", () => {
  describe("applyUpdate", () => {
    it("updates a top-level property", () => {
      const state = { a: 1, b: 2 };
      const next = applyUpdate(state, "a", 10);
      expect(next).toEqual({ a: 10, b: 2 });
      expect(next).not.toBe(state);
    });

    it("preserves references for unchanged subtrees", () => {
      const nested = { x: 1 };
      const state = { a: nested, b: { y: 2 } };
      const next = applyUpdate(state, "b.y", 20);

      expect(next.a).toBe(nested); // unchanged, same reference
      expect(next.b).not.toBe(state.b); // changed
      expect(next.b.y).toBe(20);
    });

    it("handles deeply nested paths", () => {
      const state = { a: { b: { c: { d: 1 } } } };
      const next = applyUpdate(state, "a.b.c.d", 42);
      expect(next.a.b.c.d).toBe(42);
      expect(next).not.toBe(state);
      expect(next.a).not.toBe(state.a);
      expect(next.a.b).not.toBe(state.a.b);
      expect(next.a.b.c).not.toBe(state.a.b.c);
    });

    it("handles array updates", () => {
      const state = { items: [1, 2, 3] };
      const next = applyUpdate(state, "items.1", 20);
      expect(next.items).toEqual([1, 20, 3]);
      expect(next.items).not.toBe(state.items);
    });

    it("supports functional updaters", () => {
      const state = { count: 5 };
      const next = applyUpdate(state, "count", (prev: unknown) =>
        (prev as number) + 1,
      );
      expect(next.count).toBe(6);
    });

    it("returns same reference if value unchanged", () => {
      const state = { a: 1, b: { c: 2 } };
      const next = applyUpdate(state, "a", 1);
      expect(next).toBe(state);
    });

    it("creates intermediate objects for missing paths", () => {
      const state = {} as Record<string, unknown>;
      const next = applyUpdate(state, "a.b", 1);
      expect(next).toEqual({ a: { b: 1 } });
    });
  });

  describe("getAtPath", () => {
    it("returns full state for empty path", () => {
      const state = { a: 1 };
      expect(getAtPath(state, "")).toBe(state);
    });

    it("reads nested values", () => {
      const state = { a: { b: { c: 42 } } };
      expect(getAtPath(state, "a.b.c")).toBe(42);
    });

    it("returns undefined for missing paths", () => {
      const state = { a: 1 };
      expect(getAtPath(state, "b.c")).toBeUndefined();
    });

    it("reads array elements", () => {
      const state = { items: [10, 20, 30] };
      expect(getAtPath(state, "items.1")).toBe(20);
    });
  });
});
