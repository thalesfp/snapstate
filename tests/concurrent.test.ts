/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { render, act as actTL, screen } from "@testing-library/react";
import { createElement } from "react";
import { createStore } from "../src/core/store.js";
import { SnapStore } from "../src/react/index.js";

describe("concurrent mode safety", () => {
  it("getSnapshot returns stable reference between renders", () => {
    const store = createStore({ count: 0 });
    const snap1 = store.getSnapshot();
    const snap2 = store.getSnapshot();
    expect(snap1).toBe(snap2);
  });

  it("getSnapshot changes after set", () => {
    const store = createStore({ count: 0 });
    const snap1 = store.getSnapshot();
    store.set("count", 1);
    const snap2 = store.getSnapshot();
    expect(snap1).not.toBe(snap2);
  });

  it("connect sees consistent state across rapid updates", async () => {
    class TestStore extends SnapStore<{ a: number; b: number }> {
      constructor() {
        super({ a: 0, b: 0 });
      }

      get values() {
        const s = this.state.get();
        return { a: s.a, b: s.b };
      }

      updateBoth() {
        this.state.batch(() => {
          this.state.set("a", 1);
          this.state.set("b", 1);
        });
      }
    }

    const store = new TestStore();

    function Display({ a, b }: { a: number; b: number }) {
      return createElement("span", { "data-testid": "val" }, `${a},${b}`);
    }

    const Connected = store.connect(Display, (s) => s.values);
    render(createElement(Connected));

    await actTL(async () => {
      store.updateBoth();
    });

    expect(screen.getByTestId("val").textContent).toBe("1,1");
  });

  it("batch prevents intermediate states from being visible", async () => {
    class TestStore extends SnapStore<{ balance: number; pending: boolean }> {
      constructor() {
        super({ balance: 100, pending: false });
      }

      get current() {
        return this.state.get();
      }

      transfer() {
        this.state.batch(() => {
          this.state.set("pending", true);
          this.state.set("balance", 50);
        });
      }
    }

    const store = new TestStore();
    const snapshots: Array<{ balance: number; pending: boolean }> = [];

    function Display({ balance, pending }: { balance: number; pending: boolean }) {
      snapshots.push({ balance, pending });
      return createElement(
        "span",
        { "data-testid": "val" },
        `${balance},${pending}`,
      );
    }

    const Connected = store.connect(Display, (s) => s.current);
    render(createElement(Connected));

    await actTL(async () => {
      store.transfer();
    });

    for (const snap of snapshots) {
      if (snap.pending) {
        expect(snap.balance).toBe(50);
      }
    }
  });
});
