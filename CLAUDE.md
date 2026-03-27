# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build        # Build with tsup (CJS + ESM + DTS)
npm test             # Run all tests (vitest run)
npm run test:watch   # Watch mode
npm run bench        # Run benchmarks (vitest bench)
npx tsc --noEmit     # Type-check without emit
npx vitest run tests/store.test.ts  # Run a single test file
```

## Architecture

Snapstate is a reactive state library. State changes are tracked via **dot-separated string paths** (e.g. `"user.name"`, `"items.0.title"`).

### Core (`src/core/`)

- **`base.ts`** — `SnapStore<T, K>` class with protected `state.*` methods (local state) and `api.*` methods (HTTP). Pluggable `HttpClient` via `setHttpClient()`.
- **`store.ts`** — `createStore()` factory returning a `RawStore<T>`. Orchestrates trie, structural updates, and computed refs.
- **`trie.ts`** — `SubscriptionTrie` tree structure for path-based subscriptions. Supports exact-path, ancestor, descendant, wildcard (`*`), and global listeners.
- **`structural.ts`** — Immutable updates with structural sharing. `applyUpdate()` clones only along the changed path; unchanged subtrees keep reference identity.
- **`computed.ts`** — Lazy derived values (`ComputedRef<V>`). Recompute only when subscribed dependency paths change.
- **`types.ts`** — Shared types. `GetByPath<T, P>` extracts nested types from dot-path string literals.

### React (`src/react/`)

- **`store.ts`** — `ReactSnapStore` extends `SnapStore` with a `connect()` HOC using `useSyncExternalStore`. Supports simple prop mapping and advanced mode with async fetch/loading/error handling.

### Key patterns

- **Microtask auto-batching** (default): multiple synchronous `set()` calls queue a single notification via `queueMicrotask()`. Manual batching available via `batch()`.
- **Structural sharing**: every `set()` produces a new root object but preserves identity for unchanged subtrees.
- **Two export paths**: `snapstate` (core) and `snapstate/react` (React integration with optional `react` peer dep).

## Store method groups

**Scalar state:** `state.get`, `state.set`, `state.batch`, `state.computed`

**Array state:** `state.append`, `state.prepend`, `state.insertAt`, `state.patch`, `state.remove`, `state.removeAt`, `state.at`, `state.filter`, `state.find`, `state.findIndexOf`, `state.count`

**Async/HTTP:** `api.fetch`, `api.get`, `api.post`, `api.put`, `api.patch`, `api.delete`

**Public:** `subscribe`, `getSnapshot`, `getStatus`, `destroy`

## Design goals

- **No `useEffect`/`useState` for consumers**: snapstate's React integration (`connect`) should handle data fetching and state sync so end users never need `useEffect` or `useState` for store-related logic. `useState` is acceptable only for purely UI-local behavior (e.g. toggle a dropdown).

## Example App

A full-featured Vite + React 19 demo app lives in `example/` (todos, auth, account profile).

```bash
npm run build                  # Build library first (example resolves ../dist/)
cd example && npm install      # Install example dependencies (first time)
npm run example:dev            # Start dev server + mock API
npm run example:test           # Run example unit tests
npm run example:test:e2e       # Run Playwright e2e tests
```

The example resolves `snapstate`, `snapstate/react`, and `snapstate/form` via Vite aliases and tsconfig paths pointing to `../dist/`. Always rebuild the library (`npm run build`) after changing library source.

## Testing

Vitest with jsdom environment. Tests use `vi.fn()` for spies, `@testing-library/react` + `act()` for React tests. Globals enabled (no need to import `describe`/`it`/`expect`).
