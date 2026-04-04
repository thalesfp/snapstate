import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SnapStore, setDefaultHeaders, setHttpClient } from "../src/index.js";
import type { HttpClient } from "../src/index.js";

const mockFetch = vi.fn();

class TestStore extends SnapStore<{ data: string }, "op"> {
  doGet(url: string) {
    return this.api.get<string>({ key: "op", url, onSuccess: (d) => this.state.set("data", d) });
  }
  doPost(url: string, body: unknown, headers?: Record<string, string>) {
    return this.api.post({ key: "op", url, body, headers });
  }
}

class HttpClientStore extends TestStore {
  doFetchWithHttp(url: string) {
    return this.api.fetch({ key: "op", fn: async () => {
      const data = await this.http.request<string>(url);
      this.state.set("data", data);
    }});
  }
}

describe("setDefaultHeaders", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('"ok"') });
    vi.stubGlobal("fetch", mockFetch);
    setDefaultHeaders({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends default headers on GET requests", async () => {
    setDefaultHeaders({ Authorization: "Bearer tok" });
    const store = new TestStore({ data: "" });
    await store.doGet("/api");

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers).toEqual({ Authorization: "Bearer tok" });
  });

  it("sends default headers on POST requests alongside Content-Type", async () => {
    setDefaultHeaders({ Authorization: "Bearer tok" });
    const store = new TestStore({ data: "" });
    await store.doPost("/api", { x: 1 });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer tok",
    });
  });

  it("per-request headers override defaults", async () => {
    setDefaultHeaders({ Authorization: "Bearer default", "X-Custom": "keep" });
    const store = new TestStore({ data: "" });
    await store.doPost("/api", { x: 1 }, { Authorization: "Bearer override" });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer override");
    expect(init.headers["X-Custom"]).toBe("keep");
  });

  it("clearing default headers removes them", async () => {
    setDefaultHeaders({ Authorization: "Bearer tok" });
    setDefaultHeaders({});
    const store = new TestStore({ data: "" });
    await store.doGet("/api");

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers).toBeUndefined();
  });
});

describe("error responses", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    setDefaultHeaders({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("extracts error field from JSON body", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve(JSON.stringify({ error: "Invalid credentials" })),
    });
    const store = new TestStore({ data: "" });
    await expect(store.doGet("/api")).rejects.toThrow("Invalid credentials");
  });

  it("extracts message field from JSON body", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      text: () => Promise.resolve(JSON.stringify({ message: "Something went wrong" })),
    });
    const store = new TestStore({ data: "" });
    await expect(store.doGet("/api")).rejects.toThrow("Something went wrong");
  });

  it("falls back to HTTP status on plain text body", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 422,
      text: () => Promise.resolve("Not processable"),
    });
    const store = new TestStore({ data: "" });
    await expect(store.doGet("/api")).rejects.toThrow("HTTP 422");
  });

  it("falls back to HTTP status on empty body", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve(""),
    });
    const store = new TestStore({ data: "" });
    await expect(store.doGet("/api")).rejects.toThrow("HTTP 500");
  });
});

describe("per-store httpClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the provided httpClient instead of the global one", async () => {
    const mockClient: HttpClient = { request: vi.fn().mockResolvedValue("custom") };
    const store = new HttpClientStore({ data: "" }, { httpClient: mockClient });
    await store.doGet("/api");

    expect(mockClient.request).toHaveBeenCalledWith("/api", expect.objectContaining({ method: "GET" }));
    expect(store.getSnapshot().data).toBe("custom");
  });

  it("does not call global fetch when per-store client is set", async () => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);

    const mockClient: HttpClient = { request: vi.fn().mockResolvedValue("local") };
    const store = new HttpClientStore({ data: "" }, { httpClient: mockClient });
    await store.doGet("/api");

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("exposes http for use inside api.fetch", async () => {
    const mockClient: HttpClient = { request: vi.fn().mockResolvedValue("via-http") };
    const store = new HttpClientStore({ data: "" }, { httpClient: mockClient });
    await store.doFetchWithHttp("/api/data");

    expect(mockClient.request).toHaveBeenCalledWith("/api/data");
    expect(store.getSnapshot().data).toBe("via-http");
  });

  it("falls back to global client when no per-store client is set", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('"global"') });
    vi.stubGlobal("fetch", mockFetch);

    const store = new HttpClientStore({ data: "" });
    await store.doGet("/api");

    expect(mockFetch).toHaveBeenCalled();
    expect(store.getSnapshot().data).toBe("global");
  });

  it("setHttpClient affects stores created before the call", async () => {
    const store = new HttpClientStore({ data: "" });
    const laterClient: HttpClient = { request: vi.fn().mockResolvedValue("later") };

    setHttpClient(laterClient);
    await store.doGet("/api");

    expect(laterClient.request).toHaveBeenCalledWith("/api", expect.objectContaining({ method: "GET" }));
    expect(store.getSnapshot().data).toBe("later");
  });
});

