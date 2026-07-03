---
title: Getting Started
description: Install and start using Snapstore for reactive state management in React
---

# Getting Started

Snapstore is a state management library for React built around class-based stores. Stores hold state and business logic; components render. You get typed dot-path access (`"user.name"`), granular subscriptions, structural sharing, and built-in async tracking, all testable without React.

## Installation

Snapstore ships as four focused packages — install only the ones you need. `@snapstore/react`, `@snapstore/form`, and `@snapstore/url` each pull in `@snapstore/core` automatically.

**`@snapstore/core`** — framework-free core store. No peer dependencies.

```bash
npm install @snapstore/core
```

**`@snapstore/react`** — React integration: `connect()` and `SnapStore.scoped()`. Requires `react >= 18`.

```bash
npm install @snapstore/react
```

**`@snapstore/form`** — Zod-based form stores. Builds on `@snapstore/react` (pulled in automatically); requires `react >= 18` and `zod >= 4`.

```bash
npm install @snapstore/form
```

**`@snapstore/url`** — reactive URL search params via `createUrlParams` and `syncToUrl`. Depends on `qs`, installed automatically.

```bash
npm install @snapstore/url
```

## Quick Example

Define a store with state and methods:

```typescript
import { SnapStore } from "@snapstore/react";

interface TodoState {
  items: { id: number; title: string; done: boolean }[];
}

class TodoStore extends SnapStore<TodoState> {
  constructor() {
    super({ items: [] });
  }

  addTodo(title: string) {
    this.state.append("items", { id: Date.now(), title, done: false });
  }

  toggle(id: number) {
    this.state.patch("items", (t) => t.id === id, { done: true });
  }
}

export const todoStore = new TodoStore();
```

Connect it to a component. The component receives store values as props and re-renders when they change:

```tsx
function TodoList({ items }: { items: TodoState["items"] }) {
  return (
    <ul>
      {items.map((t) => (
        <li key={t.id} onClick={() => todoStore.toggle(t.id)}>{t.title}</li>
      ))}
    </ul>
  );
}

const ConnectedTodoList = todoStore.connect(TodoList, {
  select: ["items"],
});
```

No `useEffect`, no `useState`. The `connect()` HOC handles subscriptions and re-renders; the store handles the logic.

## What's Next

- [Core Concepts](core-concepts.md): paths, subscriptions, structural sharing, batching
- [Store API](store-api.md): full reference for state and array operations
- [React Integration](react-integration.md): `connect`, `select`, `scoped`, lifecycle
- [Async & HTTP](async-http.md): tracked operations and data fetching
- [Forms](forms.md): Zod-powered form management
- [URL Parameters](url-params.md): reading and writing search params
- [Advanced](advanced.md): `derive`, `createStore`, custom HTTP clients, types
