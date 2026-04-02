import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createUrlParams, syncToUrl } from "../src/url/index.js";
import { SnapStore } from "../src/core/base.js";
import type { Subscribable } from "../src/core/types.js";

describe("createUrlParams", () => {
  let originalSearch: string;

  beforeEach(() => {
    originalSearch = window.location.search;
  });

  afterEach(() => {
    // Restore original search
    window.history.replaceState(null, "", window.location.pathname + originalSearch);
  });

  function setSearch(search: string) {
    window.history.replaceState(null, "", window.location.pathname + search);
  }

  it("parses flat params from window.location.search", () => {
    setSearch("?user=1&group=2");
    const params = createUrlParams();
    expect(params.getSnapshot()).toEqual({ user: "1", group: "2" });
    params.destroy();
  });

  it("parses nested object params", () => {
    setSearch("?user[name]=John&user[age]=30");
    const params = createUrlParams();
    expect(params.getSnapshot()).toEqual({ user: { name: "John", age: "30" } });
    params.destroy();
  });

  it("parses bracket array params", () => {
    setSearch("?colors[]=red&colors[]=blue");
    const params = createUrlParams();
    expect(params.getSnapshot()).toEqual({ colors: ["red", "blue"] });
    params.destroy();
  });

  it("parses indexed array params", () => {
    setSearch("?colors[0]=red&colors[1]=blue");
    const params = createUrlParams();
    expect(params.getSnapshot()).toEqual({ colors: ["red", "blue"] });
    params.destroy();
  });

  it("parses dot notation params", () => {
    setSearch("?user.name=John&user.age=30");
    const params = createUrlParams();
    expect(params.getSnapshot()).toEqual({ user: { name: "John", age: "30" } });
    params.destroy();
  });

  it("returns empty object when no search params", () => {
    setSearch("");
    const params = createUrlParams();
    expect(params.getSnapshot()).toEqual({});
    params.destroy();
  });

  it("uses initialParams when provided (SSR)", () => {
    const params = createUrlParams({ initialParams: { user: "5", mode: "test" } });
    expect(params.getSnapshot()).toEqual({ user: "5", mode: "test" });
    params.destroy();
  });

  it("notifies subscribers on refresh when params change", () => {
    setSearch("?a=1");
    const params = createUrlParams();
    const listener = vi.fn();
    params.subscribe(listener);

    setSearch("?a=2");
    params.refresh();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(params.getSnapshot()).toEqual({ a: "2" });
    params.destroy();
  });

  it("does not notify when params are unchanged on refresh", () => {
    setSearch("?a=1");
    const params = createUrlParams();
    const listener = vi.fn();
    params.subscribe(listener);

    params.refresh();

    expect(listener).not.toHaveBeenCalled();
    params.destroy();
  });

  it("unsubscribe removes listener", () => {
    setSearch("?a=1");
    const params = createUrlParams();
    const listener = vi.fn();
    const unsub = params.subscribe(listener);

    unsub();
    setSearch("?a=2");
    params.refresh();

    expect(listener).not.toHaveBeenCalled();
    params.destroy();
  });

  it("destroy stops all notifications", () => {
    setSearch("?a=1");
    const params = createUrlParams();
    const listener = vi.fn();
    params.subscribe(listener);

    params.destroy();
    setSearch("?a=2");
    params.refresh();

    expect(listener).not.toHaveBeenCalled();
  });

  it("listens to popstate events", () => {
    setSearch("?x=1");
    const params = createUrlParams();
    const listener = vi.fn();
    params.subscribe(listener);

    setSearch("?x=2");
    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(params.getSnapshot()).toEqual({ x: "2" });
    params.destroy();
  });

  it("detects pushState URL changes automatically", () => {
    setSearch("?a=1");
    const params = createUrlParams();
    const listener = vi.fn();
    params.subscribe(listener);

    window.history.pushState(null, "", window.location.pathname + "?a=2");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(params.getSnapshot()).toEqual({ a: "2" });
    params.destroy();
  });

  it("detects replaceState URL changes automatically", () => {
    setSearch("?a=1");
    const params = createUrlParams();
    const listener = vi.fn();
    params.subscribe(listener);

    window.history.replaceState(null, "", window.location.pathname + "?a=3");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(params.getSnapshot()).toEqual({ a: "3" });
    params.destroy();
  });

  it("does not notify when nested params are unchanged on refresh", () => {
    setSearch("?user[name]=John&user[age]=30");
    const params = createUrlParams();
    const listener = vi.fn();
    params.subscribe(listener);

    params.refresh();

    expect(listener).not.toHaveBeenCalled();
    params.destroy();
  });

  it("respects depth limit", () => {
    setSearch("?a[b][c][d]=1");
    const params = createUrlParams({ depth: 1 });
    const snapshot = params.getSnapshot();
    // With depth 1, only one level of nesting is parsed
    expect(snapshot.a).toEqual({ b: { "[c][d]": "1" } });
    params.destroy();
  });

  it("works with derive to sync URL params into store state", async () => {
    setSearch("?userId=42&role=admin");
    const urlParams = createUrlParams();

    class AppStore extends SnapStore<{ userId: string; role: string }> {
      constructor(source: Subscribable<Record<string, unknown>>) {
        super({ userId: "", role: "" });
        this.derive("userId", source, (p) => (p.userId as string) ?? "");
        this.derive("role", source, (p) => (p.role as string) ?? "");
      }
    }

    const store = new AppStore(urlParams);
    expect(store.getSnapshot().userId).toBe("42");
    expect(store.getSnapshot().role).toBe("admin");

    // Simulate navigation
    setSearch("?userId=99&role=user");
    urlParams.refresh();
    await Promise.resolve();

    expect(store.getSnapshot().userId).toBe("99");
    expect(store.getSnapshot().role).toBe("user");

    store.destroy();
    urlParams.destroy();
  });
});

