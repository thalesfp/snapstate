# snapstate

Reactive state management for React. Class-based stores with a clean public API — business logic stays in the store, components stay dumb.

## Philosophy

No more `useState` hell. No more `useEffect` spaghetti. Just stores that work.

- **Readable** — stores are plain classes with explicit methods; no magic, no hidden wiring
- **Testable** — business logic tested separately from React; stores are plain objects (call methods, assert state), no rendering or providers needed. Unit and integration tests are equally simple to write
- **Extensible** — inherit from `SnapStore`, add methods, compose stores; no middleware chains or plugin systems
- **Predictable** — state flows in one direction, updates are synchronous within a batch, and structural sharing guarantees stable references for unchanged data
- **Dumb views** — components receive props and render; business logic lives in stores, not in hooks or event handlers

## Why?

### Before — the `useState` + `useEffect` version

```tsx
function UserList() {
  const [users, setUsers] = useState<User[]>([]);
  const [filter, setFilter] = useState<"all" | "active">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/users")
      .then((r) => r.json())
      .then((data) => { if (!cancelled) { setUsers(data); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const filtered = filter === "active" ? users.filter((u) => u.active) : users;

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error}</p>;
  return (
    <div>
      <button onClick={() => setFilter(filter === "all" ? "active" : "all")}>{filter}</button>
      <ul>{filtered.map((u) => <li key={u.id}>{u.name}</li>)}</ul>
    </div>
  );
}
```

### After — the snapstate version

**Store** (encapsulates all state + async):

```ts
class UserStore extends SnapStore<{ users: User[]; filter: "all" | "active" }, "load"> {
  constructor() { super({ users: [], filter: "all" }); }

  get filtered() {
    const { users, filter } = this.state.get();
    return filter === "active" ? users.filter((u) => u.active) : users;
  }

  loadUsers() {
    return this.api.get("load", "/api/users", (data) => this.state.set("users", data));
  }

  toggleFilter() {
    this.state.set("filter", (f) => (f === "all" ? "active" : "all"));
  }
}
```

**Component** (pure function of props):

```tsx
function UserListInner({ filtered }: { filtered: User[] }) {
  return <ul>{filtered.map((u) => <li key={u.id}>{u.name}</li>)}</ul>;
}

export const UserList = userStore.connect(UserListInner, {
  props: (s) => ({ filtered: s.filtered }),
  fetch: (s) => s.loadUsers(),
  loading: () => <p>Loading...</p>,
  error: ({ error }) => <p>Error: {error}</p>,
});
```

## Install

```bash
npm install snapstate
```

## Quick start

```ts
import { SnapStore } from "snapstate/react";

interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

type TodoOp = "add" | "toggle";

interface TodoState {
  todos: Todo[];
  filter: "all" | "active" | "completed";
}

class TodoStore extends SnapStore<TodoState, TodoOp> {
  constructor() {
    super({ todos: [], filter: "all" });
  }

  addTodo(text: string) {
    return this.api.post<Todo>("add", "/api/todos", {
      body: { text },
      onSuccess: (todo) => this.state.append("todos", todo),
    });
  }

  toggleTodo(id: string) {
    this.state.patch("todos", (t) => t.id === id, { completed: true });
  }
}
```

## React usage

```tsx
// store.ts
import { SnapStore } from "snapstate/react";

const todoStore = new TodoStore();

// TodoList.tsx
function TodoListInner({ todos, remaining }: { todos: Todo[]; remaining: number }) {
  return (
    <div>
      <h2>{remaining} left</h2>
      <ul>
        {todos.map((t) => (
          <li key={t.id} onClick={() => todoStore.toggleTodo(t.id)}>
            {t.completed ? <s>{t.text}</s> : t.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

// connect() wires the component to the store.
// It re-renders only when the mapped props change (shallow comparison).
export const TodoList = todoStore.connect(TodoListInner, (store) => ({
  todos: store.filteredTodos,
  remaining: store.remaining,
}));

// connect() with async fetch, loading, and error handling.
// Calls `fetch` on mount, renders `loading` while pending, `error` on failure.
export const TodoListAsync = todoStore.connect(TodoListInner, {
  props: (store) => ({
    todos: store.filteredTodos,
    remaining: store.remaining,
  }),
  fetch: (store) => store.loadTodos(),
  loading: () => <p>Loading...</p>,
  error: ({ error }) => <p>Failed: {error}</p>,
});
```

## Granular selectors

