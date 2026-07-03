---
title: URL Parameters
description: Reactive reading and writing of URL search params
---

# URL Parameters

`@snapstore/url` treats the URL search string as another reactive data source. Read it with `createUrlParams`, write to it with `syncToUrl`.

Direction matters: use `createUrlParams` when the URL drives the app (a shareable `?filter=active` link), and `syncToUrl` when the app should keep the URL up to date. Most filter UIs use both.

## Reading: createUrlParams()

Returns a typed `Subscribable` over `window.location.search`. It reacts to `popstate` and to SPA navigation (it patches `history.pushState`/`replaceState` once, globally, because the browser fires no event for those).

```typescript
import { createUrlParams } from "@snapstore/url";

export const urlParams = createUrlParams<{ filter?: string; page?: string }>();

urlParams.getSnapshot(); // { filter: "active", page: "2" } from ?filter=active&page=2
```

### With connect()

The preferred integration: pass the source as the `urlParams` option and typed params flow into `fetch`, `setup`, and `deps`. Navigation re-runs them when the depended-on values change.

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

Depend on individual values (`[params.filter]`), not the `params` object itself; the object is fresh on each read and would re-trigger every time.

### With derive()

To mirror a param into store state permanently, independent of any component:

```typescript
class AppStore extends SnapStore<{ filter: string }> {
  constructor() {
    super({ filter: "all" });
    this.derive("filter", urlParams, (p) => (typeof p.filter === "string" ? p.filter : "all"));
  }
}
```

## Writing: syncToUrl()

Subscribes to a store and mirrors selected state into the search string on every change:

```typescript
import { syncToUrl } from "@snapstore/url";

const unsub = syncToUrl(todoStore, {
  params: {
    filter: (s) => s.filter,
    page: (s) => s.page,
  },
  history: "replace", // default; "push" adds history entries for back-button navigation
});
```

Empty strings, `null`, and `undefined` are omitted from the URL. Use `history: "replace"` for filter-style state (no history spam) and `"push"` when each state should be a back-button stop.

## Parsing Features

Parsing is powered by `qs` and supports nested objects, arrays, and dot notation:

```
?user[name]=John            -> { user: { name: "John" } }
?colors[]=red&colors[]=blue -> { colors: ["red", "blue"] }
?user.name=John             -> { user: { name: "John" } }
```

All parsed values are strings (or nested objects/arrays of strings). Coerce numbers and booleans yourself where you consume them.

## Options

```typescript
createUrlParams({
  initialParams: { filter: "all" },  // SSR and tests: skip window access
  listen: true,                      // react to navigation (default: true in browser)
  depth: 5,                          // max nesting depth (default: 5)
  parameterLimit: 1000,              // max params parsed (default: 1000)
  arrayFormat: "brackets",           // "brackets" | "indices" | "comma" | "repeat"
});
```

## Cleanup

```typescript
urlParams.destroy();  // remove navigation listeners
unsub();              // stop syncing to URL (return value of syncToUrl)
```

For app-wide params created at module scope, cleanup is usually unnecessary; they live as long as the app.
