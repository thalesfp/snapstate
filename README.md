# Snapstate

> **Alpha.** APIs may change between releases.

State management for React built around class-based stores: testable, extensible, and predictable by default.

```bash
npm install @thalesfp/snapstate
```

## When To Use Snapstate

Snapstate exists to keep business logic out of React components. React components should focus on rendering and UI interactions, not application rules. Overusing `useEffect` and `useState` often leads to logic that is difficult to test, difficult to extend, and hard to reason about. By moving business logic into explicit stores, the UI stays simpler, the logic becomes easier to test, and the application remains less coupled to React itself.

- Use it when you want testable store classes with minimal React coupling.
- Use it when shared state, loading states, and view lifecycle need to stay predictable.
- Use something smaller when local component state and a few hooks are enough.

## Entry Points

| Import | Description | Requires |
|---|---|---|
| `@thalesfp/snapstate` | Core `SnapStore`, types, `setHttpClient` | None |
| `@thalesfp/snapstate/react` | `SnapStore` with `connect()` HOC | `react` |
| `@thalesfp/snapstate/form` | `SnapFormStore` with Zod validation and form lifecycle | `react`, `zod` |
| `@thalesfp/snapstate/url` | `createUrlParams`, `syncToUrl` for URL search params | None |

React and Zod are optional peer dependencies, needed only when using their respective entry points. `qs` is bundled and requires no separate install.

## Choose The Right API

- Use `connect()` when you want simple store-to-props mapping for a shared store instance.
- Use `select` when a component should subscribe to specific state paths instead of the whole mapped snapshot.
- Use `SnapStore.scoped()` when each mounted view should get a fresh store instance.
- Use `SnapFormStore` when the main concern is form values, validation, and submit lifecycle.
- Use `createUrlParams` and `syncToUrl` when URL state should participate in the same store model.

## Table Of Contents

