---
title: Async & HTTP
description: Built-in async operation tracking and HTTP client with take-latest semantics
---

# Async & HTTP

The protected `this.api` accessor runs async work with automatic status tracking. Every method takes a single params object. With a `key`, the operation is tracked and readable through `getStatus(key)`; without one, it just runs.

## Operation Keys

The second generic parameter on `SnapStore` defines the valid keys. Give every user-visible operation its own key; keys are what drive loading and error UI.

```typescript
class UserStore extends SnapStore<UserState, "loadUser" | "saveUser"> {
  // ...
}
```

Each key tracks its own `OperationState`:

```typescript
type OperationState = {
  status: AsyncStatus; // { value, isIdle, isLoading, isReady, isError }
  error: string | null;
};
```

## api.fetch({ key?, fn })

Runs any async function with status tracking and returns the value from `fn`:

```typescript
class UserStore extends SnapStore<{ user: User | null }, "loadUser" | "count"> {
  constructor() {
    super({ user: null });
  }

  loadUser(id: string) {
    return this.api.fetch({ key: "loadUser", fn: async () => {
      const user = await this.http.request<User>(`/api/users/${id}`);
      this.state.set("user", user);
    }});
  }

  async getCount(): Promise<number> {
    const result = await this.api.fetch({ key: "count", fn: () =>
      this.http.request<{ count: number }>("/api/count")
    });
    return result?.count ?? 0;
  }
}
```

When a call is superseded by a newer one with the same key (see take-latest below), `api.fetch` resolves with `undefined`, which is why the example above guards the result.

## HTTP Methods

`api.get`, `api.post`, `api.put`, `api.patch`, and `api.delete` wrap the HTTP client with JSON handling and error extraction. All take a single params object:

| Param | Description |
| --- | --- |
| `key` | Optional tracking key |
| `url` | Request URL |
| `body` | Request body, JSON-serialized automatically (`post`/`put`/`patch`/`delete`) |
| `headers` | Per-request headers, merged over defaults |
| `target` | State path to store the response at |
| `fallback` | (`get` only) value stored at `target` when the request fails; suppresses the error |
| `onSuccess` | Callback with the parsed response |
| `onError` | Callback with the error; marks the error handled |

### Prefer `target` for storing responses

`target` writes the response directly to a typed state path. Use `onSuccess` only when the response needs transformation first:

```typescript
// Preferred: direct to state
loadUser() {
  return this.api.get({ key: "loadUser", url: "/api/user", target: "user" });
}

// When reshaping is needed
loadUser() {
  return this.api.get<ApiUser>({
    key: "loadUser",
    url: "/api/user",
    onSuccess: (raw) => this.state.set("user", toUser(raw)),
  });
}
```

### Mutations

```typescript
saveUser(data: UserInput) {
  return this.api.post({
    key: "saveUser",
    url: "/api/users",
    body: data,
    target: "user", // store the created user from the response
  });
}
```

### Fallbacks on GET

```typescript
this.api.get({ key: "prefs", url: "/api/prefs", target: "prefs", fallback: defaultPrefs });
// On failure: prefs becomes defaultPrefs, the promise resolves, status records the error
```

## Error Handling

With `onError`, the error is handled and the promise resolves. Without it, the promise rejects, so await inside `try/catch` or attach `.catch()`; an unhandled rejection is a bug in the caller. If `onError` itself throws, that error propagates.

```typescript
async remove(id: string) {
  try {
    await this.api.delete({ key: "remove", url: `/api/items/${id}` });
  } catch {
    // status already records the error; decide whether to surface more
  }
}
```

## Take-Latest Semantics

Tracked operations follow take-latest per key: when a newer call starts with the same key, the older call stops updating status, and its response no longer writes to `target`.

- **GET**: a superseded response is ignored entirely, including `onSuccess` and `onError`.
- **Mutations** (`post`/`put`/`patch`/`delete`): the superseded call's `onSuccess`/`onError` still run, because a completed mutation usually needs acknowledgment, but its response does not overwrite `target`.
- **`api.fetch`**: a superseded call resolves with `undefined`.

Take-latest does not debounce or abort the HTTP request; two rapid calls send two requests. When double submission matters, guard on status:

```typescript
save() {
  if (this.getStatus("saveUser").status.isLoading) return;
  return this.api.post({ key: "saveUser", url: "/api/users", body: this.draft });
}
```

## api.all: Parallel Requests

Load several endpoints under one tracked operation. Responses are written to their targets together, in one batch, after all requests finish. Requests default to GET:

```typescript
async fetchDashboard() {
  await this.api.all({ key: "dashboard", requests: [
    { url: "/api/todos", target: "todos" },
    { url: "/api/stats", target: "stats" },
    { url: "/api/search", target: "results", method: "POST", body: { query: "active" } },
  ]});
}
```

A request with its own `onError` does not fail the batch. Use it for optional data:

```typescript
{ url: "/api/linear-teams", target: "linearTeams", onError: () => this.state.set("linearTeams", []) },
```

If any request without `onError` fails, no targets are written and the batch rejects.

## Checking Status

```typescript
const { status, error } = store.getStatus("loadUser");
status.value;     // "idle" | "loading" | "ready" | "error"
status.isLoading; // boolean flags: isIdle, isLoading, isReady, isError
error;            // string | null
```

The returned object is frozen with a stable identity until the status changes, so mapping it into component props is cheap and safe.

### resetStatus(key?)

Returns an operation to idle; without a key, resets all. In-flight operations for the key become superseded, so their results are ignored on arrival. The HTTP request itself is not aborted.

```typescript
store.resetStatus("loadUser");  // e.g. before a retry
store.resetStatus();            // e.g. when reusing the store for another context
```

## Raw HTTP Access (`this.http`)

`this.http` is the store's configured HTTP client. Use it inside `api.fetch` when you need the response value rather than a state write, without creating a second tracked operation. It is also the right tool inside `SnapFormStore.submit` handlers, which already track status.

## Global HTTP Configuration

### setHttpClient(client)

Replace the default `fetch`-based client:

```typescript
import { setHttpClient } from "@thalesfp/snapstate";

setHttpClient({
  async request(url, init) {
    const res = await axios({ url, method: init?.method, data: init?.body, headers: init?.headers });
    return res.data;
  },
});
```

### setDefaultHeaders(headers)

Merge headers into every request. Per-request headers win. Call `setDefaultHeaders({})` to clear. Works with both the built-in and custom clients.

```typescript
import { setDefaultHeaders } from "@thalesfp/snapstate";

setDefaultHeaders({ Authorization: `Bearer ${token}` });
```

Both settings are module-level globals. That is fine in the browser, where one user owns the process. On a server rendering for many users, per-user tokens in globals can leak across requests; prefer per-store clients there.

### Per-store client

Constructor options override the global client for one store. This is the standard way to test stores:

```typescript
const mockClient: HttpClient = {
  async request() { return { id: "1", name: "Test" }; },
};

const store = new UserStore({ httpClient: mockClient });
await store.loadUser("1");
expect(store.getSnapshot().user?.name).toBe("Test");
```
