import { describe, it, expect, vi } from "vitest";
import { SnapStore } from "../src/core/base.js";
import type { Subscribable } from "../src/core/types.js";

class SourceStore extends SnapStore<{ value: number; other: string }> {
  setValue(v: number) {
    this.state.set("value", v);
  }

  setOther(v: string) {
    this.state.set("other", v);
  }
}

class DerivedStore extends SnapStore<{ mirrored: number; local: string }> {
  constructor(source: Subscribable<{ value: number; other: string }>) {
    super({ mirrored: 0, local: "untouched" });
    this.derive("mirrored", source, (s) => s.value);
  }
}

describe("derive", () => {
  it("writes initial value from source on construction", () => {
    const source = new SourceStore({ value: 42, other: "x" });
    const derived = new DerivedStore(source);

    expect(derived.getSnapshot().mirrored).toBe(42);
  });

  it("does not overwrite other local state", () => {
    const source = new SourceStore({ value: 1, other: "x" });
    const derived = new DerivedStore(source);

    expect(derived.getSnapshot().local).toBe("untouched");
  });

  it("propagates source changes after microtask flush", async () => {
    const source = new SourceStore({ value: 1, other: "x" });
    const derived = new DerivedStore(source);

    source.setValue(2);
    await Promise.resolve();

    expect(derived.getSnapshot().mirrored).toBe(2);
  });

  it("skips update when selected value is unchanged", async () => {
    const source = new SourceStore({ value: 1, other: "x" });
    const derived = new DerivedStore(source);

    // flush the initial derive write notification
    await Promise.resolve();

    const listener = vi.fn();
    derived.subscribe("mirrored", listener);

    source.setOther("y");
    await Promise.resolve();

    expect(listener).not.toHaveBeenCalled();
    expect(derived.getSnapshot().mirrored).toBe(1);
  });

  it("stops updating after destroy", async () => {
    const source = new SourceStore({ value: 1, other: "x" });
    const derived = new DerivedStore(source);

    derived.destroy();
    source.setValue(99);
    await Promise.resolve();

    expect(derived.getSnapshot().mirrored).toBe(1);
  });

  it("supports multiple derivations from different sources", async () => {
    class SecondSource extends SnapStore<{ name: string }> {
      setName(v: string) {
        this.state.set("name", v);
      }
    }

    class MultiDerived extends SnapStore<{ count: number; label: string }> {
      constructor(
        nums: Subscribable<{ value: number; other: string }>,
        names: Subscribable<{ name: string }>,
      ) {
        super({ count: 0, label: "" });
        this.derive("count", nums, (s) => s.value);
        this.derive("label", names, (s) => s.name);
      }
    }

    const nums = new SourceStore({ value: 10, other: "x" });
    const names = new SecondSource({ name: "hello" });
    const multi = new MultiDerived(nums, names);

    expect(multi.getSnapshot().count).toBe(10);
    expect(multi.getSnapshot().label).toBe("hello");

    nums.setValue(20);
    names.setName("world");
    await Promise.resolve();

    expect(multi.getSnapshot().count).toBe(20);
    expect(multi.getSnapshot().label).toBe("world");
  });

  it("batches derived updates from a single source flush", async () => {
    const source = new SourceStore({ value: 1, other: "x" });
    const derived = new DerivedStore(source);

    // flush the initial derive write notification
    await Promise.resolve();

    const listener = vi.fn();
    derived.subscribe(listener);

    source.setValue(2);
    source.setValue(3);
    await Promise.resolve();
    await Promise.resolve();

    expect(derived.getSnapshot().mirrored).toBe(3);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
