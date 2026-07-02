# Snapstate

> **Alpha.** APIs may change between releases.

State management for React built around class-based stores: testable, extensible, and predictable by default.

```bash
npm install @thalesfp/snapstate
```

## Why Snapstate

Snapstate keeps business logic out of React components. Components focus on rendering; stores hold the state, the rules, and the async work. Because stores are plain classes with no React coupling, you can unit test them without rendering anything.

Use Snapstate when:

- You want business logic in testable classes instead of `useEffect` chains.
- Shared state, loading states, and view lifecycle need to stay predictable.
- You want typed dot-path access (`"user.name"`) with granular re-renders.

Skip it when local component state and a few hooks are enough.

## Entry Points

| Import | What you get | Requires |
|---|---|---|
| `@thalesfp/snapstate` | Core `SnapStore`, `createStore`, types, `setHttpClient` | Nothing |
| `@thalesfp/snapstate/react` | `SnapStore` with `connect()` and `SnapStore.scoped()` | `react >= 18` |
| `@thalesfp/snapstate/form` | `SnapFormStore` with Zod validation and submit lifecycle | `react >= 18`, `zod >= 4` |
| `@thalesfp/snapstate/url` | `createUrlParams`, `syncToUrl` for URL search params | Nothing |

React and Zod are optional peer dependencies, needed only for their entry points. `qs` is bundled.

## Quick Start

A working feature is three small files: a store that owns the logic, a view that renders it, and any other component sharing the same store. No `useEffect`, no `useState`.

**`TodoStore.ts`** holds state, business logic, and the shared instance:

```ts
import { SnapStore } from "@thalesfp/snapstate/react";
import type { StoreOptions } from "@thalesfp/snapstate";

export interface Todo {
  id: string;
  text: string;
  done: boolean;
}

export interface TodoState {
  todos: Todo[];
}

export class TodoStore extends SnapStore<TodoState, "load"> {
  constructor(options?: StoreOptions) {
    super({ todos: [] }, options);
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

Accepting `StoreOptions` in the constructor is deliberate: it lets tests inject a mock HTTP client, as shown below.

**`TodoList.tsx`** renders, and `connect()` wires it up with fetch, loading, and error handling. Exporting the unconnected view keeps it testable with plain props:

```tsx
import { todoStore, type Todo } from "./TodoStore";

export function TodoListView({ todos }: { todos: Todo[] }) {
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
  select: ["todos"],
  fetch: (s) => s.loadTodos(),
  loading: () => <p>Loading...</p>,
  error: ({ error }) => <p>Error: {error}</p>,
});
```

**`TodoCount.tsx`** shows why the store lives at module level: any other component connects to the same instance, with no prop drilling:

```tsx
import { todoStore, type Todo } from "./TodoStore";

function TodoCountView({ todos }: { todos: Todo[] }) {
  return <p>{todos.filter((t) => !t.done).length} remaining</p>;
}

export const TodoCount = todoStore.connect(TodoCountView, {
  select: ["todos"],
});
```

If only one component ever used this store, you would create it with [`SnapStore.scoped()`](#scoped-stores) instead; the [next section](#choosing-the-right-tool) covers how to choose.

### Testing the store

Stores are plain classes, so store tests need no React at all. Inject a mock HTTP client through the constructor and call methods directly:

**`TodoStore.test.ts`**

```ts
import { expect, test, vi } from "vitest";
import type { HttpClient } from "@thalesfp/snapstate";
import { TodoStore } from "./TodoStore";

const todos = [{ id: "1", text: "Write docs", done: false }];
const mockClient: HttpClient = { request: vi.fn().mockResolvedValue(todos) };

test("loadTodos stores the response and tracks status", async () => {
  const store = new TodoStore({ httpClient: mockClient });

  await store.loadTodos();

  expect(store.getSnapshot().todos).toEqual(todos);
  expect(store.getStatus("load").status.isReady).toBe(true);
});

test("complete marks the matching todo as done", () => {
  const store = new TodoStore();
  store.addTodo("Write docs");
  const { id } = store.getSnapshot().todos[0];

  store.complete(id);

  expect(store.getSnapshot().todos[0].done).toBe(true);
});
```

### Testing the view

The unconnected view is an ordinary component. Render it with plain props; no store, no network:

**`TodoList.test.tsx`**

```tsx
import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { TodoListView } from "./TodoList";

