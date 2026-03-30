---
title: Core Concepts
description: Dot-path state access, subscriptions, structural sharing, and batching
---

# Core Concepts

## Dot-Path State Access

All state in snapstate is accessed and mutated through **dot-separated string paths**. These paths map directly to your state shape and provide full TypeScript autocomplete.

```typescript
interface AppState {
  user: { name: string; age: number };
  items: { id: number; title: string }[];
}

class AppStore extends SnapStore<AppState> {
  constructor() {
    super({ user: { name: "Alice", age: 30 }, items: [] });
  }

  getName() {
    return this.state.get("user.name"); // "Alice" (typed as string)
  }

  setName(name: string) {
    this.state.set("user.name", name);
  }
}
```

Array elements are accessed via numeric segments: `"items.0.title"`.

## Subscriptions

Subscriptions are path-aware. When a path is notified:

- **Ancestor listeners** fire -- subscribing to `"user"` fires when `"user.name"` changes
- **Descendant listeners** fire -- subscribing to `"user.name"` fires when `"user"` changes
- **Wildcard listeners** (`*`) match any segment at that level
- **Global listeners** fire on every change

```typescript
const store = new AppStore();

// Listen to any change in the store
store.subscribe(() => console.log("something changed"));

// Listen to a specific path
const unsub = store.subscribe("user.name", () => {
  console.log("name changed:", store.getSnapshot().user.name);
});

// Unsubscribe when done
unsub();
```

## Structural Sharing

Every `set()` call produces a **new root object**, but subtrees that didn't change keep their reference identity. This is critical for React performance -- `useSyncExternalStore` can skip re-renders when references are stable.

```typescript
const store = new AppStore();
const snap1 = store.getSnapshot();

store.setName("Bob");
const snap2 = store.getSnapshot();

snap1 !== snap2;              // root changed
snap1.items === snap2.items;  // items untouched -- same reference
```

## Auto-Batching

By default, multiple synchronous `set()` calls are coalesced into a **single notification** via `queueMicrotask()`. Subscribers fire once with the final state.

```typescript
const store = new AppStore();

store.subscribe(() => console.log("notified")); // fires once, not twice

store.state.set("user.name", "Bob");
store.state.set("user.age", 31);
// After microtask flush: one notification
```

For immediate (synchronous) notifications, disable auto-batching:

```typescript
const raw = createStore({ count: 0 }, { autoBatch: false });
```

### Manual Batching

Group multiple updates explicitly with `batch()`:

```typescript
this.state.batch(() => {
  this.state.set("user.name", "Charlie");
  this.state.set("user.age", 25);
});
// Single notification after batch completes
```

## Computed Values

Derived values that recompute lazily when their dependencies change:

```typescript
class CartStore extends SnapStore<{ items: { price: number }[] }> {
  total = this.state.computed(["items"], (state) =>
    state.items.reduce((sum, i) => sum + i.price, 0)
  );

  constructor() {
    super({ items: [] });
  }
}

const cart = new CartStore();
cart.total.get(); // 0
```

Computed refs cache their value and only recalculate when a subscribed dependency path is notified as changed.

## Functional Updaters

`set()` accepts a function to update based on the previous value:

```typescript
this.state.set("count", (prev) => prev + 1);
```
