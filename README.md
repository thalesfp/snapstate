# Snapstate

> **Alpha** — APIs may change between releases.

State management for React. Class-based stores that are easy to test, easy to extend, and predictable by default.

```bash
npm install @thalesfp/snapstate
```

## Entry Points

| Import | Description |
|---|---|
| `@thalesfp/snapstate` | Core `SnapStore`, types, `setHttpClient` |
| `@thalesfp/snapstate/react` | `SnapStore` with `connect()` HOC |
| `@thalesfp/snapstate/form` | `SnapFormStore` with Zod validation and form lifecycle |
| `@thalesfp/snapstate/url` | `createUrlParams`, `syncToUrl` for URL search params |

React and Zod are optional peer dependencies — only needed if you use their respective entry points. `qs` is bundled and requires no separate install.

## Quick Start

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

All methods take a single params object. When `key` is provided, the operation is tracked via `getStatus(key)` with take-latest semantics. When `key` is omitted, the request runs without status tracking.

| Method | Description |
|---|---|
| `fetch({ key?, fn })` | Run async function, optionally tracked |
| `all({ key?, requests })` | Parallel GETs, each stored at a target path |
| `get({ key?, url, target?, onSuccess?, onError? })` | GET request |
| `post({ key?, url, body?, target?, onSuccess?, onError? })` | POST request |
| `put` / `patch` / `delete` | Same params as `post` |

Pass `target` to store the response directly at a state path, or `onSuccess` for custom handling — not both; `target` takes precedence if both are provided. When `onError` is provided, the error is handled and does not propagate to the caller. Without `onError`, errors are rethrown.

**Status tracking:** `getStatus(key)` returns `{ status, error }` where `status` has boolean flags: `isIdle`, `isLoading`, `isReady`, `isError`. Call `resetStatus(key)` to return a single operation to `idle`, or `resetStatus()` with no arguments to reset all operations at once.

```typescript
// Reset a single operation (e.g. before a retry)
store.resetStatus("fetchUsers");

// Reset all operations (e.g. when the store is reused for a different context)
store.resetStatus();
```

#### Parallel requests (`api.all`)

Load multiple endpoints in parallel under a single tracked operation. Each request stores its response at the specified `target` path:

```typescript
async fetchDashboard() {
  await this.api.all({ key: "dashboard", requests: [
    { url: "/api/todos", target: "todos" },
    { url: "/api/stats", target: "stats" },
  ]});
}
```

Targets are type-safe -- each must be a valid state path.

#### Raw HTTP access (`this.http`)

For cases `api.all` doesn't cover (non-GET requests, custom response handling), use `this.http` inside `api.fetch` to make HTTP calls through the store's configured client without creating a separate tracked operation:

```typescript
async fetchDashboard() {
  await this.api.fetch({ key: "dashboard", fn: async () => {
    const [todos, stats] = await Promise.all([
      this.http.request<Todo[]>("/api/todos"),
      this.http.request<Stats>("/api/stats"),
    ]);

    this.state.merge({ todos, stats });
  }});
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

The source accepts any `Subscribable` (every `SnapStore` satisfies this), so stores stay testable in isolation -- pass a real store or a minimal mock.

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

Use the shorthand form when you only need to map props — pass the mapper function directly as the second argument:

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

```tsx
const UserCard = userStore.connect(CardView, {
  select: (pick) => ({
    name: pick("user.name"),
    avatar: pick("user.avatar"),
  }),
});
```

`pick(path)` subscribes to that exact path -- the component only re-renders when those values change. `select` supports all lifecycle options (`fetch`, `setup`, `cleanup`, `loading`, `error`, `deps`).

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
  select: (pick) => ({ project: pick("project") }),
  fetch: (s, props) => s.fetchProject(props.id),
  cleanup: (s) => s.reset(),
  deps: (props) => [props.id],
  loading: () => <Skeleton />,
});
```

`deps` returns a dependency array from the component's own props (and optionally URL params — see [URL Parameters](#url-parameters)). When values change, `cleanup` runs for the previous deps, then `fetch` and `setup` re-run. Without `deps`, lifecycle callbacks run once on mount.

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
  select: (pick) => ({ remaining: pick("remaining") }),
  fetch: (s) => s.loadTodos(),
  template: TodoLayout,
  loading: () => <Skeleton />,
});
```

The `template` component receives the same mapped props as the inner component, plus `children` (the rendered inner component). It renders after fetch guards, so `children` is always the ready component. Works with `props`, `select`, and `scoped`.

### Scoped stores

`SnapStore.scoped()` creates a store when the component mounts and destroys it on unmount. Each instance gets its own isolated store — useful for detail views, forms, or modals that need fresh state on every mount.

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

No manual `cleanup` or `reset()` needed — `destroy()` runs automatically on unmount. All lifecycle options (`setup`, `cleanup`, `fetch`, `deps`, `loading`, `error`) work the same as in `connect`.

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

Returns props to spread onto form elements -- handles ref tracking, value sync, and event binding:

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
| `submit(key, handler)` | Validate then call handler with async status tracking |
| `reset()` | Reset to initial values |
| `clear()` | Clear to type-appropriate zero values |
| `setInitialValues(values)` | Update initial values |
| `isDirty` / `isFieldDirty(field)` | Dirty tracking (supports Date and array equality) |
| `errors` / `isValid` | Field-level error arrays |

Supported elements: text inputs, number, checkbox, textarea, select, range, radio, date/time/datetime-local, select multiple, and file inputs.

## URL Parameters

`@thalesfp/snapstate/url` provides reactive URL search parameter reading and writing.

### Reading URL params

`createUrlParams<T>()` returns a typed `Subscribable` that parses `window.location.search`. It automatically detects navigation via `popstate`, `pushState`, and `replaceState` — the latter two are detected by patching `history.pushState` and `history.replaceState` globally, since the browser doesn't fire `popstate` for them.

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

By default, snapstate uses the native `fetch` API, sets no auth headers, and throws on non-2xx responses. Override it globally with `setHttpClient`, or per-store via constructor options.

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

Pass `httpClient` via constructor options to override the global client for that store only — useful for testing:

```typescript
const mockClient: HttpClient = {
  async request(url) { return { id: "1", name: "Test" }; },
};

const store = new UserStore({ httpClient: mockClient });
```

## Example App

A full Vite + React 19 demo lives in [`example/`](./example/) with todos, auth, and account profile features.

```bash
npm run build                  # Build library first
cd example && npm install      # Install example deps (first time)
cd .. && npm run example:dev   # Start dev server + mock API
```

## Benchmarks

See [BENCHMARKS.md](./BENCHMARKS.md) for detailed performance numbers.

## License

MIT