test("renders todos and strikes through completed ones", () => {
  render(
    <TodoListView
      todos={[
        { id: "1", text: "Write docs", done: false },
        { id: "2", text: "Ship it", done: true },
      ]}
    />
  );

  expect(screen.getByText("Write docs")).toBeTruthy();
  expect(screen.getByText("Ship it").tagName).toBe("S");
});
```

This split is the testing story in miniature: business logic tests run against the store without rendering, and view tests run against plain props without a store.

## Choosing the Right Tool

This is the decision guide. Each row links to the section with details.

| Situation | Use |
|---|---|
| State shared by several components or features (auth, session, a todo list used across views) | A module-level store instance plus [`connect()`](#react-integration) |
| State that belongs to exactly one view, modal, or detail page, and should reset on every mount | [`SnapStore.scoped()`](#scoped-stores) |
| A component that should re-render only when specific fields change | [`select`](#granular-subscriptions-select) in the connect config |
| Props that combine or transform state, or call store getters | The [`props` mapper](#props-mapping) in the connect config |
| Form values, validation, and submit lifecycle | [`SnapFormStore`](#forms) |
| Reading URL search params into fetch and deps | [`createUrlParams`](#url-parameters) with the `urlParams` connect option |
| Mirroring store state into the URL | [`syncToUrl`](#writing-state-to-url) |
| A quick reactive value with no class or methods | [`createStore`](./docs/advanced.md#low-level-createstore) |

Rules of thumb:

- **Prefer `scoped()` when the store is used in one place.** A shared singleton for a detail page forces you to reset state manually between visits and leaks state between instances. `scoped()` creates a fresh store on mount and destroys it on unmount, so cleanup is automatic.
- **Prefer a shared singleton when two or more components need the same data.** Export the instance from a module (`export const todoStore = new TodoStore()`) and connect each component to it.
- **Prefer `select` over `props` for subscriptions.** `select` subscribes to specific paths, so the component re-renders only when those values change. Use the `props` mapper when you need derived values, getters, or conditional logic; it runs on every store change and relies on shallow equality of the result to skip re-renders.
- **Keep business logic in store methods.** Components should call intent methods (`store.complete(id)`), not write state directly. This keeps logic testable and components dumb.
- **Give every user-visible async operation its own key.** Keys drive `getStatus()`, which drives loading and error UI.

## Stores

`SnapStore<T, K>` is the base class. `T` is the state shape. `K` is a union of async operation keys (use `never` if the store has none).

State changes go through dot-paths (`"user.name"`, `"items.0.title"`), so listeners fire only when their path changes. Every `set()` produces a new root object while unchanged subtrees keep their reference identity (structural sharing). Multiple synchronous `set()` calls coalesce into a single notification per flush.

### State methods (`this.state.*`)

**Scalar:**

| Method | Description |
|---|---|
| `get()` | Full state object |
| `get(path)` | Value at a dot-path, fully typed |
| `set(path, value)` | Set a value, or pass an updater `(prev) => next` |
| `batch(fn)` | Group multiple sets into a single notification |
| `merge(updates)` | Set multiple top-level keys in a single batch |
| `computed(deps, fn)` | Derived value that recomputes when its dependency paths change |
| `reset()` | Restore all state to initial values |
| `reset(...paths)` | Restore only the given paths |

**Array:**

| Method | Description |
|---|---|
| `append(path, ...items)` | Add items to the end |
| `prepend(path, ...items)` | Add items to the start |
| `insertAt(path, index, ...items)` | Insert at index |
| `patch(path, predicate, updates)` | Shallow-merge into matching items |
| `remove(path, predicate)` | Remove matching items |
| `removeAt(path, index)` | Remove at index (negative indices allowed) |
| `at(path, index)` | Item at index (negative indices allowed) |
| `filter(path, predicate)` | Matching items (type predicates narrow the result) |
| `find(path, predicate)` | First match (type predicates narrow the result) |
| `findIndexOf(path, predicate)` | Index of first match, or -1 |
| `count(path, predicate)` | Number of matching items |

Good practices:

- **Prefer the array helpers over manual spreads.** `this.state.patch("todos", t => t.id === id, { done: true })` reads better and preserves references for unchanged items, which keeps re-renders minimal.
- **Prefer `merge` or `batch` when setting several keys at once.** Subscribers get one notification instead of several.

```ts
// One notification, not three
this.state.merge({ user, permissions, lastLogin: Date.now() });
```

- **Use updaters when the next value depends on the previous one.** `this.state.set("count", prev => prev + 1)` is safe under batching; reading then writing is not.
- **Do not store functions in state.** `set(path, fn)` always treats a function as an updater, so a function value would be called instead of stored. Store data; keep behavior in methods.

### Computed values

`computed(deps, fn)` derives a value from state. Reads are always fresh: `get()` compares the dependency values by reference and recomputes only when one of them changed. Create it once (as a class field or in the constructor) and call `.get()` to read:

```ts
class TodoStore extends SnapStore<State, never> {
  private remaining = this.state.computed(["todos"], (s) =>
    s.todos.filter((t) => !t.done).length
  );

