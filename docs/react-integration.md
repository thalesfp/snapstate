---
title: React Integration
description: Connect stores to React components with the connect HOC and scoped stores
---

# React Integration

Import from `@thalesfp/snapstate/react` to get React-aware stores with `connect()` and `SnapStore.scoped()`.

```typescript
import { SnapStore } from "@thalesfp/snapstate/react";
```

## Which form to use

- **`select`**: the component needs specific state fields. Subscribes to those paths only, so unrelated changes never re-render it. This is the default choice.
- **`props` mapper**: the component needs derived or combined values, store getters, or `getStatus()`. Runs on every store change and skips re-renders via shallow equality of the result.
- **`SnapStore.scoped()`**: the store is used by exactly one component and should reset on every mount (detail pages, modals, wizards).
- **Shared singleton + `connect()`**: two or more components need the same data.

## Creating a Store

```typescript
interface AppState {
  count: number;
  user: { name: string };
}

class AppStore extends SnapStore<AppState> {
  constructor() {
    super({ count: 0, user: { name: "" } });
  }

  get count() {
    return this.state.get("count");
  }

  increment() {
    this.state.set("count", (prev) => prev + 1);
  }
}

const appStore = new AppStore();
```

Notice the pattern: components will call `increment()`, not write state themselves. Keeping writes inside store methods keeps the logic testable and the components dumb.

## connect() with select

For top-level keys, pass an array. Each key becomes a prop:

```tsx
const ConnectedTodos = todoStore.connect(TodoView, {
  select: ["todos", "filter"],
});
```

For nested paths, use the callback form with `pick`:

```tsx
const ConnectedName = userStore.connect(NameDisplay, {
  select: (pick) => ({
    name: pick("user.name"),
    avatar: pick("user.avatar"),
  }),
});
```

Paths are captured once when `connect()` runs, so `select` must always pick the same set of paths. No conditionals inside `select`. If you need dynamic selection, use the `props` mapper.

## connect() with a props mapper

The shorthand form takes the mapper as the second argument:

```tsx
function Counter({ count }: { count: number }) {
  return <span>{count}</span>;
}

const ConnectedCounter = appStore.connect(Counter, (store) => ({
  count: store.count,
}));
```

The component re-renders only when the mapped values change under shallow comparison. That comparison is per-key reference equality, so avoid creating fresh arrays or objects in the mapper (`todos.filter(...)` creates a new array every time and defeats the check). Derive such values in the store with `computed`, or map the raw array and filter during render.

Own props pass through untouched:

```tsx
<ConnectedCounter label="Total" />  // label reaches the component alongside count
```

## Async data loading

Add `fetch` to load data on mount, plus `loading` and `error` components for the in-between states. Works with both `select` and `props`:

```tsx
const ConnectedProfile = userStore.connect(UserProfile, {
  select: ["user"],
  fetch: (store) => store.loadUser(),
  loading: () => <div>Loading...</div>,
  error: ({ error }) => <div>Error: {error}</div>,
});
```

### Config options

| Option | Description |
| --- | --- |
| `select` / `props` | What the component receives (pick one) |
| `fetch` | Async function on mount and when `deps` change |
| `loading` | Component while `fetch` runs |
| `error` | Component when `fetch` rejects; receives `{ error }` |
| `setup` | Sync side-effect before `fetch` |
| `cleanup` | Runs on unmount, and before re-running on `deps` change |
| `deps` | `(props, params) => unknown[]`; re-runs lifecycle when values change |
| `urlParams` | A `createUrlParams()` source; typed params flow into `fetch`, `setup`, `deps` |
| `template` | Layout component wrapped around the output |

All lifecycle options are StrictMode-safe.

## Dependencies (`deps`)

Re-run `fetch` when a prop or URL param changes:

```tsx
const ProjectDetail = projectStore.connect(ProjectView, {
  select: ["project"],
  fetch: (store, props) => store.fetchProject(props.id),
  cleanup: (store) => store.reset(),
  deps: (props) => [props.id],
  loading: () => <Skeleton />,
});
```

Return primitives from `deps` (`[props.id]`, `[params.filter]`). Returning a fresh object, or the whole `params` object, makes every render look like a change and refetches in a loop.

## scoped() for component-scoped stores

`SnapStore.scoped()` creates the store on mount and destroys it on unmount. Prefer it whenever the store serves exactly one component; each mount starts from clean state and nothing needs manual reset.

```tsx
const TodoDetail = SnapStore.scoped(TodoDetailView, {
  factory: () => new TodoDetailStore(),
  props: (store) => ({ todo: store.getSnapshot().todo }),
  fetch: (store, props) => store.fetchTodo(props.id),
  deps: (props) => [props.id],
  loading: () => <div>Loading...</div>,
});
```

Every mounted instance gets its own store, so two `TodoDetail` components on screen never share state. All lifecycle options work the same as in `connect()`. StrictMode-safe: the store is created in an effect so paired mount/unmount cycles create and destroy cleanly.

If a second component later needs the same data, promote the store to a shared singleton and switch to `connect()`.

## Template wrapping

`template` wraps the connected component in a layout. The template receives the same mapped props plus `children`, and renders only after the fetch guards, so `children` is always the ready component:

```tsx
function TodoLayout({ remaining, children }: { remaining: number; children: React.ReactNode }) {
  return (
    <div className="app">
      <h1>Todos ({remaining})</h1>
      {children}
    </div>
  );
}

const TodoApp = todoStore.connect(TodoAppInner, {
  select: ["remaining"],
  fetch: (s) => s.loadTodos(),
  template: TodoLayout,
  loading: () => <Skeleton />,
});
```

Works with `props`, `select`, and `scoped`.