describe("syncToUrl", () => {
  let originalSearch: string;

  beforeEach(() => {
    originalSearch = window.location.search;
  });

  afterEach(() => {
    window.history.replaceState(null, "", window.location.pathname + originalSearch);
  });

  class TestStore extends SnapStore<{ userId: string; groupId: string }> {
    setUserId(v: string) { this.state.set("userId", v); }
    setGroupId(v: string) { this.state.set("groupId", v); }
  }

  it("updates URL with replaceState when store changes", async () => {
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");
    const store = new TestStore({ userId: "1", groupId: "2" });

    const unsub = syncToUrl(store, {
      params: {
        user: (s) => s.userId,
        group: (s) => s.groupId,
      },
    });

    store.setUserId("10");
    await Promise.resolve();

    expect(replaceStateSpy).toHaveBeenCalled();
    const lastCall = replaceStateSpy.mock.calls[replaceStateSpy.mock.calls.length - 1];
    expect(lastCall[2]).toContain("user=10");
    expect(lastCall[2]).toContain("group=2");

    unsub();
    store.destroy();
    replaceStateSpy.mockRestore();
  });

  it("uses pushState when history option is push", async () => {
    const pushStateSpy = vi.spyOn(window.history, "pushState");
    const store = new TestStore({ userId: "1", groupId: "2" });

    const unsub = syncToUrl(store, {
      params: {
        user: (s) => s.userId,
        group: (s) => s.groupId,
      },
      history: "push",
    });

    store.setUserId("5");
    await Promise.resolve();

    expect(pushStateSpy).toHaveBeenCalled();

    unsub();
    store.destroy();
    pushStateSpy.mockRestore();
  });

  it("omits empty/null/undefined values from URL", async () => {
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");
    const store = new TestStore({ userId: "1", groupId: "" });

    const unsub = syncToUrl(store, {
      params: {
        user: (s) => s.userId,
        group: (s) => s.groupId,
      },
    });

    store.setUserId("3");
    await Promise.resolve();

    const lastCall = replaceStateSpy.mock.calls[replaceStateSpy.mock.calls.length - 1];
    expect(lastCall[2]).toContain("user=3");
    expect(lastCall[2]).not.toContain("group=");

    unsub();
    store.destroy();
    replaceStateSpy.mockRestore();
  });

  it("does not update URL when only unrelated state changes", async () => {
    const store = new TestStore({ userId: "1", groupId: "2" });

    const unsub = syncToUrl(store, {
      params: { user: (s) => s.userId },
    });

    // Trigger initial sync so the cache is populated
    store.setUserId("5");
    await Promise.resolve();

    const replaceStateSpy = vi.spyOn(window.history, "replaceState");

    // Change unrelated field only
    store.setGroupId("99");
    await Promise.resolve();

    expect(replaceStateSpy).not.toHaveBeenCalled();

    unsub();
    store.destroy();
    replaceStateSpy.mockRestore();
  });

  it("unsubscribe stops URL updates", async () => {
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");
    const store = new TestStore({ userId: "1", groupId: "2" });

    const unsub = syncToUrl(store, {
      params: { user: (s) => s.userId },
    });

    unsub();
    replaceStateSpy.mockClear();

    store.setUserId("99");
    await Promise.resolve();

    expect(replaceStateSpy).not.toHaveBeenCalled();

    store.destroy();
    replaceStateSpy.mockRestore();
  });
});
