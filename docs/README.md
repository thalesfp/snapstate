---
title: Getting Started
description: Install and start using Snapstate for reactive state management in React
---

# Getting Started

Snapstate is a reactive state management library for React. It provides testable, extensible, class-based stores with dot-path subscriptions, structural sharing, and built-in async support.

## Installation

```bash
npm install @thalesfp/snapstate
```

Snapstate has optional peer dependencies:

- `react >= 18` -- required only if you use `snapstate/react`
- `zod >= 3` -- required only if you use `snapstate/form`

## Quick Example

```typescript
import { SnapStore } from "@thalesfp/snapstate/react";

interface TodoState {
  items: { id: number; title: string; done: boolean }[];
}

class TodoStore extends SnapStore<TodoState> {
  constructor() {
    super({ items: [] });
  }

  get items() {
    return this.state.get("items");
  }

  addTodo(title: string) {
    this.state.append("items", { id: Date.now(), title, done: false });
  }

  toggle(id: number) {
    this.state.patch("items", (t) => t.id === id, { done: true });
  }
}

const store = new TodoStore();
```

Connect it to a React component:

```tsx
function TodoList({ items }: { items: TodoState["items"] }) {
  return (
    <ul>
      {items.map((t) => (
        <li key={t.id}>{t.title}</li>
      ))}
    </ul>
  );
}

const ConnectedTodoList = store.connect(TodoList, (s) => ({
  items: s.items,
}));
```

No `useEffect`, no `useState` -- the `connect` HOC handles subscriptions and re-renders automatically.

## Export Paths

Snapstate ships three entry points:

| Path | Use case |
| --- | --- |
| `snapstate` | Core store, no React dependency |
| `snapstate/react` | React integration with `connect` HOC |
| `snapstate/form` | Zod-based form stores |

## What's Next

- [Core Concepts](core-concepts.md) -- understand paths, subscriptions, and structural sharing
- [Store API](store-api.md) -- full reference for state and array operations
- [React Integration](react-integration.md) -- connect stores to React components
- [Async & HTTP](async-http.md) -- built-in data fetching
- [Forms](forms.md) -- Zod-powered form management