  get remainingCount() {
    return this.remaining.get();
  }
}
```

Use `computed` for values that are expensive to derive or read from many places. For cheap one-liners, a getter that reads `this.state.get(...)` is simpler.

### Cross-store derivation (`this.derive`)

Keep a local state key in sync with a value selected from another store. It subscribes to the source, skips no-op updates with `Object.is`, and cleans up on `destroy()`.

```ts
class ProjectsStore extends SnapStore<{ companyId: string; projects: Project[] }, "fetch"> {
  constructor(company: Subscribable<{ currentCompany: { id: string } }>) {
    super({ companyId: "", projects: [] });
    this.derive("companyId", company, (s) => s.currentCompany.id);
  }
}
```

The source is any `Subscribable` (every `SnapStore` qualifies), so in tests you can pass a minimal mock instead of a real store. Injecting the dependency through the constructor, as above, is the pattern to prefer: it keeps stores decoupled and testable.

### Public interface

| Method | Description |
|---|---|
| `subscribe(callback)` | Subscribe to all changes; returns an unsubscribe function |
| `subscribe(path, callback)` | Subscribe to a specific path |
| `getSnapshot()` | Current state, compatible with `useSyncExternalStore` |
| `getStatus(key)` | Status of an async operation |
| `resetStatus(key?)` | Reset one operation (or all) back to idle |
| `destroy()` | Tear down subscriptions and derivations |

## Async Operations

The protected `this.api` accessor runs async work with automatic status tracking. Every method takes a single params object. With a `key`, the operation is tracked and readable via `getStatus(key)`; without one, it just runs.

| Method | Description |
|---|---|
| `fetch({ key?, fn })` | Run any async function, optionally tracked. Returns the value from `fn`. |
| `all({ key?, requests })` | Parallel requests, each stored at a target path |
| `get({ key?, url, target?, fallback?, onSuccess?, onError? })` | GET request |
| `post({ key?, url, body?, target?, onSuccess?, onError? })` | POST request |
| `put` / `patch` / `delete` | Same params as `post` |

### Storing responses: prefer `target`

`target` writes the response straight to a state path, with the path checked against your state type. Prefer it whenever the response maps directly to state; reach for `onSuccess` only when you need to transform the response first.

```ts
// Preferred: response lands at a typed state path
loadTodos() {
  return this.api.get({ key: "load", url: "/api/todos", target: "todos" });
}

