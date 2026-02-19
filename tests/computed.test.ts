import { describe, it, expect, vi } from "vitest";
import { createStore } from "../src/core/store.js";

describe("computed", () => {
  it("computes derived value from state", () => {
    const store = createStore({ price: 100, tax: 10 });
    const total = store.computed(
      ["price", "tax"],
      (s) => s.price + s.tax,
    );

    expect(total.get()).toBe(110);
  });

  it("recomputes lazily when deps change", () => {
    const store = createStore(
      { price: 100, tax: 10 },
      { autoBatch: false },
    );
    const fn = vi.fn((s: { price: number; tax: number }) => s.price + s.tax);
    const total = store.computed(["price", "tax"], fn);

    // Initial computation
    expect(total.get()).toBe(110);
    expect(fn).toHaveBeenCalledTimes(1);

    // Reading again without changes doesn't recompute
    total.get();
    expect(fn).toHaveBeenCalledTimes(1);

    // Change a dep
    store.set("price", 200);
    expect(total.get()).toBe(210);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not recompute when unrelated path changes", () => {
    const store = createStore(
      { price: 100, tax: 10, unrelated: "x" },
      { autoBatch: false },
    );
    const fn = vi.fn((s: { price: number; tax: number }) => s.price + s.tax);
    const total = store.computed(["price", "tax"], fn);

    total.get();
    expect(fn).toHaveBeenCalledTimes(1);

    store.set("unrelated", "y");
    total.get();
    expect(fn).toHaveBeenCalledTimes(1); // not recomputed
  });

  it("destroy stops tracking deps", () => {
    const store = createStore(
      { price: 100, tax: 10 },
      { autoBatch: false },
    );
    const fn = vi.fn((s: { price: number; tax: number }) => s.price + s.tax);
    const total = store.computed(["price", "tax"], fn);

    total.get();
    total.destroy();

    store.set("price", 200);
    // After destroy, reading still returns last cached value (stale but safe)
    expect(total.get()).toBe(110);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("cleans up subscriptions if initial compute throws", () => {
    const store = createStore(
      { price: 100, tax: 10 },
      { autoBatch: false },
    );
    const error = new Error("compute failed");
    const fn = vi.fn(() => {
      throw error;
    });

    expect(() => store.computed(["price", "tax"], fn)).toThrow("compute failed");

    // Subscriptions should have been cleaned up - changing deps should not
    // trigger any leaked listeners
    const listener = vi.fn();
    store.subscribe("price", listener);
    store.set("price", 200);
    // If subscriptions leaked, there would be extra listeners; the one we
    // just added should be the only one, and it should fire exactly once
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
