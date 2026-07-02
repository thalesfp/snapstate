---
title: Store API
description: Full reference for scalar, array, and public store methods
---

# Store API

Create stores by extending `SnapStore<T, K>`. `T` is the state shape; `K` is a union of async operation keys (omit it or use `never` when there are none). The protected `state` accessor provides all state operations.

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

Returns the full state object.

```typescript
const snapshot = this.state.get(); // { count: 0, label: "default" }
```

### `state.get(path)`

Returns the value at a dot-path, fully typed.

```typescript
this.state.get("count");  // 0, typed as number
this.state.get("label");  // "default", typed as string
```

### `state.set(path, value)`

Sets a value at a dot-path. Pass a function to update based on the previous value. A function argument is always treated as an updater, so do not store functions in state.

```typescript
this.state.set("count", 5);
this.state.set("count", (prev) => prev + 1);
```

### `state.batch(fn)`

Groups multiple sets into a single notification per listener.

```typescript
this.state.batch(() => {
  this.state.set("count", 10);
  this.state.set("label", "updated");
});
```

### `state.merge(updates)`

Sets multiple top-level keys in one batch. Prefer it over consecutive `set()` calls when replacing several keys.

```typescript
this.state.merge({ count: 10, label: "updated" });
```

### `state.computed(deps, fn)`

Creates a derived value from dependency paths. `get()` is always fresh: it compares dependency values by reference and recomputes only when one changed. Create the ref once (class field or constructor) and read it many times.

```typescript
const doubled = this.state.computed(["count"], (state) => state.count * 2);
doubled.get(); // 0
```

Call `.destroy()` on the ref if you need to freeze it early; after that, `get()` keeps returning the last value.

### `state.reset(...paths)`

Restores values to their initial state. Call with no arguments to reset everything, or pass specific paths (nested paths work too).

```typescript
this.state.reset("count");        // reset one key
this.state.reset("user.name");    // reset a nested path
this.state.reset();               // reset all state
```

## Array Operations

Array methods operate on state paths that point to arrays. Prefer them over manual spreads: they read as intent and preserve references for unchanged items, which keeps re-renders minimal.

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

Shallow-merges updates into every item matching the predicate. Preserves the prototype chain of class instances. Items that do not match keep their reference.

```typescript
this.state.patch("items", (item) => item.id === 1, { title: "Updated" });
```

### `state.remove(path, predicate)`

Removes items matching the predicate.

```typescript
this.state.remove("items", (item) => item.done);
```

### `state.removeAt(path, index)`

Removes an item by index. Negative indices count from the end. Throws `RangeError` when out of bounds.

```typescript
this.state.removeAt("items", 0);   // remove first
this.state.removeAt("items", -1);  // remove last
```

### `state.at(path, index)`

Reads an item by index. Negative indices count from the end.

```typescript
this.state.at("items", 0);  // first item, or undefined
```

### `state.filter(path, predicate)`

Returns matching items. Type predicates narrow the result type:

```typescript
const done = this.state.filter("items", (item) => item.done);

const standalone = this.state.filter("orgs", (o): o is StandaloneOrg => o.source === "standalone");
// standalone is StandaloneOrg[], not Org[]
```

### `state.find(path, predicate)`

Returns the first matching item, or `undefined`. Also supports type predicates.

```typescript
const item = this.state.find("items", (item) => item.id === 1);
```

### `state.findIndexOf(path, predicate)`

Returns the index of the first match, or -1.

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

Subscribe globally or to a specific path. Returns an unsubscribe function. Prefer path subscriptions; global listeners run on every change.

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
const { status, error } = store.getStatus("loadItems");
status.value;     // "idle" | "loading" | "ready" | "error"
status.isLoading; // boolean flags: isIdle, isLoading, isReady, isError
error;            // string | null
```

The returned object is frozen and keeps a stable identity until the status changes, so it is safe to use directly in `connect()` prop mappings without causing extra re-renders.

### `resetStatus(key?)`

Resets an operation's status to idle. Without a key, resets all operations. In-flight operations for the reset key become superseded: their results are ignored when they arrive. The underlying HTTP request is not aborted.

### `destroy()`

Tears down all subscriptions and `derive` bindings.

## Derive

Keep a local state path in sync with a value from an external store:

```typescript
class ChildStore extends SnapStore<{ userName: string }> {
  constructor(userStore: Subscribable<{ name: string }>) {
    super({ userName: "" });
    this.derive("userName", userStore, (s) => s.name);
  }
}
```

Uses `Object.is` to skip no-op updates. Automatically cleaned up on `destroy()`. Accepting a `Subscribable` in the constructor (instead of importing a concrete store) keeps the store testable with a minimal mock.
