---
title: React Integration
description: Connect stores to React components with the connect HOC and scoped stores
---

# React Integration

Import from `snapstate/react` to get React-aware stores with the `connect` HOC.

```typescript
import { SnapStore } from "@thalesfp/snapstate/react";
```

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

  get userName() {
    return this.state.get("user.name");
  }

  increment() {
    this.state.set("count", (prev) => prev + 1);
  }
}

const appStore = new AppStore();
```

## connect() -- Simple Props Mapping

Map store state to component props. The component re-renders only when the mapped values change (shallow equality).

```tsx
function Counter({ count }: { count: number }) {
  return <span>{count}</span>;
}

const ConnectedCounter = appStore.connect(Counter, (store) => ({
  count: store.count,
}));

// Use it like a normal component
<ConnectedCounter />
```

Own props pass through:

```tsx
function Counter({ count, label }: { count: number; label: string }) {
  return <span>{label}: {count}</span>;
}

const ConnectedCounter = appStore.connect(Counter, (store) => ({
  count: store.count,
}));

<ConnectedCounter label="Total" />
```

## connect() -- With Fetch

Handle async data loading without `useEffect` or `useState`. Provide `loading` and `error` components for lifecycle states.

```tsx
function UserProfile({ name }: { name: string }) {
  return <h1>{name}</h1>;
}

const ConnectedProfile = userStore.connect(UserProfile, {
  props: (store) => ({ name: store.userName }),
  fetch: async (store) => {
    await store.loadUser();
  },
  loading: () => <div>Loading...</div>,
  error: ({ error }) => <div>Error: {error}</div>,
});
```

### Config Options

| Option | Description |
| --- | --- |
| `props` | Maps store state to component props |
| `fetch` | Async function called on mount (and when `deps` change) |
| `loading` | Component shown while fetch is in progress |
| `error` | Component shown when fetch fails, receives `{ error }` |
| `setup` | Callback on mount `(store, props) => void` |
| `cleanup` | Callback on unmount `(store, props) => void` |
| `deps` | `(props) => any[]` -- re-fetches when deps change |
| `template` | Wrapper component for the rendered output |

## connect() -- Select Mode

For granular subscriptions, pass an array of top-level keys:

```tsx
const ConnectedTodos = store.connect(TodoView, {
  select: ["todos", "filter"],
});
```

For nested paths, use the callback form with `pick`:

```tsx
const ConnectedName = store.connect(NameDisplay, {
  select: (pick) => ({
    name: pick("user.name"),
  }),
});
```

Paths are captured once at connect-time. The component only re-renders when the selected paths change, not on every store update.

Both forms support `fetch`:

```tsx
const ConnectedName = store.connect(NameDisplay, {
  select: (pick) => ({
    name: pick("user.name"),
  }),
  fetch: async (store) => {
    await store.loadUser();
  },
  loading: LoadingSpinner,
  error: ErrorBanner,
});
```

## scoped() -- Component-Scoped Stores

Create store instances that are tied to a component's lifecycle -- created on mount, destroyed on unmount.

```tsx
const ScopedTodoList = SnapStore.scoped(TodoList, {
  factory: () => new TodoStore(),
  props: (store) => ({ items: store.items }),
  fetch: async (store) => {
    await store.loadTodos();
  },
  loading: () => <div>Loading...</div>,
});
```

Each mounted instance gets its own store. Compatible with React StrictMode.

## Template Wrapping

Wrap connected components in a layout:

```tsx
function PageLayout({ children }: { children: React.ReactNode }) {
  return <div className="page">{children}</div>;
}

const ConnectedPage = store.connect(PageContent, {
  props: (store) => ({ data: store.data }),
  template: PageLayout,
});
```