// When you need to reshape the data
loadTodos() {
  return this.api.get<ApiTodo[]>({
    key: "load",
    url: "/api/todos",
    onSuccess: (rows) => this.state.set("todos", rows.map(toTodo)),
  });
}
```

Pass `fallback` alongside `target` on `get` to fall back to a default value when the request fails (the error is suppressed and the status still tracks it):

```ts
this.api.get({ key: "prefs", url: "/api/prefs", target: "prefs", fallback: defaultPrefs });
```

### Error handling

When `onError` is provided, the error is considered handled and does not propagate to the caller. Without `onError`, the promise rejects, so `await` it inside a `try/catch` or attach `.catch()`. If `onError` itself throws, that error propagates.

### Status tracking

`getStatus(key)` returns `{ status, error }` where `status` has boolean flags: `isIdle`, `isLoading`, `isReady`, `isError`. The returned object is frozen and keeps a stable identity until the status changes, so it is safe to map directly into component props:

```ts
const SaveButton = store.connect(SaveButtonView, {
  props: (s) => ({ saving: s.getStatus("save").status.isLoading }),
});
```

`resetStatus(key)` returns one operation to idle; `resetStatus()` resets all of them. Resetting also marks in-flight operations for that key as superseded, so their results are ignored when they land (the underlying HTTP request is not aborted).

### Take-latest semantics

Tracked operations follow take-latest per key: when a newer call starts with the same key, the older call stops updating status and no longer writes its response to `target`. For GET requests, a superseded response is ignored entirely, callbacks included. For mutations (POST, PUT, PATCH, DELETE), the superseded call's `onSuccess` and `onError` callbacks still run, because a completed mutation usually needs acknowledgment even if a newer one follows.

Take-latest does not debounce or cancel the HTTP request itself. Two rapid calls still send two requests; only the bookkeeping and state writes prefer the newer one. If double submission matters (a payment, a create), guard on status first:

```ts
save() {
  if (this.getStatus("save").status.isLoading) return;
  return this.api.post({ key: "save", url: "/api/save", body: this.state.get() });
}
```

### Parallel requests (`api.all`)

Load several endpoints under one tracked operation. Each response lands at its `target` path, written together in one batch when all requests finish:

```ts
async fetchDashboard() {
  await this.api.all({ key: "dashboard", requests: [
    { url: "/api/todos", target: "todos" },
    { url: "/api/stats", target: "stats" },
    { url: "/api/search", target: "results", method: "POST", body: { query: "active" } },
  ]});
}
```

A request with its own `onError` does not fail the batch; use it for optional data:

```ts
{ url: "/api/linear-teams", target: "linearTeams", onError: () => this.state.set("linearTeams", []) },
```

### Raw HTTP access (`this.http`)

Use `this.http` inside `api.fetch` when you need the response value rather than a state write, without creating a second tracked operation:

```ts
async refreshOrgCount(phaseId: string): Promise<number> {
  const result = await this.api.fetch({ key: "refreshOrgCount", fn: () =>
    this.http.request<{ count: number }>(`/api/phases/${phaseId}/org-count`)
  });
  return result?.count ?? 0;
}
```

## React Integration

Import `SnapStore` from `@thalesfp/snapstate/react` to get `connect()` and `SnapStore.scoped()`.

### Props mapping

The shorthand form takes just a mapper. The component re-renders when the mapped values change (shallow equality):

```tsx
const UserName = userStore.connect(
  ({ name }: { name: string }) => <span>{name}</span>,
  (store) => ({ name: store.getSnapshot().user.name }),
);
```

Use the object form when you need lifecycle options:

```tsx
const UserProfile = userStore.connect(ProfileView, {
  props: (s) => ({ user: s.getSnapshot().user }),
  fetch: (s) => s.loadUser(),
  loading: () => <Skeleton />,
  error: ({ error }) => <p>{error}</p>,
});
```

### Granular subscriptions (`select`)

Prefer `select` when the component needs specific fields: it subscribes to those paths only, so unrelated store changes never touch the component. For top-level keys, pass an array; each key becomes a prop:

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

Paths are captured once when `connect` runs, so the `select` callback must always pick the same set of paths. No conditionals inside `select`; if you need dynamic selection, use the `props` mapper instead.

### Lifecycle

```tsx
const Dashboard = dashboardStore.connect(DashboardView, {
  select: ["stats"],
  setup: (s) => s.initPolling(),
  fetch: (s) => s.loadStats(),
  cleanup: (s) => s.stopPolling(),
  loading: () => <Skeleton />,
});
```

| Option | When it runs | Typical use |
|---|---|---|
| `setup` | Before `fetch`, on mount (or when `deps` change) | Start timers, subscriptions |
| `fetch` | After `setup`, on mount (or when `deps` change) | Load data |
| `cleanup` | On unmount (or before re-running on `deps` change) | Stop timers, reset state |
| `loading` | While `fetch` is in progress | Spinner or skeleton |
| `error` | When `fetch` fails | Error message |

All lifecycle options are safe in React StrictMode.

### Dependencies (`deps`)

Return a dependency array from the component's own props (and URL params, if configured). When a value changes, `cleanup` runs, then `setup` and `fetch` re-run:

```tsx
const ProjectDetail = projectStore.connect(ProjectView, {
  select: ["project"],
  fetch: (s, props) => s.fetchProject(props.id),
  cleanup: (s) => s.reset(),
  deps: (props) => [props.id],
  loading: () => <Skeleton />,
});
```

Return primitives from `deps` (`[props.id]`, `[params.filter]`). Returning a fresh object or the whole `params` object makes every render look like a change and refetches in a loop.

### Template

Wrap the connected component in a layout that receives the same mapped props plus `children`:

```tsx
const TodoApp = todoStore.connect(TodoAppInner, {
  select: ["remaining"],
  fetch: (s) => s.loadTodos(),
  template: TodoLayout, // receives { remaining, children }
  loading: () => <Skeleton />,
});
```

The template renders after the fetch guards, so `children` is always the ready component.

### Scoped stores

`SnapStore.scoped()` creates the store when the component mounts and destroys it on unmount. **Prefer it whenever the store is used by exactly one component**: detail views, modals, wizards, editors. Each mount gets clean state, and there is nothing to reset or clean up manually.

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

`destroy()` runs automatically on unmount. All lifecycle options work the same as in `connect`. If two mounted components ever need to see the same data, switch to a shared singleton instead.

## Forms

`SnapFormStore<V, K>` extends the React store with Zod validation, DOM binding, and a submit lifecycle. Import from `@thalesfp/snapstate/form`; requires `zod >= 4`.

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
      await this.http.request("/api/login", { method: "POST", body: values });
    });
  }
}
```

