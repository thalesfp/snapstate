/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, act as actTL, screen } from "@testing-library/react";
import { createElement, createRef, forwardRef, StrictMode } from "react";
import { SnapStore } from "../src/react/index.js";
import type { AsyncStatus } from "../src/react/index.js";

interface TestState {
  count: number;
  name: string;
}

class TestStore extends SnapStore<TestState> {
  constructor(initial?: Partial<TestState>) {
    super({ count: 0, name: "test", ...initial });
  }

  get count() {
    return this.state.get().count;
  }

  setCount(n: number) {
    this.state.set("count", n);
  }

  setName(n: string) {
    this.state.set("name", n);
  }
}

describe("connect", () => {
  it("injects mapped state as props", () => {
    const store = new TestStore();

    function Display({ count }: { count: number }) {
      return createElement("span", { "data-testid": "val" }, count);
    }

    const Connected = store.connect(Display, (s) => ({ count: s.count }));
    render(createElement(Connected));

    expect(screen.getByTestId("val").textContent).toBe("0");
  });

  it("re-renders when mapped state changes", async () => {
    const store = new TestStore();

    function Display({ count }: { count: number }) {
      return createElement("span", { "data-testid": "val" }, count);
    }

    const Connected = store.connect(Display, (s) => ({ count: s.count }));
    render(createElement(Connected));

    await actTL(async () => {
      store.setCount(5);
    });

    expect(screen.getByTestId("val").textContent).toBe("5");
  });

  it("does not re-render when unmapped state changes", async () => {
    const store = new TestStore();
    let renderCount = 0;

    function Display({ count }: { count: number }) {
      renderCount++;
      return createElement("span", { "data-testid": "val" }, count);
    }

    const Connected = store.connect(Display, (s) => ({ count: s.count }));
    render(createElement(Connected));

    const initialRenders = renderCount;

    await actTL(async () => {
      store.setName("changed");
    });

    expect(renderCount).toBe(initialRenders);
    expect(screen.getByTestId("val").textContent).toBe("0");
  });

  it("passes own props through", () => {
    const store = new TestStore();

    function Display({ count, label }: { count: number; label: string }) {
      return createElement("span", { "data-testid": "val" }, `${label}: ${count}`);
    }

    const Connected = store.connect(Display, (s) => ({ count: s.count }));
    render(createElement(Connected, { label: "Total" }));

    expect(screen.getByTestId("val").textContent).toBe("Total: 0");
  });

  it("works with computed values", async () => {
    class ComputedStore extends SnapStore<{ items: number[] }> {
      constructor() {
        super({ items: [1, 2, 3] });
      }

      get total() {
        return this.state.get().items.reduce((a, b) => a + b, 0);
      }

      addItem(n: number) {
        this.state.set("items", (prev) => [...prev, n]);
      }
    }

    const store = new ComputedStore();

    function Display({ total }: { total: number }) {
      return createElement("span", { "data-testid": "val" }, total);
    }

    const Connected = store.connect(Display, (s) => ({ total: s.total }));
    render(createElement(Connected));

    expect(screen.getByTestId("val").textContent).toBe("6");

    await actTL(async () => {
      store.addItem(4);
    });

    expect(screen.getByTestId("val").textContent).toBe("10");
  });

  it("does not infinite loop when selector returns derived arrays", async () => {
    interface FilterState {
      items: number[];
      showEven: boolean;
    }

    class FilterStore extends SnapStore<FilterState> {
      constructor() {
        super({ items: [1, 2, 3, 4], showEven: false });
      }

      get filtered(): number[] {
        const { items, showEven } = this.state.get();
        return showEven ? items.filter((n) => n % 2 === 0) : items;
      }

      toggleFilter() {
        this.state.set("showEven", (prev) => !prev);
      }
    }

    const store = new FilterStore();

    function Display({ filtered }: { filtered: number[] }) {
      return createElement("span", { "data-testid": "val" }, filtered.join(","));
    }

    const Connected = store.connect(Display, (s) => ({
      filtered: s.filtered,
    }));
    render(createElement(Connected));

    expect(screen.getByTestId("val").textContent).toBe("1,2,3,4");

    await actTL(async () => {
      store.toggleFilter();
    });

    expect(screen.getByTestId("val").textContent).toBe("2,4");
  });

  it("stays stable when unmapped state changes with derived array selectors", async () => {
    interface FilterState {
      items: number[];
      label: string;
    }

    class FilterStore extends SnapStore<FilterState> {
      constructor() {
        super({ items: [1, 2, 3], label: "test" });
      }

      get evenItems(): number[] {
        return this.state.get().items.filter((n) => n % 2 === 0);
      }

      setLabel(val: string) {
        this.state.set("label", val);
      }

      addItem(n: number) {
        this.state.set("items", (prev) => [...prev, n]);
      }
    }

    const store = new FilterStore();

    function Display({ evenItems }: { evenItems: number[] }) {
      return createElement("span", { "data-testid": "val" }, evenItems.join(","));
    }

    const Connected = store.connect(Display, (s) => ({
      evenItems: s.evenItems,
    }));
    render(createElement(Connected));

    expect(screen.getByTestId("val").textContent).toBe("2");

    // Changing unmapped field does not crash or infinite loop
    await actTL(async () => {
      store.setLabel("changed");
    });
    expect(screen.getByTestId("val").textContent).toBe("2");

    // Changing mapped field still updates correctly
    await actTL(async () => {
      store.addItem(4);
    });
    expect(screen.getByTestId("val").textContent).toBe("2,4");
  });

  it("handles rapid state changes with derived selectors", async () => {
    interface ListState {
      items: string[];
      filter: string;
    }

    class ListStore extends SnapStore<ListState> {
      constructor() {
        super({ items: ["apple", "banana", "avocado"], filter: "" });
      }

      get filtered(): string[] {
        const { items, filter } = this.state.get();
        return filter ? items.filter((i) => i.startsWith(filter)) : items;
      }

      setFilter(f: string) {
        this.state.set("filter", f);
      }
    }

    const store = new ListStore();

    function Display({ filtered }: { filtered: string[] }) {
      return createElement("span", { "data-testid": "val" }, filtered.join(","));
    }

    const Connected = store.connect(Display, (s) => ({
      filtered: s.filtered,
    }));
    render(createElement(Connected));

    expect(screen.getByTestId("val").textContent).toBe("apple,banana,avocado");

    await actTL(async () => {
      store.setFilter("a");
    });
    expect(screen.getByTestId("val").textContent).toBe("apple,avocado");

    await actTL(async () => {
      store.setFilter("b");
    });
    expect(screen.getByTestId("val").textContent).toBe("banana");

    await actTL(async () => {
      store.setFilter("");
    });
    expect(screen.getByTestId("val").textContent).toBe("apple,banana,avocado");
  });

  it("propagates operation status changes", async () => {
    interface SaveState {
      value: string;
    }

    class SaveStore extends SnapStore<SaveState> {
      constructor() {
        super({ value: "initial" });
      }

      get value() {
        return this.state.get().value;
      }

      save(promise: Promise<void>) {
        return this.api.fetch("save", async () => {
          await promise;
          this.state.set("value", "saved");
        });
      }
    }

    const store = new SaveStore();

    function Display({ value, status }: { value: string; status: AsyncStatus }) {
      return createElement(
        "div",
        null,
        createElement("span", { "data-testid": "value" }, value),
        createElement("span", { "data-testid": "status" }, status.value),
      );
    }

    const Connected = store.connect(Display, (s) => ({
      value: s.value,
      status: s.getStatus("save").status,
    }));

    render(createElement(Connected));
    expect(screen.getByTestId("status").textContent).toBe("idle");

    let resolveSave!: () => void;
    const savePromise = new Promise<void>((r) => {
      resolveSave = r;
    });

    await actTL(async () => {
      store.save(savePromise);
    });

    expect(screen.getByTestId("status").textContent).toBe("loading");
    expect(screen.getByTestId("value").textContent).toBe("initial");

    await actTL(async () => {
      resolveSave();
    });

    expect(screen.getByTestId("status").textContent).toBe("ready");
    expect(screen.getByTestId("value").textContent).toBe("saved");
  });
});

