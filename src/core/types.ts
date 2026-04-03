/** Possible values for an async operation's lifecycle status. */
export type AsyncStatusValue = "idle" | "loading" | "ready" | "error";

/** Readonly status object for an async operation. Use the `is*` booleans for conditional logic. */
export interface AsyncStatus {
  readonly value: AsyncStatusValue;
  readonly isIdle: boolean;
  readonly isLoading: boolean;
  readonly isReady: boolean;
  readonly isError: boolean;
}

const _statuses: Record<AsyncStatusValue, AsyncStatus> = {
  idle: Object.freeze({ value: "idle", isIdle: true, isLoading: false, isReady: false, isError: false }),
  loading: Object.freeze({ value: "loading", isIdle: false, isLoading: true, isReady: false, isError: false }),
  ready: Object.freeze({ value: "ready", isIdle: false, isLoading: false, isReady: true, isError: false }),
  error: Object.freeze({ value: "error", isIdle: false, isLoading: false, isReady: false, isError: true }),
};

export function asyncStatus(value: AsyncStatusValue): AsyncStatus {
  return _statuses[value];
}

/** Async operation status and error. Tracks the lifecycle of an `api.fetch`/`api.get`/`api.post` call. */
export interface OperationState {
  status: AsyncStatus;
  error: string | null;
}

export type Path = string & { readonly __brand?: "Path" };

export type Listener = () => void;

export type Unsubscribe = () => void;

// Union of all valid dot-separated paths into T (for autocomplete)
export type DotPaths<T, Prefix extends string = ""> = T extends object
  ? { [K in keyof T & string]:
      | `${Prefix}${K}`
      | DotPaths<T[K], `${Prefix}${K}.`>
    }[keyof T & string]
  : never;

// Extract a deeply nested type by dot-separated path
export type GetByPath<T, P extends string> = P extends ""
  ? T
  : P extends `${infer K}.${infer Rest}`
    ? K extends keyof T
      ? GetByPath<T[K], Rest>
      : never
    : P extends keyof T
      ? T[P]
      : never;

export type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

export type ArrayPaths<T> = {
  [K in keyof T & string]: T[K] extends any[] ? K : never;
}[keyof T & string];

export type ObjectArrayPaths<T> = {
  [K in keyof T & string]: T[K] extends (infer V)[]
    ? V extends Date | RegExp | Map<any, any> | Set<any> | Function | any[]
      ? never
      : V extends Record<string, any> ? K : never
    : never;
}[keyof T & string];

export type ElementOf<A> = A extends (infer V)[] ? V : never;

export type Updater<V> = V | ((prev: V) => V);

export interface StoreOptions {
  /** Auto-batch synchronous sets via microtask (default: true) */
  autoBatch?: boolean;
  /** Override the global HTTP client for this store. Useful for testing or per-store configuration. */
  httpClient?: HttpClient;
}

/** Handle to a computed (derived) value. Call `get()` to read, `destroy()` to stop tracking. */
export interface ComputedRef<V> {
  get(): V;
  destroy(): void;
}