describe("named params", () => {
  interface TargetState {
    name: string;
    items: string[];
  }

  class TargetStore extends SnapStore<TargetState, "op"> {
    snapshot() {
      return this.getSnapshot();
    }
  }

  let mockClient: HttpClient;
  let store: TargetStore;

  beforeEach(() => {
    mockClient = { request: vi.fn().mockResolvedValue("hello") };
    store = new TargetStore({ name: "", items: [] }, { httpClient: mockClient });
  });

  it("api.get with target sets state at the given path", async () => {
    await store.api.get({ key: "op", url: "/api/name", target: "name" });

    expect(store.snapshot().name).toBe("hello");
  });

  it("api.get with callback works", async () => {
    await store.api.get<string>({ key: "op", url: "/api/name", onSuccess: (d) => {
      store.state.set("name" as never, d as never);
    }});

    expect(store.snapshot().name).toBe("hello");
  });

  it("api.post with target sets state", async () => {
    (mockClient.request as ReturnType<typeof vi.fn>).mockResolvedValue(["a", "b"]);
    await store.api.post({ key: "op", url: "/api/items", body: { x: 1 }, target: "items" });

    expect(store.snapshot().items).toEqual(["a", "b"]);
  });

  it("api.post with onSuccess callback works", async () => {
    (mockClient.request as ReturnType<typeof vi.fn>).mockResolvedValue(["c"]);
    await store.api.post<string[]>({ key: "op", url: "/api/items", body: { x: 1 }, onSuccess: (d) => {
      store.state.set("items" as never, d as never);
    }});

    expect(store.snapshot().items).toEqual(["c"]);
  });

  it("api.get without key skips status tracking", async () => {
    await store.api.get({ url: "/api/name", target: "name" });

    expect(store.snapshot().name).toBe("hello");
    expect(store.getStatus("op").status.isIdle).toBe(true);
  });

  it("api.fetch without key skips status tracking", async () => {
    await store.api.fetch({ fn: async () => {
      store.state.set("name" as never, "manual" as never);
    }});

    expect(store.snapshot().name).toBe("manual");
    expect(store.getStatus("op").status.isIdle).toBe(true);
  });

  it("api.get with key tracks status", async () => {
    await store.api.get({ key: "op", url: "/api/name", target: "name" });

    expect(store.getStatus("op").status.isReady).toBe(true);
  });
});