```tsx
// connect() with granular path-based subscriptions.
// Only re-renders when the specific picked paths change.
export const UserCard = userStore.connect(UserCardInner, {
  select: (pick) => ({
    name: pick("user.name"),
    avatar: pick("user.avatar"),
  }),
});
```

`pick(path)` reads a value at a dot-path and subscribes to that exact path. The component won't re-render when unrelated state changes (e.g. `settings.theme`).

**`props` vs `select`** — `props` receives the full store instance, so it can access computed getters and derived values. `select` only reads raw state at dot-paths, but subscribes granularly — use it when you want precise re-render control over raw state.

## Optimistic updates

```ts
// deleteTodo: remove immediately, rollback on API failure
deleteTodo(id: string) {
  const idx = this.state.findIndexOf("todos", (t) => t.id === id);
  const removed = this.state.at("todos", idx)!;
  this.state.removeAt("todos", idx);

  return this.api.delete("remove", `/api/todos/${id}`, {
    onError: () => this.state.insertAt("todos", idx, removed),
  });
}
```

## Custom HTTP client

```ts
import { setHttpClient } from "snapstate/react";

// Add auth header to every request
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

## Computed values

```ts
class TodoStore extends SnapStore<TodoState, TodoOp> {
  activeTodos = this.state.computed(["todos"], (s) =>
    s.todos.filter((t) => !t.completed),
  );

  // activeTodos.value lazily recomputes when "todos" changes
}
```

## Form stores

`SnapFormStore` extends `ReactSnapStore` with Zod schema validation, per-field errors, dirty tracking, and a submit lifecycle. Available from `snapstate/form`.

> Requires `zod` as a peer dependency.

```ts
import { SnapFormStore } from "snapstate/form";
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
      await this.api.post("login", "/api/login", { body: values });
    });
  }
}

const loginStore = new LoginStore();
```

```tsx
function LoginFormInner({ values, errors, isDirty }: {
  values: LoginValues;
  errors: FormErrors<LoginValues>;
  isDirty: boolean;
}) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); loginStore.login(); }}>
      <input
        value={values.email}
        onChange={(e) => loginStore.setValue("email", e.target.value)}
        onBlur={() => loginStore.handleBlur("email")}
      />
      {errors.email && <span>{errors.email[0]}</span>}

      <input
        type="password"
        value={values.password}
        onChange={(e) => loginStore.setValue("password", e.target.value)}
        onBlur={() => loginStore.handleBlur("password")}
      />
      {errors.password && <span>{errors.password[0]}</span>}

      <button disabled={!isDirty}>Log in</button>
    </form>
  );
}

