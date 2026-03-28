# @thalesfp/snapstate

State management for React. Replace useState/useEffect tangles with class-based stores that are easy to test, easy to extend, and predictable by default.

```bash
npm install @thalesfp/snapstate
```

## Features

- **Class-based stores** — business logic in stores, components stay dumb
- **Path-based subscriptions** — listeners fire only when relevant paths change
- **Structural sharing** — unchanged subtrees keep reference identity
- **Auto-batching** — synchronous sets coalesce into a single notification
- **Built-in HTTP** — pluggable client with loading/error status tracking
- **React integration** — `connect()` HOC with `useSyncExternalStore` under the hood
- **Form stores** — Zod validation, `register()` for all HTML input types, dirty tracking, submit lifecycle

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
  props: (s) => ({ todos: s.state.get("todos") }),
  fetch: (s) => s.loadTodos(),
  loading: () => <p>Loading...</p>,
  error: ({ error }) => <p>Error: {error}</p>,
});
```

## Entry Points

| Import | Description |
|---|---|
| `@thalesfp/snapstate` | Core `SnapStore`, types, `setHttpClient` |
| `@thalesfp/snapstate/react` | `ReactSnapStore` with `connect()` HOC |
| `@thalesfp/snapstate/form` | `SnapFormStore` with Zod validation and form lifecycle |

React and Zod are optional peer dependencies — only needed if you use their respective entry points.

## Core API — `SnapStore<T, K>`

Base class. `T` is the state shape, `K` is the union of async operation keys.

### State Methods (protected `this.state.*`)

**Scalar:**

| Method | Description |
|---|---|
| `get()` | Read the full state object |
| `get(path)` | Read a value at a dot-path (e.g. `"user.name"`) |
| `set(path, value)` | Set a value. Accepts a value or updater `(prev) => next` |
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

### HTTP Methods (protected `this.api.*`)

| Method | Description |
|---|---|
| `fetch(key, fn)` | Run async function with tracked status |
| `get(key, url, onSuccess?)` | GET with status tracking |
| `post(key, url, options?)` | POST with status tracking |
| `put(key, url, options?)` | PUT with status tracking |
| `patch(key, url, options?)` | PATCH with status tracking |
| `delete(key, url, options?)` | DELETE with status tracking |

Options: `{ body?, headers?, onSuccess?(data)?, onError?(error)? }`

### Public Methods

| Method | Description |
|---|---|
| `subscribe(callback)` | Subscribe to all changes. Returns unsubscribe function |
| `subscribe(path, callback)` | Subscribe to a specific path |
| `getSnapshot()` | Current state (compatible with `useSyncExternalStore`) |
| `getStatus(key)` | Async status: `{ status: AsyncStatus, error: string \| null }` |
| `destroy()` | Tear down subscriptions |

### Custom HTTP Client

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

## React Integration — `ReactSnapStore<T, K>`

Extends `SnapStore`. Available from `@thalesfp/snapstate/react`.

### connect()

**Simple** — map store to props:

```tsx
const UserName = userStore.connect(
  ({ name }: { name: string }) => <span>{name}</span>,
  (store) => ({ name: store.state.get("user.name") }),
);
```

**Advanced** — with data fetching:

```tsx
const UserProfile = userStore.connect(ProfileView, {
  props: (s) => ({ user: s.state.get("user") }),
  fetch: (s) => s.loadUser(),
  loading: () => <Skeleton />,
  error: ({ error }) => <p>{error}</p>,
});
```

**Granular** — path-based subscriptions:

```tsx
const UserCard = userStore.connect(CardView, {
  select: (pick) => ({
    name: pick("user.name"),
    avatar: pick("user.avatar"),
  }),
});
```

`pick(path)` subscribes to that exact path -- the component only re-renders when those specific values change.

`select` supports all lifecycle options -- `fetch`, `setup`, `cleanup`, `loading`, and `error`:

```tsx
const ProfilePage = accountStore.connect(ProfilePageInner, {
  select: (pick) => ({
    nameError: pick("errors.name"),
    emailError: pick("errors.email"),
  }),
  setup: (s) => s.loadCurrentProfile(),
  cleanup: (s) => s.reset(),
});
```

**Setup and cleanup** -- lifecycle hooks that pair with `fetch`:

```tsx
const Dashboard = dashboardStore.connect(DashboardView, {
  props: (s) => ({ stats: s.state.get("stats") }),
  setup: (s) => s.initPolling(),
  fetch: (s) => s.loadStats(),
  cleanup: (s) => s.stopPolling(),
  loading: () => <Skeleton />,
});
```

`setup` runs synchronously before `fetch` — use it to initialize timers, subscriptions, or AbortControllers. `cleanup` fires once on unmount. Both work with or without `fetch` and are safe in React StrictMode.

## Form Store — `SnapFormStore<V, K>`

Extends `ReactSnapStore`. Available from `@thalesfp/snapstate/form`. Requires `zod` peer dependency.

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

### Using register()

`register()` returns props to spread onto form elements — handles ref tracking, value sync, and event binding:

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

### Validation Modes

| Mode | Behavior |
|---|---|
| `onSubmit` | Validate only when `submit()` is called (default) |
| `onBlur` | Validate field on blur |
| `onChange` | Validate field on every change |

### Supported Form Elements

| Element | How it works |
|---|---|
| `<input type="text">` (and password, email, url, tel, search) | `el.value` read/write |
| `<input type="number">` | Coerced via `Number()` when field type is `number` |
| `<input type="checkbox">` | `el.checked` / `defaultChecked` for boolean fields |
| `<textarea>` | `el.value` read/write |
| `<select>` | `el.value` read/write |
| `<input type="range">` | Number coercion; browser handles clamping |
| `<input type="radio">` | Multiple elements per field; reads checked value |
| `<input type="date">` / `time` / `datetime-local` | Coerced to `Date`; formatted for DOM |
| `<select multiple>` | Reads `selectedOptions` as array; coerces item types |
| `<input type="file">` | Returns `File` or `File[]`; reset clears selection |

### Form Methods

| Method | Description |
|---|---|
| `register(field)` | Returns `{ ref, name, defaultValue, onBlur, onChange }` for form elements |
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

## Cross-Store Derivation

Stores can reactively mirror a value from another store with `derive()`. It subscribes to the source, applies an `Object.is` change guard, and syncs the selected value into a local state key. The subscription is cleaned up on `destroy()`.

```ts
class ProjectsStore extends ReactSnapStore<{ companyId: string; projects: Project[] }, "fetch"> {
  constructor(company: Subscribable<{ currentCompany: { id: string } }>) {
    super({ companyId: "", projects: [] });
    this.derive("companyId", company, (s) => s.currentCompany.id);
  }
}
```

The source accepts any `Subscribable` (every `SnapStore` satisfies this), so stores stay testable in isolation -- pass a real store or a minimal mock.

## Key Concepts

**Path-based subscriptions** — State changes are tracked via dot-separated paths (e.g. `"user.name"`, `"items.0.title"`). A trie structure ensures listeners fire only when their path or its ancestors/descendants change.

**Structural sharing** — Every `set()` produces a new root object but preserves reference identity for unchanged subtrees. This makes React's shallow comparison efficient.

**Auto-batching** — Multiple synchronous `set()` calls queue a single notification via `queueMicrotask()`. Use `batch()` for explicit control.

**Async status tracking** — Every `api.*` call is keyed. `getStatus(key)` returns `{ status, error }` where status has boolean flags: `isIdle`, `isLoading`, `isReady`, `isError`.

## Example App

A full Vite + React 19 demo lives in [`example/`](./example/) with todos, auth, and account profile features.

```bash
npm run build              # Build library first
cd example && npm install  # Install example deps
npm run example:dev        # Start dev server
```

## License

MIT