- [When To Use Snapstate](#when-to-use-snapstate)
- [Entry Points](#entry-points)
- [Choose The Right API](#choose-the-right-api)
- [Quick Start](#quick-start)
- [Stores](#stores)
- [React Integration](#react-integration)
- [Forms](#forms)
- [URL Parameters](#url-parameters)
- [Custom HTTP Client](#custom-http-client)
- [Example App](#example-app)
- [Docs](#docs)
- [Benchmarks](#benchmarks)
- [License](#license)

## Quick Start

### 1. Define a store

```ts
import { SnapStore } from "@thalesfp/snapstate/react";

interface State {
  todos: { id: string; text: string; done: boolean }[];
}

class TodoStore extends SnapStore<State, "load"> {
  constructor() {
    super({ todos: [] });
  }

  get todos() {
    return this.state.get("todos");
  }

  loadTodos() {
    return this.api.get({ key: "load", url: "/api/todos", target: "todos" });
  }

  addTodo(text: string) {
    this.state.append("todos", { id: crypto.randomUUID(), text, done: false });
  }

  complete(id: string) {
    this.state.patch("todos", (t) => t.id === id, { done: true });
  }
}

export const todoStore = new TodoStore();
```

### 2. Connect it to React

```tsx
function TodoListView({ todos }: { todos: State["todos"] }) {
  return (
    <ul>
      {todos.map((t) => (
        <li key={t.id} onClick={() => todoStore.complete(t.id)}>
          {t.done ? <s>{t.text}</s> : t.text}
        </li>
      ))}
    </ul>
  );
}

export const TodoList = todoStore.connect(TodoListView, {
  props: (s) => ({ todos: s.todos }),
  fetch: (s) => s.loadTodos(),
  loading: () => <p>Loading...</p>,
  error: ({ error }) => <p>Error: {error}</p>,
});
```

## Stores

Stores hold state, expose methods, and notify subscribers. State changes use dot-paths (`"user.name"`, `"items.0.title"`) so listeners only fire when their specific path changes. Synchronous `set()` calls are auto-batched via `queueMicrotask`, and every `set()` preserves reference identity for unchanged subtrees.

`SnapStore<T, K>` is the base class. `T` is the state shape, `K` is the union of async operation keys.

### State (`this.state.*`)

**Scalar:**

| Method | Description |
|---|---|
| `get()` | Full state object |
| `get(path)` | Value at a dot-path |
| `set(path, value)` | Set a value or pass an updater `(prev) => next` |
| `batch(fn)` | Group multiple sets into a single notification |
| `merge(updates)` | Set multiple top-level keys in a single batch |
| `computed(deps, fn)` | Lazily-recomputed derived value from dependency paths |
| `reset()` | Restore all state to initial values |
| `reset(...paths)` | Restore only the specified paths to initial values |

**Array:**

| Method | Description |
|---|---|
| `append(path, ...items)` | Add items to end |
| `prepend(path, ...items)` | Add items to start |
| `insertAt(path, index, ...items)` | Insert at index |
| `patch(path, predicate, updates)` | Shallow-merge into matching items |
| `remove(path, predicate)` | Remove matching items |
| `removeAt(path, index)` | Remove at index (supports negative) |
| `at(path, index)` | Get item at index (supports negative) |
| `filter(path, predicate)` | Return matching items (supports type predicates) |
| `find(path, predicate)` | Return first match (supports type predicates) |
| `findIndexOf(path, predicate)` | Index of first match, or -1 |
| `count(path, predicate)` | Count matching items |

`filter` and `find` accept type predicates to narrow discriminated unions:

```typescript
const completed = this.state.filter("todos", (t): t is CompletedTodo => t.completed);
// completed is CompletedTodo[], not Todo[]
```

`computed` derives a value from one or more state paths and recomputes lazily when any dependency changes. Create it once (in the constructor or as a class field) and call `.get()` to read it:

```typescript
class TodoStore extends SnapStore<State, never> {
  private remaining = this.state.computed(["todos"], (s) =>
    s.todos.filter((t) => !t.done).length
  );

  getRemainingCount() {
    return this.remaining.get();
  }
}
```

Call `.destroy()` to stop tracking if you need to tear it down early; otherwise it cleans up with the store.

### Async operations (`this.api.*`)

Tracked async operations use take-latest semantics by key: if a newer request starts for the same key, the older one stops updating status and state.

All methods take a single params object. When `key` is provided, the operation is tracked via `getStatus(key)`. When `key` is omitted, the request runs without status tracking.

| Method | Description |
|---|---|
| `fetch({ key?, fn })` | Run async function, optionally tracked. Returns the value from `fn`. |
| `all({ key?, requests })` | Parallel requests, each stored at a target path |
| `get({ key?, url, target?, fallback?, onSuccess?, onError? })` | GET request |
| `post({ key?, url, body?, target?, onSuccess?, onError? })` | POST request |
| `put` / `patch` / `delete` | Same params as `post` |

Pass `target` to store the response directly at a state path, or `onSuccess` for custom handling. The two are mutually exclusive; `target` takes precedence. Pass `fallback` with `target` on `get` to set a default value on error (suppresses the error). When `onError` is provided, the error is handled and does not propagate to the caller -- unless `onError` itself throws, in which case the thrown error propagates. Without `onError`, errors are rethrown.

**Status tracking:** `getStatus(key)` returns `{ status, error }` where `status` has boolean flags: `isIdle`, `isLoading`, `isReady`, `isError`. Call `resetStatus(key)` to return a single operation to `idle`, or `resetStatus()` with no arguments to reset all operations at once.

```typescript
// Reset a single operation (e.g. before a retry)
store.resetStatus("fetchUsers");

// Reset all operations (e.g. when the store is reused for a different context)
store.resetStatus();
```

#### Parallel requests (`api.all`)

Load multiple endpoints in parallel under a single tracked operation. Each request stores its response at the specified `target` path. Requests default to GET but support any HTTP method:

```typescript
async fetchDashboard() {
  await this.api.all({ key: "dashboard", requests: [
    { url: "/api/todos", target: "todos" },
    { url: "/api/stats", target: "stats" },
    { url: "/api/search", target: "results", method: "POST", body: { query: "active" } },
  ]});
}
```

Individual requests can have their own `onError` for per-request fallbacks. Requests with `onError` don't fail the batch:

```typescript
async loadSettings() {
  await this.api.all({ key: "settings", requests: [
    { url: "/api/teams", target: "teams" },
    { url: "/api/credentials", target: "credStatus" },
    { url: "/api/linear-teams", target: "linearTeams", onError: () => this.state.set("linearTeams", []) },
  ]});
}
```

Targets are type-safe: each must be a valid state path.

#### Raw HTTP access (`this.http`)

Use `this.http` inside `api.fetch` to make HTTP calls through the store's configured client without creating a separate tracked operation. `api.fetch` returns the value from `fn`:

```typescript
async refreshOrgCount(phaseId: string): Promise<number> {
  const { count } = await this.api.fetch({ key: "refreshOrgCount", fn: async () =>
    this.http.request<{ count: number }>(`/api/phases/${phaseId}/org-count`)
  });
  return count;
}
```

### Cross-store derivation (`this.derive`)

Keep a local state key in sync with a value selected from another store. Subscribes to the source, applies an `Object.is` change guard, and cleans up on `destroy()`.

```ts
class ProjectsStore extends SnapStore<{ companyId: string; projects: Project[] }, "fetch"> {
  constructor(company: Subscribable<{ currentCompany: { id: string } }>) {
    super({ companyId: "", projects: [] });
    this.derive("companyId", company, (s) => s.currentCompany.id);
  }
}
```

The source accepts any `Subscribable` (every `SnapStore` satisfies this), so stores stay testable in isolation. Pass a real store or a minimal mock.

### Public interface

| Method | Description |
|---|---|
| `subscribe(callback)` | Subscribe to all changes. Returns unsubscribe function |
| `subscribe(path, callback)` | Subscribe to a specific path |
| `getSnapshot()` | Current state (compatible with `useSyncExternalStore`) |
| `getStatus(key)` | Operation status |
| `resetStatus(key?)` | Reset operation to idle |
| `destroy()` | Tear down subscriptions and derivations |

## React Integration

`SnapStore` from `@thalesfp/snapstate/react` extends the core store with a `connect()` HOC.

### connect()

Use the shorthand form when you only need to map props. Pass the mapper function directly as the second argument:

```tsx
const UserName = userStore.connect(
  ({ name }: { name: string }) => <span>{name}</span>,
  (store) => ({ name: store.getSnapshot().user.name }),
);
```

Use the object form when you need lifecycle options (`fetch`, `setup`, `cleanup`, `loading`, `error`, `deps`):

```tsx
const UserProfile = userStore.connect(ProfileView, {
  props: (s) => ({ user: s.getSnapshot().user }),
  fetch: (s) => s.loadUser(),
  loading: () => <Skeleton />,
  error: ({ error }) => <p>{error}</p>,
});
```

### Granular subscriptions

For top-level keys, pass an array:

```tsx
const TodoApp = todoStore.connect(TodoView, {
  select: ["todos", "filter"],
});
```

For nested paths, use the callback form with `pick`:

```tsx
const UserCard = userStore.connect(CardView, {
  select: (pick) => ({
    name: pick("user.name"),
    avatar: pick("user.avatar"),
  }),
});
```

Both forms subscribe to the specified paths only, so the component re-renders only when those values change. `select` supports all lifecycle options (`fetch`, `setup`, `cleanup`, `loading`, `error`, `deps`).

### Lifecycle

```tsx
const Dashboard = dashboardStore.connect(DashboardView, {
  props: (s) => ({ stats: s.getSnapshot().stats }),
  setup: (s) => s.initPolling(),
  fetch: (s) => s.loadStats(),
  cleanup: (s) => s.stopPolling(),
  loading: () => <Skeleton />,
});
```

| Option | When it runs | Typical use |
|---|---|---|
| `setup` | Before `fetch`, on mount (or when `deps` change) | Start timers, subscriptions, AbortControllers |
| `fetch` | After `setup`, on mount (or when `deps` change) | Load data from the API |
| `cleanup` | On unmount (or before re-running on `deps` change) | Stop timers, reset store state |
| `loading` | While `fetch` is in progress | Render a spinner or skeleton |
| `error` | When `fetch` fails | Render an error message |

All lifecycle options are safe in React StrictMode.

### Dependencies

```tsx
const ProjectDetail = projectStore.connect(ProjectView, {
  select: ["project"],
  fetch: (s, props) => s.fetchProject(props.id),
  cleanup: (s) => s.reset(),
  deps: (props) => [props.id],
  loading: () => <Skeleton />,
});
```

`deps` returns a dependency array from the component's own props (and optionally URL params; see [URL Parameters](#url-parameters)). When values change, `cleanup` runs for the previous deps, then `fetch` and `setup` re-run. Without `deps`, lifecycle callbacks run once on mount.

### Template

Wrap the connected component in a layout that also receives store-derived props:

```tsx
function TodoLayout({ remaining, children }: { remaining: number; children: React.ReactNode }) {
  return (
    <div className="app">
      <h1>Todos ({remaining})</h1>
      {children}
    </div>
  );
}

function TodoAppInner({ remaining }: { remaining: number }) {
  return <p>{remaining} items left</p>;
}

const TodoApp = todoStore.connect(TodoAppInner, {
  select: ["remaining"],
  fetch: (s) => s.loadTodos(),
  template: TodoLayout,
  loading: () => <Skeleton />,
});
```

The `template` component receives the same mapped props as the inner component, plus `children` (the rendered inner component). It renders after fetch guards, so `children` is always the ready component. Works with `props`, `select`, and `scoped`.

### Scoped stores

`SnapStore.scoped()` creates a store when the component mounts and destroys it on unmount, giving each instance its own isolated state. Use it for detail views, forms, or modals that need fresh state on every mount.

```tsx
import { SnapStore } from "@thalesfp/snapstate/react";

class TodoDetailStore extends SnapStore<{ todo: Todo | null }, "fetch"> {
  constructor() {
    super({ todo: null });
  }

  fetchTodo(id: string) {
    return this.api.get({ key: "fetch", url: `/api/todos/${id}`, target: "todo" });
  }
}

const TodoDetail = SnapStore.scoped(TodoDetailView, {
  factory: () => new TodoDetailStore(),
  props: (store) => ({ todo: store.getSnapshot().todo }),
  fetch: (store, props) => store.fetchTodo(props.id),
  deps: (props) => [props.id],
  loading: () => <Skeleton />,
});
```

No manual `cleanup` or `reset()` needed. `destroy()` runs automatically on unmount. All lifecycle options (`setup`, `cleanup`, `fetch`, `deps`, `loading`, `error`) work the same as in `connect`.

## Forms

`SnapFormStore<V, K>` extends `SnapStore`. Available from `@thalesfp/snapstate/form`. Requires `zod` peer dependency.

```ts
import { SnapFormStore } from "@thalesfp/snapstate/form";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

type LoginValues = z.infer<typeof schema>;

class LoginStore extends SnapFormStore<LoginValues, "login"> {
  constructor() {
    super(schema, { email: "", password: "" }, { validationMode: "onBlur" });
  }

  login() {
    return this.submit("login", async (values) => {
      await this.api.post({ key: "login", url: "/api/login", body: values });
    });
  }
}
```

### register()

Returns props to spread onto form elements. Handles ref tracking, value sync, and event binding:

```tsx
const loginStore = new LoginStore();

function LoginFormView({ errors }: { errors: FormErrors<LoginValues> }) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); loginStore.login(); }}>
      <input {...loginStore.register("email")} />
      {errors.email && <span>{errors.email[0]}</span>}

      <input type="password" {...loginStore.register("password")} />
      {errors.password && <span>{errors.password[0]}</span>}

      <button type="submit">Log in</button>
    </form>
  );
}

export const LoginForm = loginStore.connect(LoginFormView, (s) => ({
  errors: s.errors,
}));
```

### Validation modes

| Mode | Behavior |
|---|---|
| `onSubmit` | Validate only when `submit()` is called (default) |
| `onBlur` | Validate field on blur |
| `onChange` | Validate field on every change |

### Form methods

| Method | Description |
|---|---|
| `register(field)` | Props for form elements: `ref`, `name`, `onBlur`, `onChange`, and `defaultValue` (or `defaultChecked` for boolean fields) |
| `setValue(field, value)` | Set field value |
| `getValue(field)` | Get current field value (reads from DOM ref if registered) |
| `getValues()` | Get all current values |
| `validate()` | Validate full form, returns parsed data or `null` |
| `validateField(field)` | Validate single field |
| `submit(key, handler)` | Validate then call handler with async status tracking. Use `this.http` for HTTP calls inside the handler -- `api.*` methods cause double status tracking. |
| `reset()` | Reset to initial values |
| `clear()` | Clear to type-appropriate zero values |
| `setInitialValues(values)` | Update initial values |
| `isDirty` / `isFieldDirty(field)` | Dirty tracking (supports Date and array equality) |
| `errors` / `isValid` | Field-level error arrays |

Supported elements: text inputs, number, checkbox, textarea, select, range, radio, date/time/datetime-local, select multiple, and file inputs.

## URL Parameters

`@thalesfp/snapstate/url` provides reactive URL search parameter reading and writing.

### Reading URL params

`createUrlParams<T>()` returns a typed `Subscribable` that parses `window.location.search`. It detects navigation via `popstate` and by patching `history.pushState` and `history.replaceState` globally, since the browser does not fire `popstate` for those.

```ts
import { createUrlParams } from "@thalesfp/snapstate/url";

const urlParams = createUrlParams<{ filter?: string; page?: string }>();

urlParams.getSnapshot(); // { filter: "active", page: "2" } from ?filter=active&page=2
```

Use it with `derive()` to sync URL params into store state:

```ts
class AppStore extends SnapStore<{ filter: string }> {
  constructor() {
    super({ filter: "all" });
    this.derive("filter", urlParams, (p) => (p.filter as string) ?? "all");
  }
}
```

Or pass it to `connect()` so `fetch`, `setup`, and `deps` receive typed params automatically:

```tsx
const TodoApp = todoStore.connect(TodoAppView, {
  props: (s) => ({ todos: s.filteredTodos }),
  urlParams,
  fetch: (store, props, params) => {
    // params.filter is typed as string | undefined
    if (params.filter) store.setFilter(params.filter);
    return store.loadTodos();
  },
  deps: (props, params) => [params.filter],
  loading: () => <Spinner />,
});
```

### Writing state to URL

`syncToUrl()` subscribes to a store and mirrors selected state into URL search params:

```ts
import { syncToUrl } from "@thalesfp/snapstate/url";

const unsub = syncToUrl(todoStore, {
  params: {
    filter: (s) => s.filter,
    page: (s) => s.page,
  },
  history: "replace", // default; use "push" for back-button navigation
});
```

Empty, null, and undefined values are omitted from the URL. The subscriber skips `qs.stringify` entirely when the tracked params haven't changed.

### Parsing features

Powered by `qs`, supports nested objects, arrays, dot notation, and depth/parameter limits:

```
?user[name]=John          → { user: { name: "John" } }
?colors[]=red&colors[]=blue → { colors: ["red", "blue"] }
?user.name=John           → { user: { name: "John" } }
```

### Options

```ts
createUrlParams({
  initialParams: { filter: "all" },  // SSR/testing (bypass window)
  listen: true,                       // Listen to navigation events (default: true in browser)
  depth: 5,                           // Max nesting depth (default: 5)
  parameterLimit: 1000,               // Max params to parse (default: 1000)
  arrayFormat: "brackets",            // "brackets" | "indices" | "comma" | "repeat"
});
```

### Cleanup

```ts
urlParams.destroy();  // Remove event listeners
unsub();              // Stop syncing to URL (return value of syncToUrl)
```

## Custom HTTP Client

By default, snapstate uses the native `fetch` API, sets no auth headers, and throws on non-2xx responses. Override it globally with `setHttpClient`, or per-store via constructor options. `setDefaultHeaders` works with both the default and custom clients -- headers are merged at the API method level before reaching the client.

```ts
import { setHttpClient } from "@thalesfp/snapstate";

setHttpClient({
  async request(url, init) {
    const res = await fetch(url, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${getToken()}` },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return text ? JSON.parse(text) : undefined;
  },
});
```

Pass `httpClient` via constructor options to override the global client for that store only. Useful for testing:

```typescript
const mockClient: HttpClient = {
  async request(url) { return { id: "1", name: "Test" }; },
};

const store = new UserStore({ httpClient: mockClient });
```

## Example App

A full Vite + React 19 demo lives in [`example/`](./example/) and shows shared stores, scoped detail views, form submission, auth state, and URL-backed todo filters.

```bash
npm run build            # Build the library used by the example
npm run example:install  # Install example deps (first time)
npm run example:dev      # Start the Vite app and mock API together
```

## Docs

- [Getting Started](./docs/README.md)
- [Core Concepts](./docs/core-concepts.md)
- [Store API](./docs/store-api.md)
- [React Integration](./docs/react-integration.md)
- [Async & HTTP](./docs/async-http.md)
- [Forms](./docs/forms.md)
- [Advanced Topics](./docs/advanced.md)

## Benchmarks

See [BENCHMARKS.md](./BENCHMARKS.md) for detailed performance numbers.

## License

MIT
