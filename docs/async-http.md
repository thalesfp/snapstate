---
title: Async & HTTP
description: Built-in async operation tracking and HTTP client with takeLatest semantics
---

# Async & HTTP

Snapstate has built-in async operation tracking and an HTTP client. The protected `api` accessor provides all async methods.

## Operation Keys

Every async operation is identified by a string key. The second generic parameter on `SnapStore` defines the valid keys:

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

## api.fetch(key, asyncFn)

Run any async function with status tracking:

```typescript
class UserStore extends SnapStore<{ user: User | null }, "loadUser"> {
  constructor() {
    super({ user: null });
  }

  async loadUser(id: string) {
    await this.api.fetch("loadUser", async () => {
      const res = await fetch(`/api/users/${id}`);
      const user = await res.json();
      this.state.set("user", user);
    });
  }
}
```

## HTTP Methods

The built-in HTTP client provides convenience methods that handle JSON serialization and error extraction:

### api.get(key, url, onSuccess?)

```typescript
async loadUser() {
  await this.api.get<User>("loadUser", "/api/user", (user) => {
    this.state.set("user", user);
  });
}
```

### api.post / api.put / api.patch / api.delete

```typescript
async saveUser(data: UserInput) {
  await this.api.post("saveUser", "/api/users", {
    body: data,
    headers: { "X-Custom": "value" },
    onSuccess: (result) => {
      this.state.set("user", result);
    },
    onError: (err) => {
      console.error("Save failed:", err);
    },
  });
}
```

All HTTP methods accept `ApiRequestOptions`:

| Option | Description |
| --- | --- |
| `body` | Request body (JSON-serialized automatically) |
| `headers` | Per-request headers (merged with defaults) |
| `onSuccess` | Callback with the parsed response |
| `onError` | Callback with the error |

## TakeLatest Semantics

All `api.*` methods use **takeLatest** -- if a new request starts before a previous one completes, the stale response is silently ignored. This prevents race conditions in UI data fetching.

## Checking Status

```typescript
const store = new UserStore();
await store.loadUser("123");

const status = store.getStatus("loadUser");
status.status.value;     // "idle" | "loading" | "ready" | "error"
status.status.isLoading; // boolean
status.error;            // string | null
```

### resetStatus(key?)

Reset an operation back to idle. Also cancels in-flight requests for that key.

```typescript
store.resetStatus("loadUser");  // reset single operation
store.resetStatus();            // reset all operations
```

## Global HTTP Configuration

### setHttpClient(client)

Replace the default `fetch`-based HTTP client:

```typescript
import { setHttpClient } from "@thalesfp/snapstate";

setHttpClient({
  async request(url, init) {
    // Custom implementation (e.g., axios, ky, etc.)
    const res = await axios({ url, method: init?.method, data: init?.body });
    return res.data;
  },
});
```

### setDefaultHeaders(headers)

Set headers that are merged into every HTTP request:

```typescript
import { setDefaultHeaders } from "@thalesfp/snapstate";

setDefaultHeaders({
  Authorization: `Bearer ${token}`,
});
```

Per-request headers override defaults. Call `setDefaultHeaders({})` to clear.