Inside a `submit` handler, use `this.http` for the request. The submit itself is already tracked under the key, so calling `this.api.*` with the same key would double-track it.

### Binding inputs with `register()`

`register(field)` returns props to spread onto native inputs. It handles refs, value sync, and event binding for text, number, checkbox, radio, textarea, select (including multiple), range, date/time, and file inputs:

```tsx
const loginStore = new LoginStore();

function LoginFormView({ errors, submitting }: {
  errors: FormErrors<LoginValues>;
  submitting: boolean;
}) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); loginStore.login()?.catch(() => {}); }}>
      <input {...loginStore.register("email")} />
      {errors.email && <span>{errors.email[0]}</span>}

      <input type="password" {...loginStore.register("password")} />
      {errors.password && <span>{errors.password[0]}</span>}

      <button type="submit" disabled={submitting}>Log in</button>
    </form>
  );
}

export const LoginForm = loginStore.connect(LoginFormView, (s) => ({
  errors: s.errors,
  submitting: s.getStatus("login").status.isLoading,
}));
```

Two practices worth copying from this example:

- **Disable the submit button while submitting.** Submissions are not deduplicated automatically; a double click sends two requests.
- **Handle the promise from `submit()`.** It rejects when the handler throws. Await it in a `try/catch`, or attach `.catch()` and read the outcome from `submitStatus` in state.

### Validation modes

| Mode | Behavior | Choose it when |
|---|---|---|
| `onSubmit` (default) | Validate only when `submit()` runs | Short forms; least noisy |
| `onBlur` | Validate a field when it loses focus | Most forms; errors appear once the user finishes a field |
| `onChange` | Validate on every keystroke | Live feedback fields such as password strength |

### Form methods

| Method | Description |
|---|---|
| `register(field)` | Props for form elements |
| `setValue(field, value)` | Set a value programmatically and sync the DOM |
| `getValue(field)` / `getValues()` | Current values, including unsynced DOM input |
| `validate()` | Full-schema validation; returns parsed values or `null` |
| `validateField(field)` | Validate one field |
| `submit(key, handler)` | Validate, then run the handler with status tracking |
| `reset()` | Back to initial values; clears errors and submit status |
| `clear()` | Empty every field to a type-appropriate zero value |
| `setInitialValues(values)` | Replace initial values (e.g. after loading from an API) |
| `isDirty` / `isFieldDirty(field)` | Dirty tracking with Date and array-aware equality |
| `errors` / `isValid` | Per-field error arrays and overall validity |

