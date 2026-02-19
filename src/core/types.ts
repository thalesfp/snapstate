export type AsyncStatus = "idle" | "loading" | "ready" | "error";

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

export interface Subscribable<T extends object> {
  subscribe(callback: Listener): Unsubscribe;
  getSnapshot(): T;
}

export interface StateAccessor<T extends object> {
  get(): T;
  get<P extends DotPaths<T>>(path: P): GetByPath<T, P>;
  set<P extends DotPaths<T>>(path: P, value: Updater<GetByPath<T, P>>): void;
  batch(fn: () => void): void;
  computed<V>(deps: (keyof T & string)[], fn: (state: T) => V): ComputedRef<V>;
  append<P extends ArrayPaths<T>>(path: P, ...items: ElementOf<T[P]>[]): void;
  prepend<P extends ArrayPaths<T>>(path: P, ...items: ElementOf<T[P]>[]): void;
  insertAt<P extends ArrayPaths<T>>(path: P, index: number, ...items: ElementOf<T[P]>[]): void;
  patch<P extends ObjectArrayPaths<T>>(path: P, predicate: (item: ElementOf<T[P]>) => boolean, updates: Partial<ElementOf<T[P]>>): void;
  remove<P extends ArrayPaths<T>>(path: P, predicate: (item: ElementOf<T[P]>) => boolean): void;
  removeAt<P extends ArrayPaths<T>>(path: P, index: number): void;
  at<P extends ArrayPaths<T>>(path: P, index: number): ElementOf<T[P]> | undefined;
  filter<P extends ArrayPaths<T>>(path: P, predicate: (item: ElementOf<T[P]>) => boolean): ElementOf<T[P]>[];
  find<P extends ArrayPaths<T>>(path: P, predicate: (item: ElementOf<T[P]>) => boolean): ElementOf<T[P]> | undefined;
  findIndexOf<P extends ArrayPaths<T>>(path: P, predicate: (item: ElementOf<T[P]>) => boolean): number;
  count<P extends ArrayPaths<T>>(path: P, predicate: (item: ElementOf<T[P]>) => boolean): number;
}

export interface ApiAccessor<K extends string> {
  fetch(key: K, fn: () => Promise<void>): Promise<void>;
  get<R = unknown>(key: K, url: string, onSuccess?: (data: R) => void): Promise<void>;
  post<R = unknown>(key: K, url: string, options?: ApiRequestOptions<R>): Promise<void>;
  put<R = unknown>(key: K, url: string, options?: ApiRequestOptions<R>): Promise<void>;
  patch<R = unknown>(key: K, url: string, options?: ApiRequestOptions<R>): Promise<void>;
  delete<R = unknown>(key: K, url: string, options?: ApiRequestOptions<R>): Promise<void>;
}

export interface RawStore<T extends object> extends Subscribable<T> {
  get(): T;
  get<P extends DotPaths<T>>(path: P): GetByPath<T, P>;

  set<P extends DotPaths<T>>(path: P, value: Updater<GetByPath<T, P>>): void;

  batch(fn: () => void): void;

  subscribe(callback: Listener): Unsubscribe;
  subscribe(path: string, callback: Listener): Unsubscribe;

  getSnapshot(): T;

  computed<V>(deps: (keyof T & string)[], fn: (state: T) => V): ComputedRef<V>;

  notify(): void;

  destroy(): void;
}
