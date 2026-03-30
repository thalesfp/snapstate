---
title: Advanced
description: Cross-store sync, custom HTTP clients, standalone usage, and TypeScript types
---

# Advanced

## Cross-Store Synchronization with derive()

Keep a local state path in sync with a value from an external store using `derive()`:

```typescript
class AuthStore extends SnapStore<{ token: string }> {
  constructor() {
    super({ token: "" });
  }

  get token() {
    return this.state.get("token");
  }

  setToken(t: string) {
    this.state.set("token", t);
  }
}

class ProfileStore extends SnapStore<{ authToken: string; name: string }> {
  constructor(authStore: AuthStore) {
    super({ authToken: "", name: "" });
    this.derive("authToken", authStore, (s) => s.token);
  }
}
```

`derive` uses `Object.is` comparison to skip no-op updates and is automatically cleaned up on `destroy()`.

## Custom HTTP Client

Replace the default `fetch`-based client globally:

```typescript
import { setHttpClient } from "@thalesfp/snapstate";

setHttpClient({
  async request(url, init) {
    // Use axios, ky, or any HTTP library
    const response = await myHttpLib.request({
      url,
      method: init?.method ?? "GET",
      data: init?.body,
      headers: init?.headers,
    });
    return response.data;
  },
});
```

## Using Without React

The core `snapstate` export has no React dependency:

```typescript
import { SnapStore } from "@thalesfp/snapstate";

class CounterStore extends SnapStore<{ count: number }> {
  constructor() {
    super({ count: 0 });
  }

  increment() {
    this.state.set("count", (prev) => prev + 1);
  }
}

const store = new CounterStore();

// Manual subscription
const unsub = store.subscribe("count", () => {
  console.log("Count:", store.getSnapshot().count);
});

store.increment(); // logs after microtask flush
```

## Low-Level createStore

For simple cases where you don't need a class:

```typescript
import { createStore } from "@thalesfp/snapstate";

const store = createStore({ count: 0, name: "test" });

store.get("count");       // 0
store.set("count", 5);
store.subscribe("count", () => { /* ... */ });
store.getSnapshot();      // { count: 5, name: "test" }
store.reset("count");     // back to 0
store.destroy();
```

## TypeScript Types

Snapstate exports several utility types:

```typescript
import type {
  DotPaths,        // Union of all valid dot-paths for a type
  GetByPath,       // Extract nested type at a dot-path
  AsyncStatus,     // { value, isIdle, isLoading, isReady, isError }
  OperationState,  // { status: AsyncStatus, error: string | null }
  HttpClient,      // { request<R>(url, init?) => Promise<R> }
  Subscribable,    // { subscribe(cb), getSnapshot() }
  ComputedRef,     // { get(), destroy() }
} from "@thalesfp/snapstate";
```

### DotPaths

Provides autocomplete for valid paths:

```typescript
interface State {
  user: { name: string; tags: string[] };
}

type Paths = DotPaths<State>;
// "user" | "user.name" | "user.tags"
```

### GetByPath

Extracts the type at a path:

```typescript
type Name = GetByPath<State, "user.name">; // string
```

## Performance Notes

- **Structural sharing** ensures unchanged subtrees keep reference identity across updates
- **Microtask batching** coalesces multiple synchronous sets into a single subscriber notification
- **Select mode** in `connect()` subscribes only to specific paths, avoiding unnecessary re-renders
- **Computed refs** are lazy -- they only recompute when dependencies actually change
- **TakeLatest** in async operations prevents stale responses from overwriting newer data
