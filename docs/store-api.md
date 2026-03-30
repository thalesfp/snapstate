---
title: Store API
description: Full reference for scalar, array, and public store methods
---

# Store API

Create stores by extending `SnapStore`. The protected `state` accessor provides all state operations.

```typescript
import { SnapStore } from "@thalesfp/snapstate";
// or from "@thalesfp/snapstate/react" for React integration

interface CounterState {
  count: number;
  label: string;
}

class CounterStore extends SnapStore<CounterState> {
  constructor() {
    super({ count: 0, label: "default" });
  }
}
```

## Scalar Operations

### `state.get()`

Returns the full state snapshot.

```typescript
const snapshot = this.state.get(); // { count: 0, label: "default" }
```

### `state.get(path)`

Returns the value at a dot-path.

```typescript
this.state.get("count");  // 0
this.state.get("label");  // "default"
```

### `state.set(path, value)`

Sets a value at a dot-path. Supports functional updaters.

```typescript
this.state.set("count", 5);
this.state.set("count", (prev) => prev + 1);
```

### `state.batch(fn)`

Groups multiple sets into a single notification.

```typescript
this.state.batch(() => {
  this.state.set("count", 10);
  this.state.set("label", "updated");
});
```

### `state.computed(deps, fn)`

Creates a lazy derived value from dependency paths.

```typescript
const doubled = this.state.computed(["count"], (state) => state.count * 2);
doubled.get(); // 0
```

### `state.reset(...paths)`

Restores values to their initial state. Call with no arguments to reset everything.

```typescript
this.state.reset("count");       // reset count only
this.state.reset();              // reset all state
```

## Array Operations

Array methods operate on state paths that point to arrays.

### `state.append(path, ...items)`

Adds items to the end of the array.

```typescript
this.state.append("items", { id: 1, title: "New" });
```

### `state.prepend(path, ...items)`

Adds items to the beginning.

```typescript
this.state.prepend("items", { id: 0, title: "First" });
```

### `state.insertAt(path, index, ...items)`

Inserts items at a specific position.

```typescript
this.state.insertAt("items", 2, { id: 3, title: "Middle" });
```

### `state.patch(path, predicate, updates)`

Shallow-merges updates into items matching the predicate. Preserves prototype chain.

```typescript
this.state.patch("items", (item) => item.id === 1, { title: "Updated" });
```

### `state.remove(path, predicate)`

Removes items matching the predicate.

```typescript
this.state.remove("items", (item) => item.done);
```

### `state.removeAt(path, index)`

Removes an item by index. Supports negative indices. Throws `RangeError` for out-of-bounds.

```typescript
this.state.removeAt("items", 0);   // remove first
this.state.removeAt("items", -1);  // remove last
```

### `state.at(path, index)`

Reads an item by index.

```typescript
this.state.at("items", 0);  // first item
```

### `state.filter(path, predicate)`

Returns matching items.

```typescript
const done = this.state.filter("items", (item) => item.done);
```

### `state.find(path, predicate)`

Returns the first matching item.

```typescript
const item = this.state.find("items", (item) => item.id === 1);
```

### `state.findIndexOf(path, predicate)`

Returns the index of the first match.

```typescript
const idx = this.state.findIndexOf("items", (item) => item.id === 1);
```

### `state.count(path, predicate)`

Counts matching items.

```typescript
const doneCount = this.state.count("items", (item) => item.done);
```

## Public Methods

### `subscribe(callback)` / `subscribe(path, callback)`

Subscribe globally or to a specific path. Returns an unsubscribe function.

```typescript
const unsub = store.subscribe("count", () => {
  console.log(store.getSnapshot().count);
});
unsub();
```

### `getSnapshot()`

Returns the current state. Compatible with React's `useSyncExternalStore`.

### `getStatus(key)`

Returns the `OperationState` for an async operation:

```typescript
const status = store.getStatus("loadItems");
// { status: AsyncStatus, error: string | null }
// status.value: "idle" | "loading" | "ready" | "error"
```

### `resetStatus(key?)`

Resets an operation's status to idle. Cancels in-flight requests. Without a key, resets all.

### `destroy()`

Tears down all subscriptions and derived bindings.

## Derive

Keep a local state path in sync with an external store:

```typescript
class ChildStore extends SnapStore<{ userName: string }> {
  constructor(userStore: Subscribable<{ name: string }>) {
    super({ userName: "" });
    this.derive("userName", userStore, (s) => s.name);
  }
}
```

Uses `Object.is` to skip no-op updates. Automatically cleaned up on `destroy()`.