/** Options for an HTTP request (method, body, headers). */
export interface HttpRequestInit {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/** Interface for the HTTP layer used by `api.get` and `api.post/put/patch/delete`. */
export interface HttpClient {
  request<R = unknown>(url: string, init?: HttpRequestInit): Promise<R>;
}

/** Options for HTTP verb methods (`api.post`, `api.put`, etc.). */
export interface ApiRequestOptions<R = unknown> {
  body?: unknown;
  headers?: Record<string, string>;
  onSuccess?: (data: R) => void;
  onError?: (error: Error) => void;
}

/** Minimal subscribe + snapshot interface used by React's `useSyncExternalStore`. */
export interface Subscribable<T extends object> {
  subscribe(callback: Listener): Unsubscribe;
  getSnapshot(): T;
}

/** Methods for reading and writing store state. Accessed via `this.state` inside a `SnapStore` subclass. */
export interface StateAccessor<T extends object> {
  /** Return the full state object. */
  get(): T;
  /**
   * Read a nested value by dot-path.
   * @example this.state.get("user.name") // string
   */
  get<P extends DotPaths<T>>(path: P): GetByPath<T, P>;
  /**
   * Set a nested value by dot-path. Accepts a direct value or an updater function.
   * @example
   * this.state.set("count", 5)
   * this.state.set("count", prev => prev + 1)
   */
  set<P extends DotPaths<T>>(path: P, value: Updater<GetByPath<T, P>>): void;
  /**
   * Group multiple `set()` calls into a single notification.
   * @example
   * this.state.batch(() => {
   *   this.state.set("firstName", "John")
   *   this.state.set("lastName", "Doe")
   * })
   */
  batch(fn: () => void): void;
  /**
   * Set multiple top-level keys in a single batched notification.
   * @example this.state.merge({ firstName: "John", lastName: "Doe" })
   */
  merge(updates: Partial<T>): void;
  /**
   * Create a lazy derived value that recomputes only when its dependency paths change.
   * @example
   * const fullName = this.state.computed(["firstName", "lastName"],
   *   s => `${s.firstName} ${s.lastName}`)
   * fullName.get() // "John Doe"
   */
  computed<V>(deps: (keyof T & string)[], fn: (state: T) => V): ComputedRef<V>;
  /**
   * Append one or more items to the end of an array field.
   * @example this.state.append("items", newItem)
   */
  append<P extends ArrayPaths<T>>(path: P, ...items: ElementOf<T[P]>[]): void;
  /**
   * Prepend one or more items to the beginning of an array field.
   * @example this.state.prepend("items", newItem)
   */
  prepend<P extends ArrayPaths<T>>(path: P, ...items: ElementOf<T[P]>[]): void;
  /**
   * Insert one or more items at a specific index in an array field.
   * @example this.state.insertAt("items", 2, newItem)
   */
  insertAt<P extends ArrayPaths<T>>(path: P, index: number, ...items: ElementOf<T[P]>[]): void;
  /**
   * Partially update items in an array of objects that match a predicate.
   * @example this.state.patch("todos", t => t.id === 1, { done: true })
   */
  patch<P extends ObjectArrayPaths<T>>(path: P, predicate: (item: ElementOf<T[P]>) => boolean, updates: Partial<ElementOf<T[P]>>): void;
  /**
   * Remove all items from an array field that match a predicate.
   * @example this.state.remove("todos", t => t.done)
   */
  remove<P extends ArrayPaths<T>>(path: P, predicate: (item: ElementOf<T[P]>) => boolean): void;
  /**
   * Remove an item from an array field by index.
   * @example this.state.removeAt("items", 0)
   */
  removeAt<P extends ArrayPaths<T>>(path: P, index: number): void;
  /**
   * Read an item from an array field by index. Returns `undefined` if out of bounds.
   * @example this.state.at("items", 0)
   */
  at<P extends ArrayPaths<T>>(path: P, index: number): ElementOf<T[P]> | undefined;
  /**
   * Return all items from an array field that match a type predicate, narrowing the return type.
   * @example this.state.filter("orgs", (o): o is StandaloneOrg => o.source === "standalone")
   */
  filter<P extends ArrayPaths<T>, S extends ElementOf<T[P]>>(path: P, predicate: (item: ElementOf<T[P]>) => item is S): S[];
  /**
   * Return all items from an array field that match a predicate.
   * @example this.state.filter("todos", t => !t.done)
   */
  filter<P extends ArrayPaths<T>>(path: P, predicate: (item: ElementOf<T[P]>) => boolean): ElementOf<T[P]>[];
  /**
   * Return the first item from an array field that matches a type predicate, narrowing the return type.
   * @example this.state.find("orgs", (o): o is StandaloneOrg => o.source === "standalone")
   */
  find<P extends ArrayPaths<T>, S extends ElementOf<T[P]>>(path: P, predicate: (item: ElementOf<T[P]>) => item is S): S | undefined;
  /**
   * Return the first item from an array field that matches a predicate.
   * @example this.state.find("todos", t => t.id === 1)
   */
  find<P extends ArrayPaths<T>>(path: P, predicate: (item: ElementOf<T[P]>) => boolean): ElementOf<T[P]> | undefined;
  /**
   * Return the index of the first item in an array field that matches a predicate. Returns `-1` if not found.
   * @example this.state.findIndexOf("todos", t => t.id === 1)
   */
  findIndexOf<P extends ArrayPaths<T>>(path: P, predicate: (item: ElementOf<T[P]>) => boolean): number;
  /**
   * Count items in an array field that match a predicate.
   * @example this.state.count("todos", t => t.done)
   */
  count<P extends ArrayPaths<T>>(path: P, predicate: (item: ElementOf<T[P]>) => boolean): number;
  /**
   * Reset one or more paths back to their initial values. With no args, resets all top-level keys.
   * @example this.state.reset("user.name", "count")
   */
  reset(...paths: DotPaths<T>[]): void;
}

/** Base params shared by all HTTP verb methods. */
export interface ApiBaseParams<K extends string> {
  key?: K;
  url: string;
  body?: unknown;
  headers?: Record<string, string>;
  onError?: (error: Error) => void;
}

/** Verb params that store the response at a state path. */
export type ApiTargetParams<K extends string, P extends string> = ApiBaseParams<K> & { target: P };

/** Verb params with an optional success callback. */
export type ApiCallbackParams<K extends string, R = unknown> = ApiBaseParams<K> & { onSuccess?: (data: R) => void };

/** Methods for async operations with automatic status tracking. Accessed via `this.api` inside a `SnapStore` subclass. */
export interface ApiAccessor<K extends string, T extends object = object> {
  /**
   * Wrap an async operation with automatic status tracking. When `key` is omitted, no status is tracked.
   * @example await this.api.fetch({ key: "todos", fn: async () => { ... } })
   * @example await this.api.fetch({ fn: async () => { ... } })
   */
  fetch(params: { key?: K; fn: () => Promise<void> }): Promise<void>;
  /**
   * Perform a GET request and store the result at a state path.
   * @example await this.api.get({ url: "/api/todos", target: "todos" })
   */
  get<P extends DotPaths<T>>(params: { key?: K; url: string; target: P }): Promise<void>;
  /**
   * Perform a GET request with a callback.
   * @example await this.api.get({ key: "fetch", url: "/api/todos", onSuccess: (data) => ... })
   */
  get<R = unknown>(params: { key?: K; url: string; onSuccess?: (data: R) => void }): Promise<void>;
  /** @example await this.api.post({ url: "/api/todos", body: { title: "New" }, target: "currentTodo" }) */
  post<P extends DotPaths<T>>(params: ApiTargetParams<K, P>): Promise<void>;
  /** @example await this.api.post({ key: "create", url: "/api/todos", body: { title: "New" } }) */
  post<R = unknown>(params: ApiCallbackParams<K, R>): Promise<void>;
  /** @example await this.api.put({ url: "/api/todos/1", body: updated, target: "currentTodo" }) */
  put<P extends DotPaths<T>>(params: ApiTargetParams<K, P>): Promise<void>;
  /** @example await this.api.put({ key: "update", url: "/api/todos/1", body: updated }) */
  put<R = unknown>(params: ApiCallbackParams<K, R>): Promise<void>;
  /** @example await this.api.patch({ url: "/api/todos/1", body: { done: true }, target: "currentTodo" }) */
  patch<P extends DotPaths<T>>(params: ApiTargetParams<K, P>): Promise<void>;
  /** @example await this.api.patch({ key: "toggle", url: "/api/todos/1", body: { done: true } }) */
  patch<R = unknown>(params: ApiCallbackParams<K, R>): Promise<void>;
  /** @example await this.api.delete({ url: "/api/todos/1", target: "lastDeleted" }) */
  delete<P extends DotPaths<T>>(params: ApiTargetParams<K, P>): Promise<void>;
  /** @example await this.api.delete({ key: "remove", url: "/api/todos/1" }) */
  delete<R = unknown>(params: ApiCallbackParams<K, R>): Promise<void>;
}

/** Standalone reactive store returned by `createStore()`. */
export interface RawStore<T extends object> extends Subscribable<T> {
  /** Return the full state object. */
  get(): T;
  /** Read a nested value by dot-path. */
  get<P extends DotPaths<T>>(path: P): GetByPath<T, P>;

  /** Set a nested value by dot-path. Accepts a direct value or an updater function. */
  set<P extends DotPaths<T>>(path: P, value: Updater<GetByPath<T, P>>): void;

  /** Group multiple `set()` calls into a single notification. */
  batch(fn: () => void): void;

  /** Subscribe to all state changes. */
  subscribe(callback: Listener): Unsubscribe;
  /** Subscribe to changes at a specific dot-path. */
  subscribe(path: string, callback: Listener): Unsubscribe;

  /** Return the current state (same as `get()`, required by `useSyncExternalStore`). */
  getSnapshot(): T;

  /** Create a lazy derived value that recomputes only when its dependency paths change. */
  computed<V>(deps: (keyof T & string)[], fn: (state: T) => V): ComputedRef<V>;

  /** Force-notify all subscribers (useful after external mutations). */
  notify(): void;

  /** Remove all subscriptions and pending notifications. */
  destroy(): void;

  /** Reset one or more paths to their initial values. With no args, resets all top-level keys. */
  reset(...paths: string[]): void;
}