describe("connect with select", () => {
  interface NestedState {
    user: { name: string; avatar: string };
    settings: { theme: string };
  }

  class NestedStore extends SnapStore<NestedState> {
    constructor() {
      super({ user: { name: "Alice", avatar: "a.png" }, settings: { theme: "dark" } });
    }

    setName(n: string) {
      this.state.set("user.name", n);
    }

    setAvatar(a: string) {
      this.state.set("user.avatar", a);
    }

    setTheme(t: string) {
      this.state.set("settings.theme", t);
    }
  }

  it("injects correct props from picked paths", () => {
    const store = new NestedStore();

    function Display({ name, avatar }: { name: string; avatar: string }) {
      return createElement("span", { "data-testid": "val" }, `${name}:${avatar}`);
    }

    const Connected = store.connect(Display, {
      select: (pick) => ({
        name: pick("user.name"),
        avatar: pick("user.avatar"),
      }),
    });
    render(createElement(Connected));

    expect(screen.getByTestId("val").textContent).toBe("Alice:a.png");
  });

  it("re-renders when a picked path changes", async () => {
    const store = new NestedStore();

    function Display({ name }: { name: string }) {
      return createElement("span", { "data-testid": "val" }, name);
    }

    const Connected = store.connect(Display, {
      select: (pick) => ({ name: pick("user.name") }),
    });
    render(createElement(Connected));

    await actTL(async () => {
      store.setName("Bob");
    });

    expect(screen.getByTestId("val").textContent).toBe("Bob");
  });

  it("does not re-render when a non-picked path changes", async () => {
    const store = new NestedStore();
    let renderCount = 0;

    function Display({ name }: { name: string }) {
      renderCount++;
      return createElement("span", { "data-testid": "val" }, name);
    }

    const Connected = store.connect(Display, {
      select: (pick) => ({ name: pick("user.name") }),
    });
    render(createElement(Connected));
    const initialRenders = renderCount;

    await actTL(async () => {
      store.setTheme("light");
    });

    expect(renderCount).toBe(initialRenders);
    expect(screen.getByTestId("val").textContent).toBe("Alice");
  });

  it("shallow equality prevents re-render when values unchanged", async () => {
    const store = new NestedStore();
    let renderCount = 0;

    function Display({ name }: { name: string }) {
      renderCount++;
      return createElement("span", { "data-testid": "val" }, name);
    }

    const Connected = store.connect(Display, {
      select: (pick) => ({ name: pick("user.name") }),
    });
    render(createElement(Connected));
    const initialRenders = renderCount;

    await actTL(async () => {
      store.setName("Alice");
    });

    expect(renderCount).toBe(initialRenders);
  });

  it("passes own props through", () => {
    const store = new NestedStore();

    function Display({ name, label }: { name: string; label: string }) {
      return createElement("span", { "data-testid": "val" }, `${label}: ${name}`);
    }

    const Connected = store.connect(Display, {
      select: (pick) => ({ name: pick("user.name") }),
    });
    render(createElement(Connected, { label: "User" }));

    expect(screen.getByTestId("val").textContent).toBe("User: Alice");
  });
});

