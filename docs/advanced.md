---
title: Advanced
description: Cross-store sync, standalone usage, TypeScript types, and performance notes
---

# Advanced

## Cross-Store Synchronization with derive()

Keep a local state path in sync with a value from another store. The preferred setup injects the source through the constructor, so the store never imports a concrete singleton and stays testable with a mock:

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
  constructor(auth: Subscribable<{ token: string }>) {
    super({ authToken: "", name: "" });
    this.derive("authToken", auth, (s) => s.token);
  }
}

// app wiring
const authStore = new AuthStore();
const profileStore = new ProfileStore(authStore);

// test wiring
const profileUnderTest = new ProfileStore({
  subscribe: () => () => {},
  getSnapshot: () => ({ token: "test-token" }),
});
```

`derive` compares with `Object.is` to skip no-op updates and cleans up automatically on `destroy()`. The selector should return a stable reference for unchanged values; selecting a primitive (as above) is the safest pattern.

## Using Without React

The core `@snapstore/core` export has no React dependency. Stores work anywhere JavaScript runs:

```typescript
import { SnapStore } from "@snapstore/core";

class CounterStore extends SnapStore<{ count: number }> {
  constructor() {
    super({ count: 0 });
  }

  increment() {
    this.state.set("count", (prev) => prev + 1);
  }
}

const store = new CounterStore();

const unsub = store.subscribe("count", () => {
  console.log("Count:", store.getSnapshot().count);
});

store.increment(); // state updates immediately; the log arrives after the microtask flush
```

## Low-Level createStore

When a full class is overkill, `createStore` gives you the same reactive core as a plain object:

```typescript
import { createStore } from "@snapstore/core";

const store = createStore({ count: 0, name: "test" });

store.get("count");       // 0
store.set("count", 5);
store.subscribe("count", () => { /* ... */ });
store.getSnapshot();      // { count: 5, name: "test" }
store.reset("count");     // back to 0
store.destroy();
```

Prefer a `SnapStore` subclass as soon as the state has behavior attached; methods on a class are where business logic belongs.

## TypeScript Types

```typescript
import type {
  DotPaths,        // Union of all valid dot-paths for a type
  GetByPath,       // Extract the nested type at a dot-path
  AsyncStatus,     // { value, isIdle, isLoading, isReady, isError }
  OperationState,  // { status: AsyncStatus, error: string | null }
  HttpClient,      // { request<R>(url, init?) => Promise<R> }
  Subscribable,    // { subscribe(cb), getSnapshot() }
  ComputedRef,     // { get(), destroy() }
} from "@snapstore/core";
```

### DotPaths

Autocomplete for valid paths:

```typescript
interface State {
  user: { name: string; tags: string[] };
}

type Paths = DotPaths<State>;
// "user" | "user.name" | "user.tags"
```

### GetByPath

The type at a path:

```typescript
type Name = GetByPath<State, "user.name">; // string
```

These two types are what make `state.get`/`state.set` fully typed; use them to build your own typed helpers on top of a store.

## Performance Notes

- **Structural sharing**: unchanged subtrees keep reference identity across updates, so shallow comparisons are reliable change signals.
- **Batched notifications**: all synchronous `set()` calls in one flush produce at most one call per listener.
- **Select mode** in `connect()` subscribes to specific paths, so unrelated changes never reach the component.
- **Computed refs** compare dependency references on each read and recompute only when a dependency actually changed. Reads are always fresh, with no notification lag.
- **Take-latest** ensures a superseded response never overwrites newer data at a `target` path.
- **`getStatus` returns frozen, identity-stable objects**, so mapping status into props costs nothing between status changes.

The biggest lever in application code: prefer `select` over a `props` mapper that builds fresh objects or arrays, and derive expensive values with `computed` instead of recomputing them in every mapper run.
