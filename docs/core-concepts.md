---
title: Core Concepts
description: Dot-path state access, subscriptions, structural sharing, and batching
---

# Core Concepts

Four ideas explain how Snapstate behaves: dot-path access, path-aware subscriptions, structural sharing, and batched notifications. Everything else builds on these.

## Dot-Path State Access

All state is read and written through dot-separated string paths. Paths map directly to your state shape and get full TypeScript autocomplete and type inference.

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
    return this.state.get("user.name"); // "Alice", typed as string
  }

  setName(name: string) {
    this.state.set("user.name", name);
  }
}
```

Array elements are addressed with numeric segments: `"items.0.title"`. When a path is written into a container that does not exist yet, Snapstate creates it: an array when the missing segment is a numeric index, an object otherwise.

## Subscriptions

Subscriptions are path-aware. When a path changes:

- **Exact listeners** fire: subscribing to `"user.name"` fires on `"user.name"` changes.
- **Ancestor listeners** fire: subscribing to `"user"` fires when `"user.name"` changes.
- **Descendant listeners** fire: subscribing to `"user.name"` fires when all of `"user"` is replaced.
- **Wildcard listeners** match exactly one segment: `"items.*.title"` fires for `"items.3.title"` but not for `"items.3.done"`.
- **Global listeners** (no path) fire on every change.

```typescript
const store = new AppStore();

// Any change in the store
store.subscribe(() => console.log("something changed"));

// A specific path
const unsub = store.subscribe("user.name", () => {
  console.log("name changed:", store.getSnapshot().user.name);
});

unsub();
```

Prefer path subscriptions over global ones. They are the reason a component connected with `select` never re-renders for unrelated changes.

## Structural Sharing

Every `set()` produces a new root object, but subtrees that did not change keep their reference identity. This is what makes React integration cheap: shallow comparisons can prove that nothing relevant changed.

```typescript
const store = new AppStore();
const snap1 = store.getSnapshot();

store.setName("Bob");
const snap2 = store.getSnapshot();

snap1 !== snap2;              // root changed
snap1.items === snap2.items;  // items untouched, same reference
```

The same property makes reference equality a reliable change signal everywhere else in the library: `computed` uses it to know when to recompute, and `derive` uses it to skip no-op updates.

## Notification Batching

Multiple synchronous `set()` calls coalesce into a single notification per listener. By default the flush happens on a microtask (`queueMicrotask`); state itself is always updated synchronously, only notifications are deferred.

```typescript
const store = new AppStore();

store.subscribe(() => console.log("notified")); // logs once

store.state.set("user.name", "Bob");
store.state.set("user.age", 31);
// state.get("user.age") is already 31 here; the notification arrives after the microtask
```

Each listener fires at most once per flush, no matter how many paths changed. To make notifications synchronous, disable auto-batching:

```typescript
const raw = createStore({ count: 0 }, { autoBatch: false });
```

### Manual Batching

`batch()` groups updates explicitly and flushes once at the end, regardless of the `autoBatch` setting:

```typescript
this.state.batch(() => {
  this.state.set("user.name", "Charlie");
  this.state.set("user.age", 25);
});
// One notification after the batch completes
```

For the common case of setting several top-level keys, `merge` is shorter:

```typescript
this.state.merge({ user: newUser, items: [] });
```

## Computed Values

`computed(deps, fn)` derives a value from state. Reads are always fresh: every `get()` compares the current dependency values against the last computation by reference and recomputes only when one changed. There is no notification lag, so reading immediately after a `set()` returns the up-to-date result.

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

Because change detection relies on reference identity, always update dependencies through `state` methods (which preserve structural sharing) rather than mutating objects in place.

## Functional Updaters

`set()` accepts a function to compute the next value from the previous one:

```typescript
this.state.set("count", (prev) => prev + 1);
```

Prefer an updater whenever the next value depends on the current one; it stays correct under batching where a read-then-write could race.

One consequence of this API: a function passed to `set()` is always treated as an updater, never stored as a value. Keep functions out of state and put behavior in store methods instead.
