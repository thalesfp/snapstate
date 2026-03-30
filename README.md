# Snapstate

State management for React. Class-based stores that are easy to test, easy to extend, and predictable by default.

```bash
npm install @thalesfp/snapstate
```

## Quick Start

```ts
import { ReactSnapStore } from "@thalesfp/snapstate/react";

interface State {
  todos: { id: string; text: string; done: boolean }[];
}

class TodoStore extends ReactSnapStore<State, "load"> {
  constructor() {
    super({ todos: [] });
  }

  get todos() {
    return this.state.get("todos");
  }

  loadTodos() {
    return this.api.get("load", "/api/todos", (data) => this.state.set("todos", data));
  }

  addTodo(text: string) {
    this.state.append("todos", { id: crypto.randomUUID(), text, done: false });
  }

  toggle(id: string) {
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
        <li key={t.id} onClick={() => todoStore.toggle(t.id)}>
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

Stores hold state, expose methods, and notify subscribers. State changes use dot-paths (`"user.name"`, `"items.0.title"`) tracked by a trie, so listeners only fire when their path changes. Synchronous `set()` calls are auto-batched via `queueMicrotask`, and every `set()` preserves reference identity for unchanged subtrees.

`SnapStore<T, K>` is the base class. `T` is the state shape, `K` is the union of async operation keys.

### State (`this.state.*`)

**Scalar:**

| Method | Description |
|---|---|
| `get()` | Full state object |
| `get(path)` | Value at a dot-path |
| `set(path, value)` | Set a value or pass an updater `(prev) => next` |
| `batch(fn)` | Group multiple sets into a single notification |
| `computed(deps, fn)` | Lazily-recomputed derived value from dependency paths |

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
| `filter(path, predicate)` | Return matching items |
| `find(path, predicate)` | Return first match |
| `findIndexOf(path, predicate)` | Index of first match, or -1 |
| `count(path, predicate)` | Count matching items |

### Async operations (`this.api.*`)

Every operation is keyed. Concurrent calls to the same key use take-latest semantics -- stale responses are silently discarded.

| Method | Description |
|---|---|
| `fetch(key, fn)` | Run async function with tracked status |
| `get(key, url, onSuccess?)` | GET request |
| `post(key, url, options?)` | POST request |
| `put(key, url, options?)` | PUT request |
| `patch(key, url, options?)` | PATCH request |
| `delete(key, url, options?)` | DELETE request |

Options: `{ body?, headers?, onSuccess?(data)?, onError?(error)? }`

**Status tracking:** `getStatus(key)` returns `{ status, error }` where `status` has boolean flags: `isIdle`, `isLoading`, `isReady`, `isError`. Call `resetStatus(key)` to return an operation to `idle`, distinguishing "never loaded" from "loaded empty".

### Cross-store derivation (`this.derive`)

Keep a local state key in sync with a value selected from another store. Subscribes to the source, applies an `Object.is` change guard, and cleans up on `destroy()`.

```ts
class ProjectsStore extends ReactSnapStore<{ companyId: string; projects: Project[] }, "fetch"> {
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

## Connect

`ReactSnapStore` extends `SnapStore` with a `connect()` HOC. Available from `@thalesfp/snapstate/react`.

### Map store to props

```tsx
const UserName = userStore.connect(
  ({ name }: { name: string }) => <span>{name}</span>,
  (store) => ({ name: store.getSnapshot().user.name }),
);
```

### Data fetching

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

`deps` returns a dependency array from the component's own props. When values change, `cleanup` runs for the previous deps, then `fetch` and `setup` re-run. Without `deps`, lifecycle callbacks run once on mount.

### Scoped stores

`ReactSnapStore.scoped()` creates a store when the component mounts and destroys it on unmount. Each instance gets its own isolated store — useful for detail views, forms, or modals that need fresh state on every mount.

```tsx
import { ReactSnapStore } from "@thalesfp/snapstate/react";

class TodoDetailStore extends ReactSnapStore<{ todo: Todo | null }, "fetch"> {
  constructor() {
    super({ todo: null });
  }

  fetchTodo(id: string) {
    return this.api.get("fetch", `/api/todos/${id}`, (todo) => this.state.set("todo", todo));
  }
}

const TodoDetail = ReactSnapStore.scoped(TodoDetailView, {
  factory: () => new TodoDetailStore(),
  props: (store) => ({ todo: store.getSnapshot().todo }),
  fetch: (store, props) => store.fetchTodo(props.id),
  deps: (props) => [props.id],
  loading: () => <Skeleton />,
});
```

No manual `cleanup` or `reset()` needed — `destroy()` runs automatically on unmount. All lifecycle options (`setup`, `cleanup`, `fetch`, `deps`, `loading`, `error`) work the same as in `connect`.

## Forms

`SnapFormStore<V, K>` extends `ReactSnapStore`. Available from `@thalesfp/snapstate/form`. Requires `zod` peer dependency.

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
      await this.api.post("login", "/api/login", { body: values });
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
| `register(field)` | `{ ref, name, defaultValue, onBlur, onChange }` for form elements |
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

## Configuration

### Entry points

| Import | Description |
|---|---|
| `@thalesfp/snapstate` | Core `SnapStore`, types, `setHttpClient` |
| `@thalesfp/snapstate/react` | `ReactSnapStore` with `connect()` HOC |
| `@thalesfp/snapstate/form` | `SnapFormStore` with Zod validation and form lifecycle |

React and Zod are optional peer dependencies -- only needed if you use their respective entry points.

### Custom HTTP client

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

## Example App

A full Vite + React 19 demo lives in [`example/`](./example/) with todos, auth, and account profile features.

```bash
npm run build              # Build library first
cd example && npm install  # Install example deps
npm run example:dev        # Start dev server
```

## License

MIT
