/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, act as actTL, screen } from "@testing-library/react";
import { createElement, Component, StrictMode } from "react";
import { SnapStore, connect } from "../src/react/index.js";
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

  get name() {
    return this.state.get().name;
  }

  setCount(n: number) {
    this.state.set("count", n);
  }

  setName(n: string) {
    this.state.set("name", n);
  }
}

interface NestedState {
  user: { name: string; age: number };
  items: string[];
}

class NestedStore extends SnapStore<NestedState> {
  constructor() {
    super({ user: { name: "Alice", age: 30 }, items: ["a", "b"] });
  }

  setUserName(n: string) {
    this.state.set("user.name", n);
  }

  setAge(n: number) {
    this.state.set("user.age", n);
  }
}

describe("connect decorator", () => {
  describe("simple mapper", () => {
    it("injects mapped state as props", () => {
      const store = new TestStore();

      @connect(store, (s) => ({ count: s.count }))
      class Display extends Component<{ count: number }> {
        render() {
          return createElement("span", { "data-testid": "val" }, this.props.count);
        }
      }

      render(createElement(Display));
      expect(screen.getByTestId("val").textContent).toBe("0");
    });

    it("re-renders when mapped state changes", async () => {
      const store = new TestStore();

      @connect(store, (s) => ({ count: s.count }))
      class Display extends Component<{ count: number }> {
        render() {
          return createElement("span", { "data-testid": "val" }, this.props.count);
        }
      }

      render(createElement(Display));

      await actTL(async () => {
        store.setCount(42);
      });

      expect(screen.getByTestId("val").textContent).toBe("42");
    });

    it("does not re-render when unmapped state changes", async () => {
      const store = new TestStore();
      let renderCount = 0;

      @connect(store, (s) => ({ count: s.count }))
      class Display extends Component<{ count: number }> {
        render() {
          renderCount++;
          return createElement("span", { "data-testid": "val" }, this.props.count);
        }
      }

      render(createElement(Display));
      const initialRenders = renderCount;

      await actTL(async () => {
        store.setName("changed");
      });

      expect(renderCount).toBe(initialRenders);
    });

    it("passes through own props alongside mapped props", () => {
      const store = new TestStore();

      @connect(store, (s) => ({ count: s.count }))
      class Display extends Component<{ count: number; label: string }> {
        render() {
          return createElement("span", { "data-testid": "val" }, `${this.props.label}:${this.props.count}`);
        }
      }

      render(createElement(Display, { label: "items" }));
      expect(screen.getByTestId("val").textContent).toBe("items:0");
    });

    it("handles multiple mapped props", async () => {
      const store = new TestStore();

      @connect(store, (s) => ({ count: s.count, name: s.name }))
      class Display extends Component<{ count: number; name: string }> {
        render() {
          return createElement("span", { "data-testid": "val" }, `${this.props.name}:${this.props.count}`);
        }
      }

      render(createElement(Display));
      expect(screen.getByTestId("val").textContent).toBe("test:0");

      await actTL(async () => {
        store.setCount(5);
        store.setName("hello");
      });

      expect(screen.getByTestId("val").textContent).toBe("hello:5");
    });

    it("does not inject status/error without fetch config", () => {
      const store = new TestStore();

      @connect(store, (s) => ({ count: s.count }))
      class Display extends Component<{ count: number }> {
        render() {
          return createElement(
            "span",
            { "data-testid": "keys" },
            Object.keys(this.props).sort().join(","),
          );
        }
      }

      render(createElement(Display));
      expect(screen.getByTestId("keys").textContent).toBe("count");
    });
  });

  describe("props config", () => {
    it("injects props via config object", () => {
      const store = new TestStore();

      @connect(store, {
        props: (s) => ({ count: s.count }),
      })
      class Display extends Component<{ count: number }> {
        render() {
          return createElement("span", { "data-testid": "val" }, this.props.count);
        }
      }

      render(createElement(Display));
      expect(screen.getByTestId("val").textContent).toBe("0");
    });

    it("re-renders on state change with props config", async () => {
      const store = new TestStore();

      @connect(store, {
        props: (s) => ({ count: s.count }),
      })
      class Display extends Component<{ count: number }> {
        render() {
          return createElement("span", { "data-testid": "val" }, this.props.count);
        }
      }

      render(createElement(Display));

      await actTL(async () => {
        store.setCount(7);
      });

      expect(screen.getByTestId("val").textContent).toBe("7");
    });
  });

  describe("setup and cleanup", () => {
    it("setup fires on mount", async () => {
      const store = new TestStore();
      const setupSpy = vi.fn();

      @connect(store, {
        props: (s) => ({ count: s.count }),
        setup: setupSpy,
      })
      class Display extends Component<{ count: number }> {
        render() {
          return createElement("span", null, this.props.count);
        }
      }

      render(createElement(Display));
      await actTL(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(setupSpy).toHaveBeenCalledOnce();
    });

    it("setup receives the store instance", async () => {
      const store = new TestStore();
      let receivedStore: unknown;

      @connect(store, {
        props: (s) => ({ count: s.count }),
        setup: (s) => { receivedStore = s; },
      })
      class Display extends Component<{ count: number }> {
        render() {
          return createElement("span", null, this.props.count);
        }
      }

      render(createElement(Display));
      await actTL(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(receivedStore).toBe(store);
    });

    it("cleanup fires on unmount", async () => {
      const store = new TestStore();
      const cleanupSpy = vi.fn();

      @connect(store, {
        props: (s) => ({ count: s.count }),
        cleanup: cleanupSpy,
      })
      class Display extends Component<{ count: number }> {
        render() {
          return createElement("span", null, this.props.count);
        }
      }

      const { unmount } = render(createElement(Display));
      expect(cleanupSpy).not.toHaveBeenCalled();
      unmount();
      await new Promise((r) => setTimeout(r, 0));
      expect(cleanupSpy).toHaveBeenCalledOnce();
    });

    it("cleanup receives the store instance", async () => {
      const store = new TestStore();
      let receivedStore: unknown;

      @connect(store, {
        props: (s) => ({ count: s.count }),
        cleanup: (s) => { receivedStore = s; },
      })
      class Display extends Component<{ count: number }> {
        render() {
          return createElement("span", null, this.props.count);
        }
      }

      const { unmount } = render(createElement(Display));
      unmount();
      await new Promise((r) => setTimeout(r, 0));
      expect(receivedStore).toBe(store);
    });

    it("setup and cleanup pair together", async () => {
      const store = new TestStore();
      const setupSpy = vi.fn();
      const cleanupSpy = vi.fn();

      @connect(store, {
        props: (s) => ({ count: s.count }),
        setup: setupSpy,
        cleanup: cleanupSpy,
      })
      class Display extends Component<{ count: number }> {
        render() {
          return createElement("span", null, this.props.count);
        }
      }

      const { unmount } = render(createElement(Display));
      await actTL(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(setupSpy).toHaveBeenCalledOnce();
      expect(cleanupSpy).not.toHaveBeenCalled();
      unmount();
      await new Promise((r) => setTimeout(r, 0));
      expect(cleanupSpy).toHaveBeenCalledOnce();
    });

    it("cleanup fires only once in StrictMode", async () => {
      const store = new TestStore();
      const cleanupSpy = vi.fn();

      @connect(store, {
        props: (s) => ({ count: s.count }),
        cleanup: cleanupSpy,
      })
      class Display extends Component<{ count: number }> {
        render() {
          return createElement("span", null, this.props.count);
        }
      }

      const { unmount } = render(
        createElement(StrictMode, null, createElement(Display)),
      );
      await new Promise((r) => setTimeout(r, 0));
      expect(cleanupSpy).not.toHaveBeenCalled();
      unmount();
      await new Promise((r) => setTimeout(r, 0));
      expect(cleanupSpy).toHaveBeenCalledOnce();
    });
  });

  describe("fetch config", () => {
    it("transitions through loading -> ready", async () => {
      const store = new TestStore();

      let resolveFetch!: () => void;
      const fetchPromise = new Promise<void>((r) => { resolveFetch = r; });

      @connect(store, {
        props: (s) => ({ count: s.count }),
        fetch: async (s) => {
          await fetchPromise;
          s.setCount(42);
        },
      })
      class Display extends Component<{ count: number; status: AsyncStatus; error: string | null }> {
        render() {
          return createElement(
            "div",
            null,
            createElement("span", { "data-testid": "status" }, this.props.status.value),
            createElement("span", { "data-testid": "count" }, this.props.count),
          );
        }
      }

      render(createElement(Display));

      expect(screen.getByTestId("status").textContent).toBe("loading");

      await actTL(async () => {
        resolveFetch();
      });

      expect(screen.getByTestId("status").textContent).toBe("ready");
      expect(screen.getByTestId("count").textContent).toBe("42");
    });

    it("sets status to error when fetch rejects", async () => {
      const store = new TestStore();

      @connect(store, {
        props: (s) => ({ count: s.count }),
        fetch: async () => { throw new Error("Network failure"); },
      })
      class Display extends Component<{ count: number; status: AsyncStatus; error: string | null }> {
        render() {
          return createElement(
            "div",
            null,
            createElement("span", { "data-testid": "status" }, this.props.status.value),
            createElement("span", { "data-testid": "error" }, this.props.error ?? ""),
          );
        }
      }

      await actTL(async () => {
        render(createElement(Display));
      });

      expect(screen.getByTestId("status").textContent).toBe("error");
      expect(screen.getByTestId("error").textContent).toBe("Network failure");
    });

    it("renders loading component during fetch", async () => {
      const store = new TestStore();

      let resolveFetch!: () => void;
      const fetchPromise = new Promise<void>((r) => { resolveFetch = r; });

      function Loading() {
        return createElement("span", { "data-testid": "loading" }, "Loading...");
      }

      @connect(store, {
        props: (s) => ({ count: s.count }),
        fetch: async (s) => {
          await fetchPromise;
          s.setCount(99);
        },
        loading: Loading,
      })
      class Display extends Component<{ count: number }> {
        render() {
          return createElement("span", { "data-testid": "val" }, this.props.count);
        }
      }

      render(createElement(Display));

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

      function ErrorDisplay({ error }: { error: string }) {
        return createElement("span", { "data-testid": "err" }, error);
      }

      @connect(store, {
        props: (s) => ({ count: s.count }),
        fetch: async () => { throw new Error("Boom"); },
        error: ErrorDisplay,
      })
      class Display extends Component<{ count: number }> {
        render() {
          return createElement("span", { "data-testid": "val" }, this.props.count);
        }
      }

      await actTL(async () => {
        render(createElement(Display));
      });

      expect(screen.getByTestId("err").textContent).toBe("Boom");
      expect(screen.queryByTestId("val")).toBeNull();
    });

    it("cleanup works alongside fetch", async () => {
      const store = new TestStore();
      const cleanupSpy = vi.fn();
      const fetchSpy = vi.fn().mockResolvedValue(undefined);

      @connect(store, {
        props: (s) => ({ count: s.count }),
        fetch: fetchSpy,
        cleanup: cleanupSpy,
      })
      class Display extends Component<{ count: number }> {
        render() {
          return createElement("span", null, this.props.count);
        }
      }

      const { unmount } = render(createElement(Display));
      await actTL(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(cleanupSpy).not.toHaveBeenCalled();
      unmount();
      await new Promise((r) => setTimeout(r, 0));
      expect(cleanupSpy).toHaveBeenCalledOnce();
    });

    it("calls fetch only once", async () => {
      const store = new TestStore();
      let fetchCount = 0;

      @connect(store, {
        props: (s) => ({ count: s.count }),
        fetch: async () => { fetchCount++; },
      })
      class Display extends Component<{ count: number; status: AsyncStatus; error: string | null }> {
        render() {
          return createElement("span", { "data-testid": "status" }, this.props.status.value);
        }
      }

      const { rerender } = render(createElement(Display));
      await actTL(async () => {});
      rerender(createElement(Display));
      await actTL(async () => {});

      expect(fetchCount).toBe(1);
    });

    it("calls fetch only once in StrictMode", async () => {
      const store = new TestStore();
      const fetchSpy = vi.fn(async () => {});

      @connect(store, {
        props: (s) => ({ count: s.count }),
        fetch: fetchSpy,
      })
      class Display extends Component<{ count: number; status: AsyncStatus; error: string | null }> {
        render() {
          return createElement("span", { "data-testid": "status" }, this.props.status.value);
        }
      }

      await actTL(async () => {
        render(createElement(StrictMode, null, createElement(Display)));
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("select config", () => {
    it("injects selected paths as props", () => {
      const store = new NestedStore();

      @connect(store, {
        select: (pick) => ({ name: pick("user.name") }),
      })
      class Display extends Component<{ name: string }> {
        render() {
          return createElement("span", { "data-testid": "val" }, this.props.name);
        }
      }

      render(createElement(Display));
      expect(screen.getByTestId("val").textContent).toBe("Alice");
    });

    it("re-renders when selected path changes", async () => {
      const store = new NestedStore();

      @connect(store, {
        select: (pick) => ({ name: pick("user.name") }),
      })
      class Display extends Component<{ name: string }> {
        render() {
          return createElement("span", { "data-testid": "val" }, this.props.name);
        }
      }

      render(createElement(Display));

      await actTL(async () => {
        store.setUserName("Bob");
      });

      expect(screen.getByTestId("val").textContent).toBe("Bob");
    });

    it("does not re-render when unselected path changes", async () => {
      const store = new NestedStore();
      let renderCount = 0;

      @connect(store, {
        select: (pick) => ({ name: pick("user.name") }),
      })
      class Display extends Component<{ name: string }> {
        render() {
          renderCount++;
          return createElement("span", { "data-testid": "val" }, this.props.name);
        }
      }

      render(createElement(Display));
      const initialRenders = renderCount;

      await actTL(async () => {
        store.setAge(99);
      });

      expect(renderCount).toBe(initialRenders);
    });

    it("supports multiple selected paths", async () => {
      const store = new NestedStore();

      @connect(store, {
        select: (pick) => ({ name: pick("user.name"), age: pick("user.age") }),
      })
      class Display extends Component<{ name: string; age: number }> {
        render() {
          return createElement("span", { "data-testid": "val" }, `${this.props.name}:${this.props.age}`);
        }
      }

      render(createElement(Display));
      expect(screen.getByTestId("val").textContent).toBe("Alice:30");

      await actTL(async () => {
        store.setAge(25);
      });

      expect(screen.getByTestId("val").textContent).toBe("Alice:25");
    });

    it("passes own props alongside selected props", () => {
      const store = new NestedStore();

      @connect(store, {
        select: (pick) => ({ name: pick("user.name") }),
      })
      class Display extends Component<{ name: string; prefix: string }> {
        render() {
          return createElement("span", { "data-testid": "val" }, `${this.props.prefix}${this.props.name}`);
        }
      }

      render(createElement(Display, { prefix: "Hi " }));
      expect(screen.getByTestId("val").textContent).toBe("Hi Alice");
    });
  });

  describe("select with fetch config", () => {
    it("renders loading component during fetch", async () => {
      const store = new NestedStore();

      let resolveFetch!: () => void;
      const fetchPromise = new Promise<void>((r) => { resolveFetch = r; });

      function Loading() {
        return createElement("span", { "data-testid": "loading" }, "Loading...");
      }

      @connect(store, {
        select: (pick) => ({ name: pick("user.name") }),
        fetch: async () => { await fetchPromise; },
        loading: Loading,
      })
      class Display extends Component<{ name: string }> {
        render() {
          return createElement("span", { "data-testid": "val" }, this.props.name);
        }
      }

      render(createElement(Display));

      expect(screen.getByTestId("loading")).toBeTruthy();

      await actTL(async () => {
        resolveFetch();
      });

      expect(screen.queryByTestId("loading")).toBeNull();
      expect(screen.getByTestId("val").textContent).toBe("Alice");
    });

    it("renders error component on fetch failure", async () => {
      const store = new NestedStore();

      function ErrorDisplay({ error }: { error: string }) {
        return createElement("span", { "data-testid": "error" }, error);
      }

      @connect(store, {
        select: (pick) => ({ name: pick("user.name") }),
        fetch: async () => { throw new Error("fail"); },
        loading: () => createElement("span", { "data-testid": "loading" }, "Loading..."),
        error: ErrorDisplay,
      })
      class Display extends Component<{ name: string }> {
        render() {
          return createElement("span", { "data-testid": "val" }, this.props.name);
        }
      }

      render(createElement(Display));
      expect(screen.getByTestId("loading")).toBeTruthy();

      await actTL(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(screen.getByTestId("error").textContent).toBe("fail");
      expect(screen.queryByTestId("val")).toBeNull();
    });

    it("setup runs before fetch with select config", async () => {
      const store = new NestedStore();
      const order: string[] = [];

      @connect(store, {
        select: (pick) => ({ name: pick("user.name") }),
        setup: () => { order.push("setup"); },
        fetch: async () => { order.push("fetch"); },
      })
      class Display extends Component<{ name: string }> {
        render() {
          return createElement("span", { "data-testid": "val" }, this.props.name);
        }
      }

      render(createElement(Display));
      await actTL(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(order).toEqual(["setup", "fetch"]);
    });

    it("cleanup fires on unmount with select+fetch config", async () => {
      const store = new NestedStore();
      const cleanupSpy = vi.fn();

      @connect(store, {
        select: (pick) => ({ name: pick("user.name") }),
        fetch: async () => {},
        cleanup: cleanupSpy,
      })
      class Display extends Component<{ name: string }> {
        render() {
          return createElement("span", { "data-testid": "val" }, this.props.name);
        }
      }

      const { unmount } = render(createElement(Display));
      await actTL(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(cleanupSpy).not.toHaveBeenCalled();
      unmount();
      await new Promise((r) => setTimeout(r, 0));
      expect(cleanupSpy).toHaveBeenCalledOnce();
    });
  });
});