export const LoginForm = loginStore.connect(LoginFormInner, (s) => ({
  values: s.values,
  errors: s.errors,
  isDirty: s.isDirty,
}));
```

**Validation modes:**

| Mode | Behavior |
|---|---|
| `onSubmit` | Validate only when `submit()` is called (default) |
| `onBlur` | Validate a field when `handleBlur(field)` is called |
| `onChange` | Validate a field on every `setValue(field, value)` call |

## Entry points

| Import | Description |
|---|---|
| `snapstate` | Core `SnapStore`, types, `setHttpClient` |
| `snapstate/react` | React-aware `ReactSnapStore` with `connect()` and `useSyncExternalStore` compatibility |
| `snapstate/form` | Form-aware store with Zod validation, field-level errors, dirty tracking, and submit handling |

## API

### `SnapStore<T, K>`

Base class. `T` is the state shape, `K` is the union of operation keys for async status tracking.

**Public methods:**

| Method | Description |
|---|---|
| `subscribe(callback)` | Subscribe to all state changes. Returns unsubscribe function. |
| `getSnapshot()` | Return a snapshot of current state. Compatible with `useSyncExternalStore`. |
| `getStatus(key)` | Get the async status (`idle` / `loading` / `ready` / `error`) of an operation. |
| `destroy()` | Tear down subscriptions and cleanup. |

**Protected — `this.state.*` (scalar):**

| Method | Description |
|---|---|
| `state.get()` | Read the full state object. |
| `state.get(path)` | Read a value at a dot-separated path (e.g. `"user.name"`). |
| `state.set(path, value)` | Set a value at `path`. Accepts a value or updater `(prev) => next`. |
| `state.batch(fn)` | Group multiple `state.set` calls into a single notification flush. |
| `state.computed(deps, fn)` | Create a lazily-recomputed derived value from dependency paths. |

**Protected — `this.state.*` (array):**

| Method | Description |
|---|---|
| `state.append(path, ...items)` | Append items to end of array. |
| `state.prepend(path, ...items)` | Add items to start of array. |
| `state.insertAt(path, index, ...items)` | Insert items at a specific index. |
| `state.patch(path, predicate, updates)` | Shallow-merge updates into all matching items. |
| `state.remove(path, predicate)` | Remove all items matching predicate. |
| `state.removeAt(path, index)` | Remove item at index. Supports negative indices. |
| `state.at(path, index)` | Get item at index. Supports negative indices. |
| `state.filter(path, predicate)` | Return all matching items. |
| `state.find(path, predicate)` | Return first matching item. |
| `state.findIndexOf(path, predicate)` | Return index of first match, or -1. |
| `state.count(path, predicate)` | Count matching items. |

**Protected — `this.api.*`:**

| Method | Description |
|---|---|
| `api.fetch(key, fn)` | Run an async function with tracked loading/error status. |
| `api.get(key, url, onSuccess?)` | GET request with status tracking. |
| `api.post(key, url, options?)` | POST request with status tracking. |
| `api.put(key, url, options?)` | PUT request with status tracking. |
| `api.patch(key, url, options?)` | PATCH request with status tracking. |
| `api.delete(key, url, options?)` | DELETE request with status tracking. |

### `ReactSnapStore<T, K>`

Extends `SnapStore` with React integration. Available from `snapstate/react`.

| Method | Description |
|---|---|
| `connect(Component, mapToProps)` | Wire a component to the store, injecting derived props. |
| `connect(Component, config)` | Wire with async data fetching, loading, and error states. |
| `connect(Component, { select })` | Wire with granular path-based subscriptions via `pick(path)`. |

### `SnapFormStore<V, K>`

Extends `ReactSnapStore` with form handling. Available from `snapstate/form`. `V` is the form values shape, `K` is the union of operation keys.

Constructor: `new SnapFormStore(schema, initialValues, config?)`

- `schema` — a Zod schema used for validation
- `initialValues` — starting values for the form
- `config.validationMode` — `"onSubmit"` (default), `"onBlur"`, or `"onChange"`

**Public getters:**

| Getter | Type | Description |
|---|---|---|
| `values` | `V` | Current form values |
| `errors` | `FormErrors<V>` | Validation errors keyed by field (`{ [field]: string[] }`) |
| `isDirty` | `boolean` | Whether any value differs from initial values |
| `isValid` | `boolean` | Whether the form has no errors |

**Public methods:**

| Method | Description |
|---|---|
| `setValue(field, value)` | Set a field value. Triggers validation in `onChange` mode. |
| `handleBlur(field)` | Call on field blur. Triggers validation in `onBlur` mode. |
| `isFieldDirty(field)` | Check if a specific field differs from its initial value. |
| `setError(field, message)` | Manually add an error message to a field. |
| `clearErrors()` | Clear all validation errors. |
| `validate()` | Validate the full form. Returns parsed data or `null`. |
| `validateField(field)` | Validate a single field and update errors. |
| `reset()` | Reset values to initial state and clear errors. |
| `clear()` | Clear all values to type-appropriate zero-values and reset errors. |
| `setInitialValues(values)` | Update initial values and sync current values. |
| `submit(key, handler)` | Validate, then call `handler(values)` with tracked async status. Returns `undefined` if validation fails. |

Inherits `connect()`, `subscribe()`, `getSnapshot()`, `getStatus()`, and `destroy()` from `ReactSnapStore`.

**Types:**

| Type | Description |
|---|---|
| `FormState<V>` | Internal state shape: `{ values, initial, errors, submitStatus }` |
| `FormErrors<V>` | `{ [K in keyof V]?: string[] }` — field-level error messages |
| `ValidationMode` | `"onSubmit" \| "onBlur" \| "onChange"` |

### `setHttpClient(client)`

Replace the global HTTP client used by `api.get` and `api.post/put/patch/delete`. The client must implement `request<R>(url, init?) => Promise<R>`.

### `ApiRequestOptions<R>`

Options for HTTP verb methods: `body`, `headers`, `onSuccess(data)`, `onError(error)`.

## Architecture

- **Path-based subscriptions** via a trie structure - listeners only fire when their path (or ancestors/descendants) change
- **Auto-batching** - synchronous sets are coalesced via microtask by default
- **Structural sharing** - `state.set` produces new references only along the updated path