describe("api.all", () => {
  interface DashboardState {
    users: string[];
    stats: { count: number };
  }

  class DashboardStore extends SnapStore<DashboardState, "fetch"> {
    snapshot() {
      return this.getSnapshot();
    }
  }

  let mockClient: { request: ReturnType<typeof vi.fn> };
  let store: DashboardStore;

  beforeEach(() => {
    mockClient = { request: vi.fn() };
    store = new DashboardStore(
      { users: [], stats: { count: 0 } },
      { httpClient: mockClient },
    );
  });

  it("stores results at their target paths", async () => {
    mockClient.request
      .mockResolvedValueOnce(["alice", "bob"])
      .mockResolvedValueOnce({ count: 42 });

    await store.api.all({ key: "fetch", requests: [
      { url: "/api/users", target: "users" },
      { url: "/api/stats", target: "stats" },
    ]});

    expect(store.snapshot().users).toEqual(["alice", "bob"]);
    expect(store.snapshot().stats).toEqual({ count: 42 });
  });

  it("sets status to ready on success", async () => {
    mockClient.request.mockResolvedValue([]);

    await store.api.all({ key: "fetch", requests: [
      { url: "/api/users", target: "users" },
    ]});

    expect(store.getStatus("fetch").status.isReady).toBe(true);
  });

  it("skips status tracking when key is omitted", async () => {
    mockClient.request.mockResolvedValue([]);

    await store.api.all({ requests: [
      { url: "/api/users", target: "users" },
    ]});

    expect(store.getStatus("fetch").status.isIdle).toBe(true);
  });

  it("sets status to error when a request fails", async () => {
    mockClient.request
      .mockResolvedValueOnce(["alice"])
      .mockRejectedValueOnce(new Error("Server error"));

    await expect(store.api.all({ key: "fetch", requests: [
      { url: "/api/users", target: "users" },
      { url: "/api/stats", target: "stats" },
    ]})).rejects.toThrow("Server error");

    expect(store.getStatus("fetch").status.isError).toBe(true);
    expect(store.getStatus("fetch").error).toBe("Server error");
  });

  it("calls onError when a request fails and does not rethrow", async () => {
    const onError = vi.fn();
    mockClient.request.mockRejectedValue(new Error("fail"));

    await store.api.all({ key: "fetch", requests: [
      { url: "/api/users", target: "users" },
    ], onError });

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "fail" }));
    expect(store.getStatus("fetch").status.isError).toBe(true);
  });

  it("sends GET requests with correct URLs", async () => {
    mockClient.request.mockResolvedValue([]);

    await store.api.all({ requests: [
      { url: "/api/users", target: "users" },
      { url: "/api/stats", target: "stats" },
    ]});

    expect(mockClient.request).toHaveBeenCalledWith("/api/users", { method: "GET", headers: undefined });
    expect(mockClient.request).toHaveBeenCalledWith("/api/stats", { method: "GET", headers: undefined });
  });

  it("forwards per-request headers", async () => {
    mockClient.request.mockResolvedValue([]);

    await store.api.all({ requests: [
      { url: "/api/users", target: "users", headers: { "X-Custom": "value" } },
    ]});

    expect(mockClient.request).toHaveBeenCalledWith("/api/users", { method: "GET", headers: { "X-Custom": "value" } });
  });
});