## URL Parameters

`@thalesfp/snapstate/url` reads and writes URL search params reactively.

### Reading URL params

`createUrlParams<T>()` returns a typed `Subscribable` over `window.location.search`. It reacts to `popstate` and to SPA navigation (it patches `history.pushState`/`replaceState`, which do not fire events natively).

```ts
import { createUrlParams } from "@thalesfp/snapstate/url";

export const urlParams = createUrlParams<{ filter?: string; page?: string }>();

urlParams.getSnapshot(); // { filter: "active", page: "2" } from ?filter=active&page=2
```

The preferred integration is the `urlParams` connect option, which passes typed params to `fetch`, `setup`, and `deps` and re-runs them on navigation:

```tsx
const TodoApp = todoStore.connect(TodoAppView, {
  select: ["todos"],
  urlParams,
  fetch: (store, props, params) => {
    store.setFilter(params.filter ?? "all");
    return store.loadTodos();
  },
  deps: (props, params) => [params.filter],
  loading: () => <Spinner />,
});
```

To keep a param permanently mirrored in store state instead, use `derive`:

```ts
this.derive("filter", urlParams, (p) => (typeof p.filter === "string" ? p.filter : "all"));
```

### Writing state to URL

`syncToUrl()` mirrors selected state into the search string on every store change:

```ts
import { syncToUrl } from "@thalesfp/snapstate/url";

const unsub = syncToUrl(todoStore, {
  params: { filter: (s) => s.filter, page: (s) => s.page },
  history: "replace", // default; "push" adds history entries for back-button support
});
```

Empty, `null`, and `undefined` values are omitted from the URL. Call the returned function to stop syncing; call `urlParams.destroy()` to remove navigation listeners.

### Options

```ts
createUrlParams({
  initialParams: { filter: "all" }, // SSR and tests: skip window access
  listen: true,                     // react to navigation (default: true in browser)
  depth: 5,                         // max nesting depth for parsed objects
  parameterLimit: 1000,             // max number of params parsed
  arrayFormat: "brackets",          // "brackets" | "indices" | "comma" | "repeat"
});
```

## HTTP Client and Testing

The default client uses native `fetch`, JSON-serializes bodies, throws on non-2xx responses, and extracts `error`/`message` fields from JSON error bodies. Swap it globally with `setHttpClient`:

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

`setDefaultHeaders({ Authorization: ... })` merges headers into every request and works with both the default and custom clients. Both settings are module-level globals: fine in the browser, but on a server that renders for many users, do not put per-user tokens in them. Use a per-store client there instead.

A per-store client, passed through constructor options, overrides the global one for that store only. It is also the standard testing tool; see [Testing the store](#testing-the-store) in the Quick Start.

## Best Practices Summary

- Keep business logic in store methods; components call methods and render state.
- One shared store instance per domain, exported from a module. `scoped()` for stores used by a single view.
- Prefer `select` for subscriptions; use the `props` mapper for derived values.
- Prefer `target` for storing responses; `onSuccess` only to transform first.
- One `key` per user-visible operation; drive loading and error UI from `getStatus(key)`.
- Return primitives from `deps`.
- Guard mutations against double submission with `getStatus(key).status.isLoading`.
- Await (or `.catch()`) promises from `api.*` and `submit()` unless an `onError` handles them.
- Batch multi-key writes with `merge` or `batch`.
- Inject dependencies (other stores, `httpClient`) through constructors to keep stores testable.
- Do not store functions in state.

## Example App

A full Vite + React 19 demo lives in [`example/`](./example/): shared stores, scoped detail views, form submission, auth state, and URL-backed todo filters.

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
- [URL Parameters](./docs/url-params.md)
- [Advanced Topics](./docs/advanced.md)

## Benchmarks

See [BENCHMARKS.md](./BENCHMARKS.md) for detailed performance numbers.

## License

MIT