describe("connect with select + fetch", () => {
  interface NestedState {
    user: { name: string; avatar: string };
    settings: { theme: string };
  }

  class NestedStore extends SnapStore<NestedState> {
    constructor() {
      super({ user: { name: "Alice", avatar: "a.png" }, settings: { theme: "dark" } });
    }

    setName(n: string) {
      this.state.set("user.name", n);
    }

    setTheme(t: string) {
      this.state.set("settings.theme", t);
    }
  }

  it("transitions through idle -> loading -> ready with selected props", async () => {
    const store = new NestedStore();

    function Display({
      name,
      status,
      error,
    }: {
      name: string;
      status: AsyncStatus;
      error: string | null;
    }) {
      return createElement(
        "div",
        null,
        createElement("span", { "data-testid": "status" }, status.value),
        createElement("span", { "data-testid": "name" }, name),
      );
    }

    let resolveFetch!: () => void;
    const fetchPromise = new Promise<void>((r) => {
      resolveFetch = r;
    });

    const Connected = store.connect(Display, {
      select: (pick) => ({ name: pick("user.name") }),
      fetch: async () => {
        await fetchPromise;
      },
    });

    render(createElement(Connected));

    expect(screen.getByTestId("status").textContent).toBe("loading");
    expect(screen.getByTestId("name").textContent).toBe("Alice");

    await actTL(async () => {
      resolveFetch();
    });

    expect(screen.getByTestId("status").textContent).toBe("ready");
  });

  it("renders loading component during fetch", async () => {
    const store = new NestedStore();

    function Display({ name }: { name: string }) {
      return createElement("span", { "data-testid": "val" }, name);
    }

    function Loading() {
      return createElement("span", { "data-testid": "loading" }, "Loading...");
    }

    let resolveFetch!: () => void;
    const fetchPromise = new Promise<void>((r) => {
      resolveFetch = r;
    });

    const Connected = store.connect(Display, {
      select: (pick) => ({ name: pick("user.name") }),
      fetch: async () => {
        await fetchPromise;
      },
      loading: Loading,
    });

    render(createElement(Connected));

    expect(screen.getByTestId("loading").textContent).toBe("Loading...");
    expect(screen.queryByTestId("val")).toBeNull();

    await actTL(async () => {
      resolveFetch();
    });

    expect(screen.queryByTestId("loading")).toBeNull();
    expect(screen.getByTestId("val").textContent).toBe("Alice");
  });

  it("renders error component on fetch failure", async () => {
    const store = new NestedStore();

    function Display({ name }: { name: string }) {
      return createElement("span", { "data-testid": "val" }, name);
    }

    function ErrorDisplay({ error }: { error: string }) {
      return createElement("span", { "data-testid": "error" }, error);
    }

    const Connected = store.connect(Display, {
      select: (pick) => ({ name: pick("user.name") }),
      fetch: async () => {
        throw new Error("fail");
      },
      loading: () => createElement("span", { "data-testid": "loading" }, "Loading..."),
      error: ErrorDisplay,
    });

    render(createElement(Connected));

    expect(screen.getByTestId("loading")).toBeTruthy();

    await actTL(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(screen.getByTestId("error").textContent).toBe("fail");
    expect(screen.queryByTestId("val")).toBeNull();
  });

  it("falls back to wrapped component when loading/error not provided", async () => {
    const store = new NestedStore();

    function Display({
      name,
      status,
    }: {
      name: string;
      status: AsyncStatus;
    }) {
      return createElement(
        "div",
        null,
        createElement("span", { "data-testid": "status" }, status.value),
        createElement("span", { "data-testid": "name" }, name),
      );
    }

    let resolveFetch!: () => void;
    const fetchPromise = new Promise<void>((r) => {
      resolveFetch = r;
    });

    const Connected = store.connect(Display, {
      select: (pick) => ({ name: pick("user.name") }),
      fetch: async () => {
        await fetchPromise;
      },
    });

    render(createElement(Connected));

    expect(screen.getByTestId("status").textContent).toBe("loading");
    expect(screen.getByTestId("name").textContent).toBe("Alice");

    await actTL(async () => {
      resolveFetch();
    });

    expect(screen.getByTestId("status").textContent).toBe("ready");
  });

  it("selected props still have granular reactivity during ready state", async () => {
    const store = new NestedStore();
    let renderCount = 0;

    function Display({ name }: { name: string }) {
      renderCount++;
      return createElement("span", { "data-testid": "val" }, name);
    }

    const Connected = store.connect(Display, {
      select: (pick) => ({ name: pick("user.name") }),
      fetch: async () => {},
    });

    render(createElement(Connected));
    await actTL(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const rendersAfterReady = renderCount;

    await actTL(async () => {
      store.setTheme("light");
    });
    expect(renderCount).toBe(rendersAfterReady);

    await actTL(async () => {
      store.setName("Bob");
    });
    expect(screen.getByTestId("val").textContent).toBe("Bob");
  });

  it("setup fires on mount with select config", async () => {
    const store = new NestedStore();
    const setupSpy = vi.fn();

    function Display({ name }: { name: string }) {
      return createElement("span", { "data-testid": "val" }, name);
    }

    const Connected = store.connect(Display, {
      select: (pick) => ({ name: pick("user.name") }),
      setup: setupSpy,
    });

    render(createElement(Connected));
    await actTL(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(setupSpy).toHaveBeenCalledOnce();
  });

  it("cleanup fires on unmount with select config", async () => {
    const store = new NestedStore();
    const cleanupSpy = vi.fn();

    function Display({ name }: { name: string }) {
      return createElement("span", { "data-testid": "val" }, name);
    }

    const Connected = store.connect(Display, {
      select: (pick) => ({ name: pick("user.name") }),
      cleanup: cleanupSpy,
    });

    const { unmount } = render(createElement(Connected));
    expect(cleanupSpy).not.toHaveBeenCalled();
    unmount();
    await new Promise((r) => setTimeout(r, 0));
    expect(cleanupSpy).toHaveBeenCalledOnce();
  });

  it("setup runs before fetch with select config", async () => {
    const store = new NestedStore();
    const order: string[] = [];

    function Display({ name }: { name: string }) {
      return createElement("span", { "data-testid": "val" }, name);
    }

    const Connected = store.connect(Display, {
      select: (pick) => ({ name: pick("user.name") }),
      setup: () => { order.push("setup"); },
      fetch: async () => { order.push("fetch"); },
    });

    render(createElement(Connected));
    await actTL(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(order).toEqual(["setup", "fetch"]);
  });
});

describe("connect with fetch", () => {
  it("transitions through idle -> loading -> ready", async () => {
    const store = new TestStore();

    function Display({
      count,
      status,
      error,
    }: {
      count: number;
      status: AsyncStatus;
      error: string | null;
    }) {
      return createElement(
        "div",
        null,
        createElement("span", { "data-testid": "status" }, status.value),
        createElement("span", { "data-testid": "error" }, error ?? ""),
        createElement("span", { "data-testid": "count" }, count),
      );
    }

    let resolveFetch!: () => void;
    const fetchPromise = new Promise<void>((r) => {
      resolveFetch = r;
    });

    const Connected = store.connect(Display, {
      props: (s) => ({ count: s.count }),
      fetch: async (s) => {
        await fetchPromise;
        s.setCount(42);
      },
    });

    render(createElement(Connected));

    expect(screen.getByTestId("status").textContent).toBe("loading");
    expect(screen.getByTestId("error").textContent).toBe("");

    await actTL(async () => {
      resolveFetch();
    });

    expect(screen.getByTestId("status").textContent).toBe("ready");
    expect(screen.getByTestId("count").textContent).toBe("42");
  });

  it("sets status to error when fetch rejects", async () => {
    const store = new TestStore();

    function Display({
      status,
      error,
    }: {
      count: number;
      status: AsyncStatus;
      error: string | null;
    }) {
      return createElement(
        "div",
        null,
        createElement("span", { "data-testid": "status" }, status.value),
        createElement("span", { "data-testid": "error" }, error ?? ""),
      );
    }

    const Connected = store.connect(Display, {
      props: (s) => ({ count: s.count }),
      fetch: async () => {
        throw new Error("Network failure");
      },
    });

    await actTL(async () => {
      render(createElement(Connected));
    });

    expect(screen.getByTestId("status").textContent).toBe("error");
    expect(screen.getByTestId("error").textContent).toBe("Network failure");
  });

  it("calls fetch only once", async () => {
    const store = new TestStore();
    let fetchCount = 0;

    function Display({ status }: { count: number; status: AsyncStatus; error: string | null }) {
      return createElement("span", { "data-testid": "status" }, status.value);
    }

    const Connected = store.connect(Display, {
      props: (s) => ({ count: s.count }),
      fetch: async () => {
        fetchCount++;
      },
    });

    const { rerender } = render(createElement(Connected));

    await actTL(async () => {});

    rerender(createElement(Connected));
    await actTL(async () => {});

    expect(fetchCount).toBe(1);
  });

  it("renders loading component during fetch", async () => {
    const store = new TestStore();

    let resolveFetch!: () => void;
    const fetchPromise = new Promise<void>((r) => {
      resolveFetch = r;
    });

    function Display({ count }: { count: number }) {
      return createElement("span", { "data-testid": "val" }, count);
    }

    function Loading() {
      return createElement("span", { "data-testid": "loading" }, "Loading...");
    }

    const Connected = store.connect(Display, {
      props: (s) => ({ count: s.count }),
      fetch: async (s) => {
        await fetchPromise;
        s.setCount(99);
      },
      loading: Loading,
    });

    render(createElement(Connected));

    expect(screen.getByTestId("loading").textContent).toBe("Loading...");
    expect(screen.queryByTestId("val")).toBeNull();

    await actTL(async () => {
      resolveFetch();
    });

    expect(screen.queryByTestId("loading")).toBeNull();
    expect(screen.getByTestId("val").textContent).toBe("99");
  });

  it("renders error component on fetch failure", async () => {
    const store = new TestStore();

    function Display({ count }: { count: number }) {
      return createElement("span", { "data-testid": "val" }, count);
    }

    function ErrorDisplay({ error }: { error: string }) {
      return createElement("span", { "data-testid": "err" }, error);
    }

    const Connected = store.connect(Display, {
      props: (s) => ({ count: s.count }),
      fetch: async () => {
        throw new Error("Boom");
      },
      error: ErrorDisplay,
    });

    await actTL(async () => {
      render(createElement(Connected));
    });

    expect(screen.getByTestId("err").textContent).toBe("Boom");
    expect(screen.queryByTestId("val")).toBeNull();
  });

  it("falls back to wrapped component when loading/error not provided", async () => {
    const store = new TestStore();

    function Display({
      count,
      status,
    }: {
      count: number;
      status: AsyncStatus;
      error: string | null;
    }) {
      return createElement(
        "div",
        null,
        createElement("span", { "data-testid": "status" }, status.value),
        createElement("span", { "data-testid": "count" }, count),
      );
    }

    let resolveFetch!: () => void;
    const fetchPromise = new Promise<void>((r) => {
      resolveFetch = r;
    });

    const Connected = store.connect(Display, {
      props: (s) => ({ count: s.count }),
      fetch: async (s) => {
        await fetchPromise;
        s.setCount(7);
      },
    });

    render(createElement(Connected));

    expect(screen.getByTestId("status").textContent).toBe("loading");
    expect(screen.getByTestId("count").textContent).toBe("0");

    await actTL(async () => {
      resolveFetch();
    });

    expect(screen.getByTestId("status").textContent).toBe("ready");
    expect(screen.getByTestId("count").textContent).toBe("7");
  });

  it("calls fetch only once in StrictMode", async () => {
    const store = new TestStore();
    const fetchSpy = vi.fn(async () => {});

    function Display({ count, status }: { count: number; status: AsyncStatus; error: string | null }) {
      return createElement("span", { "data-testid": "status" }, status.value);
    }

    const Connected = store.connect(Display, {
      props: (s) => ({ count: s.count }),
      fetch: fetchSpy,
    });

    await actTL(async () => {
      render(createElement(StrictMode, null, createElement(Connected)));
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("resolves fetch in StrictMode without deadlock", async () => {
    const store = new TestStore();

    function Display({
      count,
      status,
    }: {
      count: number;
      status: AsyncStatus;
      error: string | null;
    }) {
      return createElement(
        "div",
        null,
        createElement("span", { "data-testid": "status" }, status.value),
        createElement("span", { "data-testid": "count" }, count),
      );
    }

    let resolveFetch!: () => void;
    const fetchPromise = new Promise<void>((r) => {
      resolveFetch = r;
    });

    const Connected = store.connect(Display, {
      props: (s) => ({ count: s.count }),
      fetch: async (s) => {
        await fetchPromise;
        s.setCount(10);
      },
    });

    render(createElement(StrictMode, null, createElement(Connected)));

    expect(screen.getByTestId("status").textContent).toBe("loading");

    await actTL(async () => {
      resolveFetch();
    });

    expect(screen.getByTestId("status").textContent).toBe("ready");
    expect(screen.getByTestId("count").textContent).toBe("10");
  });

  it("forwards ref to the wrapped component", () => {
    const store = new TestStore();

    const Inner = forwardRef<HTMLSpanElement, { count: number }>(function Inner({ count }, ref) {
      return createElement("span", { ref, "data-testid": "val" }, count);
    });

    const Connected = store.connect(Inner, (s) => ({ count: s.count }));
    const ref = createRef<HTMLSpanElement>();
    render(createElement(Connected, { ref }));

    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
    expect(ref.current!.textContent).toBe("0");
  });

  it("does not inject status/error without fetch config", () => {
    const store = new TestStore();

    function Display(props: { count: number }) {
      return createElement(
        "span",
        { "data-testid": "keys" },
        Object.keys(props).sort().join(","),
      );
    }

    const Connected = store.connect(Display, (s) => ({ count: s.count }));
    render(createElement(Connected));

    expect(screen.getByTestId("keys").textContent).toBe("count");
  });
});

describe("connect cleanup", () => {
  it("cleanup fires on unmount", async () => {
    const store = new TestStore();
    const cleanupSpy = vi.fn();

    function Inner({ count }: { count: number }) {
      return createElement("span", null, count);
    }

    const Connected = store.connect(Inner, {
      props: (s) => ({ count: s.count }),
      cleanup: cleanupSpy,
    });

    const { unmount } = render(createElement(Connected));
    expect(cleanupSpy).not.toHaveBeenCalled();
    unmount();
    await new Promise((r) => setTimeout(r, 0));
    expect(cleanupSpy).toHaveBeenCalledOnce();
  });

  it("cleanup receives the store instance", async () => {
    const store = new TestStore();
    let receivedStore: unknown;

    function Inner({ count }: { count: number }) {
      return createElement("span", null, count);
    }

    const Connected = store.connect(Inner, {
      props: (s) => ({ count: s.count }),
      cleanup: (s) => { receivedStore = s; },
    });

    const { unmount } = render(createElement(Connected));
    unmount();
    await new Promise((r) => setTimeout(r, 0));
    expect(receivedStore).toBe(store);
  });

  it("cleanup works alongside fetch", async () => {
    const store = new TestStore();
    const cleanupSpy = vi.fn();
    const fetchSpy = vi.fn().mockResolvedValue(undefined);

    function Inner({ count }: { count: number }) {
      return createElement("span", null, count);
    }

    const Connected = store.connect(Inner, {
      props: (s) => ({ count: s.count }),
      fetch: fetchSpy,
      cleanup: cleanupSpy,
    });

    const { unmount } = render(createElement(Connected));
    await actTL(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(cleanupSpy).not.toHaveBeenCalled();
    unmount();
    await new Promise((r) => setTimeout(r, 0));
    expect(cleanupSpy).toHaveBeenCalledOnce();
  });

  it("config without cleanup still works", async () => {
    const store = new TestStore();
    const fetchSpy = vi.fn().mockResolvedValue(undefined);

    function Inner({ count }: { count: number }) {
      return createElement("span", null, count);
    }

    const Connected = store.connect(Inner, {
      props: (s) => ({ count: s.count }),
      fetch: fetchSpy,
    });

    const { unmount } = render(createElement(Connected));
    await actTL(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(fetchSpy).toHaveBeenCalledOnce();
    unmount();
  });

  it("cleanup fires only once in StrictMode", async () => {
    const store = new TestStore();
    const cleanupSpy = vi.fn();

    function Inner({ count }: { count: number }) {
      return createElement("span", null, count);
    }

    const Connected = store.connect(Inner, {
      props: (s) => ({ count: s.count }),
      cleanup: cleanupSpy,
    });

    const { unmount } = render(
      createElement(StrictMode, null, createElement(Connected)),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(cleanupSpy).not.toHaveBeenCalled();
    unmount();
    await new Promise((r) => setTimeout(r, 0));
    expect(cleanupSpy).toHaveBeenCalledOnce();
  });
});

describe("connect setup", () => {
  it("setup fires on mount", async () => {
    const store = new TestStore();
    const setupSpy = vi.fn();

    function Inner({ count }: { count: number }) {
      return createElement("span", null, count);
    }

    const Connected = store.connect(Inner, {
      props: (s) => ({ count: s.count }),
      setup: setupSpy,
    });

    render(createElement(Connected));
    await actTL(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(setupSpy).toHaveBeenCalledOnce();
  });

  it("setup receives the store instance", async () => {
    const store = new TestStore();
    let receivedStore: unknown;

    function Inner({ count }: { count: number }) {
      return createElement("span", null, count);
    }

    const Connected = store.connect(Inner, {
      props: (s) => ({ count: s.count }),
      setup: (s) => { receivedStore = s; },
    });

    render(createElement(Connected));
    await actTL(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(receivedStore).toBe(store);
  });

  it("setup runs before fetch", async () => {
    const store = new TestStore();
    const order: string[] = [];

    function Inner({ count }: { count: number }) {
      return createElement("span", null, count);
    }

    const Connected = store.connect(Inner, {
      props: (s) => ({ count: s.count }),
      setup: () => { order.push("setup"); },
      fetch: async () => { order.push("fetch"); },
    });

    render(createElement(Connected));
    await actTL(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(order).toEqual(["setup", "fetch"]);
  });

  it("setup works without fetch", async () => {
    const store = new TestStore();
    const setupSpy = vi.fn();

    function Inner({ count }: { count: number }) {
      return createElement("span", null, count);
    }

    const Connected = store.connect(Inner, {
      props: (s) => ({ count: s.count }),
      setup: setupSpy,
    });

    render(createElement(Connected));
    await actTL(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(setupSpy).toHaveBeenCalledOnce();
  });

  it("setup and cleanup pair together", async () => {
    const store = new TestStore();
    const setupSpy = vi.fn();
    const cleanupSpy = vi.fn();

    function Inner({ count }: { count: number }) {
      return createElement("span", null, count);
    }

    const Connected = store.connect(Inner, {
      props: (s) => ({ count: s.count }),
      setup: setupSpy,
      cleanup: cleanupSpy,
    });

    const { unmount } = render(createElement(Connected));
    await actTL(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(setupSpy).toHaveBeenCalledOnce();
    expect(cleanupSpy).not.toHaveBeenCalled();
    unmount();
    await new Promise((r) => setTimeout(r, 0));
    expect(cleanupSpy).toHaveBeenCalledOnce();
  });

  it("setup fires only once in StrictMode", async () => {
    const store = new TestStore();
    const setupSpy = vi.fn();
    const cleanupSpy = vi.fn();

    function Inner({ count }: { count: number }) {
      return createElement("span", null, count);
    }

    const Connected = store.connect(Inner, {
      props: (s) => ({ count: s.count }),
      setup: setupSpy,
      cleanup: cleanupSpy,
    });

    const { unmount } = render(
      createElement(StrictMode, null, createElement(Connected)),
    );
    await actTL(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(setupSpy).toHaveBeenCalledOnce();
    expect(cleanupSpy).not.toHaveBeenCalled();
    unmount();
    await new Promise((r) => setTimeout(r, 0));
    expect(cleanupSpy).toHaveBeenCalledOnce();
  });
});

describe("connect deps", () => {
  it("re-runs fetch when deps change", async () => {
    const store = new TestStore();
    const fetchSpy = vi.fn(async () => {});

    function Display({ count }: { count: number; status: AsyncStatus; error: string | null }) {
      return createElement("span", null, count);
    }

    const Connected = store.connect(Display, {
      props: (s) => ({ count: s.count }),
      fetch: fetchSpy,
      deps: (props) => [props.id],
    });

    const { rerender } = render(createElement(Connected, { id: "1" } as any));
    await actTL(async () => {});
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    rerender(createElement(Connected, { id: "2" } as any));
    await actTL(async () => {});
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("does not re-run fetch when deps are unchanged", async () => {
    const store = new TestStore();
    const fetchSpy = vi.fn(async () => {});

    function Display({ count }: { count: number; status: AsyncStatus; error: string | null }) {
      return createElement("span", null, count);
    }

    const Connected = store.connect(Display, {
      props: (s) => ({ count: s.count }),
      fetch: fetchSpy,
      deps: (props) => [props.id],
    });

    const { rerender } = render(createElement(Connected, { id: "1" } as any));
    await actTL(async () => {});
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    rerender(createElement(Connected, { id: "1" } as any));
    await actTL(async () => {});
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("passes ownProps to fetch callback", async () => {
    const store = new TestStore();
    const receivedProps: Record<string, unknown>[] = [];

    function Display({ count }: { count: number; status: AsyncStatus; error: string | null }) {
      return createElement("span", null, count);
    }

    const Connected = store.connect(Display, {
      props: (s) => ({ count: s.count }),
      fetch: async (_s, props) => { receivedProps.push({ ...props }); },
      deps: (props) => [props.id],
    });

    render(createElement(Connected, { id: "abc" } as any));
    await actTL(async () => {});

    expect(receivedProps).toHaveLength(1);
    expect(receivedProps[0].id).toBe("abc");
  });

  it("runs cleanup between dep changes", async () => {
    const store = new TestStore();
    const cleanupSpy = vi.fn();

    function Display({ count }: { count: number }) {
      return createElement("span", null, count);
    }

    const Connected = store.connect(Display, {
      props: (s) => ({ count: s.count }),
      setup: () => {},
      cleanup: cleanupSpy,
      deps: (props) => [props.id],
    });

    const { rerender } = render(createElement(Connected, { id: "1" } as any));
    await actTL(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(cleanupSpy).not.toHaveBeenCalled();

    rerender(createElement(Connected, { id: "2" } as any));
    await actTL(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(cleanupSpy).toHaveBeenCalledTimes(1);
  });

  it("passes ownProps to setup and cleanup", async () => {
    const store = new TestStore();
    const setupProps: Record<string, unknown>[] = [];
    const cleanupProps: Record<string, unknown>[] = [];

    function Display({ count }: { count: number }) {
      return createElement("span", null, count);
    }

    const Connected = store.connect(Display, {
      props: (s) => ({ count: s.count }),
      setup: (_s, props) => { setupProps.push({ ...props }); },
      cleanup: (_s, props) => { cleanupProps.push({ ...props }); },
      deps: (props) => [props.id],
    });

    const { unmount } = render(createElement(Connected, { id: "1" } as any));
    await actTL(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(setupProps).toHaveLength(1);
    expect(setupProps[0].id).toBe("1");

    unmount();
    await actTL(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(cleanupProps).toHaveLength(1);
    expect(cleanupProps[0].id).toBe("1");
  });

  it("cleanup-only config fires on dep changes", async () => {
    const store = new TestStore();
    const cleanupSpy = vi.fn();

    function Display({ count }: { count: number }) {
      return createElement("span", null, count);
    }

    const Connected = store.connect(Display, {
      props: (s) => ({ count: s.count }),
      cleanup: cleanupSpy,
      deps: (props) => [props.id],
    });

    const { rerender } = render(createElement(Connected, { id: "1" } as any));
    await actTL(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(cleanupSpy).not.toHaveBeenCalled();

    rerender(createElement(Connected, { id: "2" } as any));
    await actTL(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(cleanupSpy).toHaveBeenCalledTimes(1);
  });

  it("cleanup-only with deps does not fire in StrictMode probe", async () => {
    const store = new TestStore();
    const cleanupSpy = vi.fn();

    function Display({ count }: { count: number }) {
      return createElement("span", null, count);
    }

    const Connected = store.connect(Display, {
      props: (s) => ({ count: s.count }),
      cleanup: cleanupSpy,
      deps: (props) => [props.id],
    });

    render(createElement(StrictMode, null, createElement(Connected, { id: "1" } as any)));
    await actTL(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(cleanupSpy).not.toHaveBeenCalled();
  });
});
