import type {
  RawStore,
  StoreOptions,
  Listener,
  Unsubscribe,
  OperationState,
  HttpClient,
  StateAccessor,
  ApiAccessor,
  ApiRequestOptions,
  Subscribable,
  DotPaths,
  GetByPath,
} from "./types.js";
import { asyncStatus } from "./types.js";
import { createStore } from "./store.js";

const IDLE_STATE: OperationState = { status: asyncStatus("idle"), error: null };

const defaultHttpClient: HttpClient = {
  async request(url, init) {
    const fetchInit: RequestInit = { method: init?.method ?? "GET" };
    const merged = { ...defaultHeaders, ...init?.headers };
    if (Object.keys(merged).length) { fetchInit.headers = merged; }
    if (init?.body !== undefined) {
      fetchInit.body = JSON.stringify(init.body);
      fetchInit.headers = { "Content-Type": "application/json", ...merged };
    }
    const res = await fetch(url, fetchInit);
    if (!res.ok) {
      let message = `HTTP ${res.status}`;
      try {
        const text = await res.text();
        if (text) {
          const json = JSON.parse(text);
          message = json.error ?? json.message ?? message;
        }
      } catch {}
      throw new Error(message);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : undefined;
  },
};

let httpClient: HttpClient = defaultHttpClient;
let defaultHeaders: Record<string, string> = {};

/** Replace the global HTTP client used by `api.get` and `api.post/put/patch/delete`. */
export function setHttpClient(client: HttpClient): void {
  httpClient = client;
}

/** Set default headers merged into every HTTP request. Per-request headers override defaults. */
export function setDefaultHeaders(headers: Record<string, string>): void {
  defaultHeaders = headers;
}

export class SnapStore<T extends object, K extends string = string> {
  private _store: RawStore<T>;
  private _operations = new Map<K, OperationState>();
  private _generations = new Map<K, number>();
  private _derivedUnsubs: Unsubscribe[] = [];

  protected readonly state: StateAccessor<T>;
  protected readonly api: ApiAccessor<K>;

  constructor(initialState: T, options?: StoreOptions) {
    this._store = createStore(initialState, options);

    const store = this._store;
    const operations = this._operations;
    const generations = this._generations;

    // takeLatest semantic: if a newer call starts for the same key, the older
    // call's promise resolves silently (no reject, no state update).
    const doFetch = async (key: K, fn: () => Promise<void>): Promise<void> => {
      const gen = (generations.get(key) ?? 0) + 1;
      generations.set(key, gen);
      operations.set(key, { status: asyncStatus("loading"), error: null });
      store.notify();
      try {
        await fn();
        if (generations.get(key) !== gen) { return; }
        operations.set(key, { status: asyncStatus("ready"), error: null });
      } catch (e) {
        if (generations.get(key) !== gen) { return; }
        operations.set(key, {
          status: asyncStatus("error"),
          error: e instanceof Error ? e.message : "Unknown error",
        });
        store.notify();
        throw e;
      }
      store.notify();
    };

    const doSend = async <R>(key: K, method: string, url: string, options?: ApiRequestOptions<R>): Promise<void> => {
      await doFetch(key, async () => {
        try {
          const data = await httpClient.request<R>(url, {
            method,
            body: options?.body,
            headers: options?.headers,
          });
          options?.onSuccess?.(data);
        } catch (e) {
          options?.onError?.(e instanceof Error ? e : new Error("Unknown error"));
          throw e;
        }
      });
    };

    this.state = {
      get: ((path?: string): unknown => {
        if (path === undefined) { return store.get(); }
        return (store.get as (p: string) => unknown)(path);
      }) as StateAccessor<T>["get"],

      set: (path, value) => store.set(path, value),
      batch: (fn) => store.batch(fn),
      computed: (deps, fn) => store.computed(deps, fn),

      append: (path, ...items) => {
        store.set(path as any, ((prev: any) => [...(prev as any[]), ...items]) as any);
      },
      prepend: (path, ...items) => {
        store.set(path as any, ((prev: any) => [...items, ...(prev as any[])]) as any);
      },
      insertAt: (path, index, ...items) => {
        store.set(path as any, ((prev: any) => {
          const arr = prev as any[];
          return [...arr.slice(0, index), ...items, ...arr.slice(index)];
        }) as any);
      },
      patch: (path, predicate, updates) => {
        store.set(path as any, ((prev: any) => {
          const arr = prev as any[];
          let changed = false;
          const result = arr.map((item: any) => {
            if (item == null) { return item; }
            if (predicate(item)) {
              changed = true;
              return Object.assign(Object.create(Object.getPrototypeOf(item)), item, updates);
            }
            return item;
          });
          return changed ? result : arr;
        }) as any);
      },
      remove: (path, predicate) => {
        store.set(path as any, ((prev: any) => {
          const arr = prev as any[];
          const result = arr.filter((item: any) => !predicate(item));
          return result.length === arr.length ? arr : result;
        }) as any);
      },
      removeAt: (path, index) => {
        store.set(path as any, ((prev: any) => {
          const arr = prev as any[];
          const i = index < 0 ? arr.length + index : index;
          if (i < 0 || i >= arr.length) {
            throw new RangeError(`Index ${index} out of bounds for array of length ${arr.length}`);
          }
          return [...arr.slice(0, i), ...arr.slice(i + 1)];
        }) as any);
      },
      at: (path, index) => {
        return (store.get(path as any) as any[]).at(index);
      },
      filter: (path, predicate) => {
        return (store.get(path as any) as any[]).filter(predicate);
      },
      find: (path, predicate) => {
        return (store.get(path as any) as any[]).find(predicate);
      },
      findIndexOf: (path, predicate) => {
        return (store.get(path as any) as any[]).findIndex(predicate);
      },
      count: (path, predicate) => {
        return (store.get(path as any) as any[]).filter(predicate).length;
      },
    };

    this.api = {
      fetch: doFetch,
      get: async <R>(key: K, url: string, onSuccess?: (data: R) => void): Promise<void> => {
        await doFetch(key, async () => {
          const data = await httpClient.request<R>(url);
          onSuccess?.(data);
        });
      },
      post: (key, url, options?) => doSend(key, "POST", url, options),
      put: (key, url, options?) => doSend(key, "PUT", url, options),
      patch: (key, url, options?) => doSend(key, "PATCH", url, options),
      delete: (key, url, options?) => doSend(key, "DELETE", url, options),
    };
  }

  /** Subscribe to all state changes. Returns an unsubscribe function. */
  subscribe(callback: Listener): Unsubscribe;
  /** Subscribe to changes at a specific dot-separated path. */
  subscribe(path: string, callback: Listener): Unsubscribe;
  subscribe(pathOrCallback: string | Listener, callback?: Listener): Unsubscribe {
    if (typeof pathOrCallback === "function") {
      return this._store.subscribe(pathOrCallback);
    }
    return this._store.subscribe(pathOrCallback, callback!);
  }

  /** Return a snapshot of the current state. Compatible with React's `useSyncExternalStore`. */
  getSnapshot = (): T => {
    return this._store.getSnapshot();
  };

  /** Get the async status of an operation by key. Returns `idle` if never started. */
  getStatus(key: K): OperationState {
    return { ...(this._operations.get(key) ?? IDLE_STATE) };
  }

  /** Keep a local state key in sync with a value selected from an external store. Cleaned up on `destroy()`. */
  protected derive<S extends object, P extends DotPaths<T> & string>(
    localKey: P,
    source: Subscribable<S>,
    selector: (state: S) => GetByPath<T, P>,
  ): void {
    let previousValue: GetByPath<T, P> = selector(source.getSnapshot());

    if (!Object.is(previousValue, this.state.get(localKey))) {
      this.state.set(localKey, previousValue);
    }

    const unsub = source.subscribe(() => {
      const nextValue = selector(source.getSnapshot());
      if (Object.is(nextValue, previousValue)) {
        return;
      }
      previousValue = nextValue;
      this.state.set(localKey, nextValue);
    });

    this._derivedUnsubs.push(unsub);
  }

  /** Tear down subscriptions and cleanup. */
  destroy(): void {
    for (const unsub of this._derivedUnsubs) {
      unsub();
    }
    this._derivedUnsubs.length = 0;
    this._store.destroy();
  }
}