describe("take-latest guards state mutations", () => {
  interface State {
    name: string;
    items: string[];
  }

  class RaceStore extends SnapStore<State, "op"> {
    snapshot() {
      return this.getSnapshot();
    }
  }

  it("stale api.get with target does not overwrite state", async () => {
    let resolveOld!: (v: unknown) => void;
    let resolveNew!: (v: unknown) => void;

    const mockClient: HttpClient = {
      request: vi.fn()
        .mockReturnValueOnce(new Promise((r) => { resolveOld = r; }))
        .mockReturnValueOnce(new Promise((r) => { resolveNew = r; })),
    };
    const store = new RaceStore({ name: "", items: [] }, { httpClient: mockClient });

    const oldCall = store.api.get({ key: "op", url: "/api/name", target: "name" });
    const newCall = store.api.get({ key: "op", url: "/api/name", target: "name" });

    resolveNew("new-value");
    await newCall;
    expect(store.snapshot().name).toBe("new-value");

    resolveOld("old-value");
    await oldCall;
    expect(store.snapshot().name).toBe("new-value");
  });

  it("stale api.get with onSuccess does not call callback", async () => {
    let resolveOld!: (v: unknown) => void;
    let resolveNew!: (v: unknown) => void;
    const onSuccessOld = vi.fn();

    const mockClient: HttpClient = {
      request: vi.fn()
        .mockReturnValueOnce(new Promise((r) => { resolveOld = r; }))
        .mockReturnValueOnce(new Promise((r) => { resolveNew = r; })),
    };
    const store = new RaceStore({ name: "", items: [] }, { httpClient: mockClient });

    const oldCall = store.api.get<string>({ key: "op", url: "/api/name", onSuccess: onSuccessOld });
    const newCall = store.api.get<string>({ key: "op", url: "/api/name", onSuccess: () => {} });

    resolveNew("new");
    await newCall;

    resolveOld("old");
    await oldCall;
    expect(onSuccessOld).not.toHaveBeenCalled();
  });

  it("stale api.get error does not call onError", async () => {
    let rejectOld!: (e: Error) => void;
    let resolveNew!: (v: unknown) => void;
    const onErrorOld = vi.fn();

    const mockClient: HttpClient = {
      request: vi.fn()
        .mockReturnValueOnce(new Promise((_, r) => { rejectOld = r; }))
        .mockReturnValueOnce(new Promise((r) => { resolveNew = r; })),
    };
    const store = new RaceStore({ name: "", items: [] }, { httpClient: mockClient });

    const oldCall = store.api.get<string>({ key: "op", url: "/api/name", onError: onErrorOld });
    const newCall = store.api.get<string>({ key: "op", url: "/api/name" });

    resolveNew("new");
    await newCall;

    rejectOld(new Error("stale error"));
    await oldCall;
    expect(onErrorOld).not.toHaveBeenCalled();
  });

  it("stale api.all does not store results", async () => {
    let resolveOld!: (v: unknown) => void;
    let resolveNew!: (v: unknown) => void;

    const mockClient: HttpClient = {
      request: vi.fn()
        .mockReturnValueOnce(new Promise((r) => { resolveOld = r; }))
        .mockReturnValueOnce(new Promise((r) => { resolveNew = r; })),
    };
    const store = new RaceStore({ name: "", items: [] }, { httpClient: mockClient });

    const oldCall = store.api.all({ key: "op", requests: [
      { url: "/api/name", target: "name" },
    ]});
    const newCall = store.api.all({ key: "op", requests: [
      { url: "/api/name", target: "name" },
    ]});

    resolveNew("new-value");
    await newCall;
    expect(store.snapshot().name).toBe("new-value");

    resolveOld("old-value");
    await oldCall;
    expect(store.snapshot().name).toBe("new-value");
  });

  it("overlapping api.post with same key both call onSuccess", async () => {
    let resolveFirst!: (v: unknown) => void;
    let resolveSecond!: (v: unknown) => void;
    const onSuccessFirst = vi.fn();
    const onSuccessSecond = vi.fn();

    const mockClient: HttpClient = {
      request: vi.fn()
        .mockReturnValueOnce(new Promise((r) => { resolveFirst = r; }))
        .mockReturnValueOnce(new Promise((r) => { resolveSecond = r; })),
    };
    const store = new RaceStore({ name: "", items: [] }, { httpClient: mockClient });

    const first = store.api.post<string>({ key: "op", url: "/api/name", body: {}, onSuccess: onSuccessFirst });
    const second = store.api.post<string>({ key: "op", url: "/api/name", body: {}, onSuccess: onSuccessSecond });

    resolveSecond("second");
    await second;
    expect(onSuccessSecond).toHaveBeenCalledWith("second");

    resolveFirst("first");
    await first;
    expect(onSuccessFirst).toHaveBeenCalledWith("first");
  });

  it("failed mutation onError still fires when another mutation with same key is in flight", async () => {
    let rejectFirst!: (e: Error) => void;
    let resolveSecond!: (v: unknown) => void;
    const onErrorFirst = vi.fn();

    const mockClient: HttpClient = {
      request: vi.fn()
        .mockReturnValueOnce(new Promise((_, r) => { rejectFirst = r; }))
        .mockReturnValueOnce(new Promise((r) => { resolveSecond = r; })),
    };
    const store = new RaceStore({ name: "", items: [] }, { httpClient: mockClient });

    const first = store.api.patch<string>({ key: "op", url: "/api/name", body: {}, onError: onErrorFirst });
    const second = store.api.patch<string>({ key: "op", url: "/api/name", body: {} });

    resolveSecond("second");
    await second;

    rejectFirst(new Error("network error"));
    await first;
    expect(onErrorFirst).toHaveBeenCalledWith(expect.objectContaining({ message: "network error" }));
  });
});
