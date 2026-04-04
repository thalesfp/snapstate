# Snapstate Example

This example app demonstrates how Snapstate fits together in a small React application with auth, todos, forms, scoped detail views, and URL-backed filters.

## What It Shows

- Shared app-level stores for auth, account data, and todos
- `SnapFormStore` for login and todo input workflows
- `SnapStore.scoped()` for per-page todo detail state
- URL filter state via `createUrlParams()` and `syncToUrl()`
- A local mock API for login, profile updates, and todo CRUD
- Unit tests for stores and components plus Playwright end-to-end coverage

## Run It

From the repository root:

```bash
npm run build
npm run example:install
npm run example:dev
```

The example imports the built library output from `../dist`, so rebuilding the library is the right first step after changing Snapstate itself.

## Test It

From the repository root:

```bash
npm run example:test
npm run example:test:e2e
```

From the `example/` directory directly:

```bash
npm test
npm run test:e2e
```

## Project Structure

- `src/app/App.tsx`: App shell and route composition
- `src/stores.ts`: Shared store instances and URL sync setup
- `src/features/auth/`: Auth store, login form store, and login UI
- `src/features/todos/`: Todo list, filters, input, detail page, and scoped detail store
- `src/features/account/`: Profile form/store flow
- `src/shared/http.ts`: HTTP client/default header setup
- `server/index.ts`: Local Hono mock API used during development and e2e tests
- `e2e/`: Playwright coverage for auth, todos, detail views, and account flows

## Demo Credentials

- Email: `demo@example.com`
- Password: `Demo@2024!`
