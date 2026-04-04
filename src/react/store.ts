import {
  useSyncExternalStore,
  useCallback,
  useRef,
  useState,
  useEffect,
  createElement,
  forwardRef,
} from "react";
import { SnapStore } from "../core/base.js";
import { asyncStatus } from "../core/types.js";
import type { StoreOptions, AsyncStatus, DotPaths, GetByPath, Subscribable } from "../core/types.js";
import { shallowEqual } from "../core/shallow-equal.js";
import type { UrlParams } from "../url/params.js";
import { parseSearch } from "../url/params.js";

function getUrlParams(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  return parseSearch(window.location.search);
}

type OwnProps = Record<string, unknown>;

/** Full connect config with required `fetch` for async data loading on mount. */
export interface ConnectConfig<S, MappedProps, Own = OwnProps, Params extends Record<string, unknown> = Record<string, unknown>> {
  /**
   * Map store state to component props. Called on every store change.
   * @example props: store => ({ todos: store.getSnapshot().todos })
   */
  props: (store: S) => MappedProps;
  /**
   * Sync side-effect called on mount and whenever `deps` change.
   * Runs before `fetch`. Use for imperative setup like setting store values from props.
   * @example setup: (store, ownProps) => store.setFilter(ownProps.initialFilter)
   */
  setup?: (store: S, props: Own, params: Params) => void;
  /**
   * Async function called on mount and whenever `deps` change.
   * Automatically tracks loading/error status — use `loading` and `error` to render UI for each state.
   * @example fetch: store => store.fetchTodos()
   */
  fetch: (store: S, props: Own, params: Params) => Promise<void>;
  /**
   * Parse URL search params and pass them as the `params` argument to `fetch`, `setup`, and `deps`.
   * @example urlParams: { filter: "string" }  // ?filter=active → params.filter === "active"
   */
  urlParams?: UrlParams<Params>;
  /**
   * Called on unmount. Use to cancel subscriptions or reset store state.
   * @example cleanup: store => store.resetStatus()
   */
  cleanup?: (store: S, props: Own) => void;
  /**
   * Dependency array factory. When any returned value changes, `fetch` and `setup` re-run.
   * @example deps: (ownProps, params) => [params.filter]
   */
  deps?: (props: Own, params: Params) => unknown[];
  /**
   * Component rendered while `fetch` is in progress (status is `"loading"`).
   * @example loading: () => <Spinner />
   */
  loading?: React.ComponentType;
  /**
   * Component rendered when `fetch` fails (status is `"error"`). Receives the error message.
   * @example error: ({ error }) => <p>Failed: {error}</p>
   */
  error?: React.ComponentType<{ error: string }>;
  /**
   * Wrapper component around the connected component. Receives mapped props and `children`.
   * @example template: AppLayout  // wraps the connected component in AppLayout
   */
  template?: React.ComponentType<MappedProps & { children: React.ReactNode }>;
}

/** Connect config with props mapping only — no async `fetch`, so no loading/error states. */
export interface ConnectPropsConfig<S, MappedProps, Own = OwnProps, Params extends Record<string, unknown> = Record<string, unknown>> {
  /** Map store state to component props. Called on every store change. */
  props: (store: S) => MappedProps;
  /** Sync side-effect called on mount and whenever `deps` change. */
  setup?: (store: S, props: Own, params: Params) => void;
  /** Parse URL search params and pass them as `params` to `setup` and `deps`. */
  urlParams?: UrlParams<Params>;
  /** Called on unmount. Use to cancel subscriptions or reset store state. */
  cleanup?: (store: S, props: Own) => void;
  /** Dependency array factory. When any returned value changes, `setup` re-runs. */
  deps?: (props: Own, params: Params) => unknown[];
  /** Wrapper component around the connected component. Receives mapped props and `children`. */
  template?: React.ComponentType<MappedProps & { children: React.ReactNode }>;
}

/**
 * Selector function passed to `select`. Call `pick("path")` to subscribe to specific state paths.
 * @example select: pick => ({ name: pick("user.name"), count: pick("items").length })
 */
export type PickFn<T extends object> = <P extends DotPaths<T>>(path: P) => GetByPath<T, P>;

/**
 * Connect config using granular path-based subscriptions via `select`.
 * The component only re-renders when the selected paths change.
 * Paths are captured once at connect-time — `select` must use a stable set of paths.
 */
export interface SelectConnectConfig<T extends object, S, MappedProps, Own = OwnProps, Params extends Record<string, unknown> = Record<string, unknown>> {
  /**
   * Granular path-based selector. Use `pick("path")` to subscribe to specific state paths.
   * @example select: pick => ({ name: pick("user.name"), todos: pick("todos") })
   */
  select: (pick: PickFn<T>) => MappedProps;
  /**
   * Async function called on mount and whenever `deps` change.
   * When provided, enables `loading` and `error` UI.
   * @example fetch: store => store.fetchTodos()
   */
  fetch?: (store: S, props: Own, params: Params) => Promise<void>;
  /** Parse URL search params and pass them as `params` to `fetch`, `setup`, and `deps`. */
  urlParams?: UrlParams<Params>;
  /** Sync side-effect called on mount and whenever `deps` change. Runs before `fetch`. */
  setup?: (store: S, props: Own, params: Params) => void;
  /** Called on unmount. Use to cancel subscriptions or reset store state. */
  cleanup?: (store: S, props: Own) => void;
  /** Dependency array factory. When any returned value changes, `setup` (and `fetch`, if provided) re-run. */
  deps?: (props: Own, params: Params) => unknown[];
  /** Component rendered while `fetch` is in progress (status is `"loading"`). */
  loading?: React.ComponentType;
  /** Component rendered when `fetch` fails (status is `"error"`). Receives the error message. */
  error?: React.ComponentType<{ error: string }>;
  /** Wrapper component around the connected component. Receives mapped props and `children`. */
  template?: React.ComponentType<MappedProps & { children: React.ReactNode }>;
}

/** `SelectConnectConfig` variant where `fetch` is required — enables loading/error UI. */
export interface SelectFetchConnectConfig<T extends object, S, MappedProps, Own = OwnProps, Params extends Record<string, unknown> = Record<string, unknown>> extends SelectConnectConfig<T, S, MappedProps, Own, Params> {
  fetch: (store: S, props: Own, params: Params) => Promise<void>;
}

/**
 * Connect config using an array of top-level keys for granular subscriptions.
 * Shorthand for `select: pick => ({ key: pick("key"), ... })`.
 * @example select: ["user", "todos"]
 */
export interface SelectArrayConnectConfig<
  T extends object,
  S,
  Keys extends readonly (keyof T & string)[],
  Own = OwnProps,
  Params extends Record<string, unknown> = Record<string, unknown>,
> {
  select: [...Keys];
  fetch?: (store: S, props: Own, params: Params) => Promise<void>;
  urlParams?: UrlParams<Params>;
  setup?: (store: S, props: Own, params: Params) => void;
  cleanup?: (store: S, props: Own) => void;
  deps?: (props: Own, params: Params) => unknown[];
  loading?: React.ComponentType;
  error?: React.ComponentType<{ error: string }>;
  template?: React.ComponentType<Pick<T, Keys[number]> & { children: React.ReactNode }>;
}

/** `SelectArrayConnectConfig` variant where `fetch` is required — enables loading/error UI. */
export interface SelectArrayFetchConnectConfig<
  T extends object,
  S,
  Keys extends readonly (keyof T & string)[],
  Own = OwnProps,
  Params extends Record<string, unknown> = Record<string, unknown>,
> extends SelectArrayConnectConfig<T, S, Keys, Own, Params> {
  fetch: (store: S, props: Own, params: Params) => Promise<void>;
}

/**
 * Connect config for component-scoped stores. Each mount creates a fresh store instance via `factory`.
 * The store is destroyed on unmount.
 */
export interface ScopedConfig<S, MappedProps, Own = OwnProps, Params extends Record<string, unknown> = Record<string, unknown>> {
  /**
   * Factory function that creates a new store instance. Called once per component mount.
   * @example factory: () => new TodoStore()
   */
  factory: () => S;
  /** Map store state to component props. Called on every store change. */
  props: (store: S) => MappedProps;
  /**
   * Async function called on mount and whenever `deps` change.
   * When provided, enables `loading` and `error` UI.
   * @example fetch: store => store.fetchTodos()
   */
  fetch?: (store: S, ownProps: Own, params: Params) => Promise<void>;
  /** Parse URL search params and pass them as `params` to `fetch`, `setup`, and `deps`. */
  urlParams?: UrlParams<Params>;
  /** Sync side-effect called on mount and whenever `deps` change. Runs before `fetch`. */
  setup?: (store: S, ownProps: Own, params: Params) => void;
  /** Called on unmount. Use to cancel subscriptions or reset store state. */
  cleanup?: (store: S, ownProps: Own) => void;
  /** Dependency array factory. When any returned value changes, `setup` (and `fetch`, if provided) re-run. */
  deps?: (ownProps: Own, params: Params) => unknown[];
  /** Component rendered while `fetch` is in progress (status is `"loading"`). */
  loading?: React.ComponentType;
  /** Component rendered when `fetch` fails (status is `"error"`). Receives the error message. */
  error?: React.ComponentType<{ error: string }>;
  /** Wrapper component around the connected component. Receives mapped props and `children`. */
  template?: React.ComponentType<MappedProps & { children: React.ReactNode }>;
}

/** `ScopedConfig` variant where `fetch` is required — enables loading/error UI. */
export interface ScopedFetchConfig<S, MappedProps, Own = OwnProps, Params extends Record<string, unknown> = Record<string, unknown>> extends ScopedConfig<S, MappedProps, Own, Params> {
  fetch: (store: S, ownProps: Own, params: Params) => Promise<void>;
}

interface FetchConfig<S> {
  fetchFn?: (store: S) => Promise<void>;
  deps?: unknown[];
  loadingComponent?: React.ComponentType;
  errorComponent?: React.ComponentType<{ error: string }>;
}

interface FetchState {
  status: AsyncStatus;
  error: string | null;
}

const idleFetchState: FetchState = { status: asyncStatus("idle"), error: null };

function useFetchLifecycle<S>(store: S, config: FetchConfig<S>): FetchState {
  const { fetchFn, deps } = config;

  const [asyncState, setAsyncState] = useState<FetchState>(idleFetchState);
  const fetchGenRef = useRef(0);

  useEffect(() => {
    if (!fetchFn) { return; }
    let cancelled = false;
    const gen = ++fetchGenRef.current;
    setAsyncState({ status: asyncStatus("loading"), error: null });
    Promise.resolve()
      .then(() => {
        if (cancelled) { return; }
        return fetchFn(store);
      })
      .then(() => {
        if (gen === fetchGenRef.current) {
          setAsyncState({ status: asyncStatus("ready"), error: null });
        }
      })
      .catch((e) => {
        if (gen === fetchGenRef.current) {
          setAsyncState({
            status: asyncStatus("error"),
            error: e instanceof Error ? e.message : "Unknown error",
          });
        }
      });
    return () => { cancelled = true; };
  }, deps ?? []);

  return asyncState;
}

function renderFetchGuard<S>(
  asyncState: FetchState,
  config: FetchConfig<S>,
): React.ReactElement | null {
  const { fetchFn, loadingComponent, errorComponent } = config;
  if (!fetchFn) { return null; }
  if (loadingComponent && (asyncState.status.isIdle || asyncState.status.isLoading)) {
    return createElement(loadingComponent);
  }
  if (errorComponent && asyncState.status.isError) {
    return createElement(errorComponent, { error: asyncState.error ?? "Unknown error" });
  }
  return null;
}

function wrapWithTemplate(
  inner: React.ReactElement,
  template: React.ComponentType<any> | undefined,
  mappedProps: Record<string, unknown>,
): React.ReactElement {
  if (template) {
    return createElement(template, mappedProps, inner);
  }
  return inner;
}

function useLifecycle<S>(
  store: S,
  setupFn: ((store: S) => void) | undefined,
  cleanupFn: ((store: S) => void) | undefined,
  deps?: unknown[],
): void {
  const lifecycleGenRef = useRef(0);
  const setupRanGenRef = useRef(0);
  const hasDeps = deps !== undefined;
  useEffect(() => {
    if (!setupFn && !cleanupFn) { return; }
    const gen = ++lifecycleGenRef.current;
    if (setupFn) {
      queueMicrotask(() => {
        if (gen === lifecycleGenRef.current) {
          setupFn(store);
          setupRanGenRef.current = gen;
        }
      });
    } else {
      queueMicrotask(() => {
        if (gen === lifecycleGenRef.current) {
          setupRanGenRef.current = gen;
        }
      });
    }
    return () => {
      const teardownGen = lifecycleGenRef.current;
      if (cleanupFn) {
        queueMicrotask(() => {
          if (hasDeps || setupFn) {
            if (setupRanGenRef.current === gen) { cleanupFn(store); }
          } else {
            if (teardownGen === lifecycleGenRef.current) { cleanupFn(store); }
          }
        });
      }
    };
  }, deps ?? []);
}

interface LifecycleConfig<S> {
  fetchFn?: (store: S, props: OwnProps, params: Record<string, unknown>) => Promise<void>;
  getParams: () => Record<string, unknown>;
  urlParamsSource?: Subscribable<Record<string, unknown>>;
  setupFn?: (store: S, props: OwnProps, params: Record<string, unknown>) => void;
  cleanupFn?: (store: S, props: OwnProps) => void;
  depsFn?: (props: OwnProps, params: Record<string, unknown>) => unknown[];
  loadingComponent?: React.ComponentType;
  errorComponent?: React.ComponentType<{ error: string }>;
}

// Public config interfaces use narrower Own/Params types for callbacks,
// but LifecycleConfig erases them to OwnProps/Record<string,unknown>.
// Call sites cast to ConnectLifecycleInput to bridge the variance gap.
// This is safe because bindLifecycle passes the actual ownProps unchanged.
interface ConnectLifecycleInput<S> {
  fetch?: LifecycleConfig<S>["fetchFn"];
  urlParams?: UrlParams<Record<string, unknown>>;
  setup?: LifecycleConfig<S>["setupFn"];
  cleanup?: LifecycleConfig<S>["cleanupFn"];
  deps?: LifecycleConfig<S>["depsFn"];
  loading?: React.ComponentType;
  error?: React.ComponentType<{ error: string }>;
}

function buildLifecycleConfig<S>(config: ConnectLifecycleInput<S>): LifecycleConfig<S> {
  const up = config.urlParams;
  return {
    fetchFn: config.fetch,
    getParams: up ? () => up.getSnapshot() : getUrlParams,
    urlParamsSource: up,
    setupFn: config.setup,
    cleanupFn: config.cleanup,
    depsFn: config.deps,
    loadingComponent: config.loading,
    errorComponent: config.error,
  };
}

const emptyParams: Record<string, unknown> = {};
const noopSubscribe = () => () => {};
const noopGetSnapshot = () => emptyParams;

function useUrlParams(source: Subscribable<Record<string, unknown>> | undefined): void {
  const subscribe = useCallback(
    (cb: () => void) => source ? source.subscribe(cb) : noopSubscribe(),
    [source],
  );
  const snapshot = useCallback(
    () => source ? source.getSnapshot() : emptyParams,
    [source],
  );
  useSyncExternalStore(subscribe, snapshot, noopGetSnapshot);
}

function bindLifecycle<S>(ownProps: Record<string, unknown>, config: LifecycleConfig<S>) {
  const own = ownProps as OwnProps;
  const params = config.getParams();
  const deps = config.depsFn ? config.depsFn(own, params) : undefined;

  const wrapFetch = config.fetchFn;
  const wrapSetup = config.setupFn;
  const wrapCleanup = config.cleanupFn;

  const fetchFn = wrapFetch
    ? (s: S) => { return wrapFetch(s, own, params); }
    : undefined;
  const setupFn = wrapSetup
    ? (s: S) => { wrapSetup(s, own, params); }
    : undefined;
  const cleanupFn = wrapCleanup
    ? (s: S) => { wrapCleanup(s, own); }
    : undefined;

  return { deps, fetchFn, setupFn, cleanupFn };
}

export class ReactSnapStore<T extends object, K extends string = string> extends SnapStore<T, K> {
  constructor(initialState: T, options?: StoreOptions) {
    super(initialState, options);
  }

  /** Wire a component to the store, injecting props derived from state via `mapToProps`. */
  connect<P extends object, MappedProps extends Record<string, unknown>>(
    Component: React.ComponentType<P>,
    mapToProps: (store: this) => MappedProps,
  ): React.FC<Omit<P, keyof MappedProps>>;
  /** Wire a component to the store with async data fetching, loading, and error handling. */
  connect<P extends object, MappedProps extends Record<string, unknown>>(
    Component: React.ComponentType<P>,
    config: ConnectConfig<this, MappedProps, Omit<P, keyof MappedProps | "status" | "error">>,
  ): React.FC<Omit<P, keyof MappedProps | "status" | "error">>;
  /** Wire a component to the store with props mapping and optional cleanup. */
  connect<P extends object, MappedProps extends Record<string, unknown>>(
    Component: React.ComponentType<P>,
    config: ConnectPropsConfig<this, MappedProps, Omit<P, keyof MappedProps>>,
  ): React.FC<Omit<P, keyof MappedProps>>;
  /** Wire a component with array-based `select` shorthand plus async `fetch`. Top-level keys only. */
  connect<P extends object, Keys extends readonly (keyof T & string)[]>(
    Component: React.ComponentType<P>,
    config: SelectArrayFetchConnectConfig<T, this, Keys, Omit<P, Keys[number] | "status" | "error">>,
  ): React.FC<Omit<P, Keys[number] | "status" | "error">>;
  /** Wire a component with array-based `select` shorthand. Top-level keys only.
   *  @example store.connect(View, { select: ["user", "todos"] }) */
  connect<P extends object, Keys extends readonly (keyof T & string)[]>(
    Component: React.ComponentType<P>,
    config: SelectArrayConnectConfig<T, this, Keys, Omit<P, Keys[number]>>,
  ): React.FC<Omit<P, Keys[number]>>;
  /** Wire a component with granular `select` subscriptions plus async `fetch` for mount-time init. */
  connect<P extends object, MappedProps extends Record<string, unknown>>(
    Component: React.ComponentType<P>,
    config: SelectFetchConnectConfig<T, this, MappedProps, Omit<P, keyof MappedProps | "status" | "error">>,
  ): React.FC<Omit<P, keyof MappedProps | "status" | "error">>;
  /** Wire a component to the store with granular path-based subscriptions via `select`.
   *  Paths are captured once at connect-time — select must use a stable set of paths.
   *  For conditional/dynamic path selection, use the `mapToProps` overload instead. */
  connect<P extends object, MappedProps extends Record<string, unknown>>(
    Component: React.ComponentType<P>,
    config: SelectConnectConfig<T, this, MappedProps, Omit<P, keyof MappedProps>>,
  ): React.FC<Omit<P, keyof MappedProps>>;
  connect<P extends object, MappedProps extends Record<string, unknown>>(
    Component: React.ComponentType<P>,
    configOrMapper:
      | ((store: this) => MappedProps)
      | ConnectPropsConfig<this, MappedProps>
      | ConnectConfig<this, MappedProps>
      | SelectConnectConfig<T, this, MappedProps>
      | SelectArrayConnectConfig<T, this, readonly (keyof T & string)[]>,
  ): React.FC<Omit<P, keyof MappedProps>> {
    const store = this;

    if (typeof configOrMapper === "object" && "select" in configOrMapper) {
      if (Array.isArray(configOrMapper.select)) {
        const keys = configOrMapper.select;
        const normalized = {
          ...configOrMapper,
          select: (pick: PickFn<T>) => {
            const result: Record<string, unknown> = {};
            for (const key of keys) {
              result[key] = pick(key as DotPaths<T>);
            }
            return result;
          },
        };
        return this._connectWithSelect<P, MappedProps>(
          Component,
          normalized as SelectConnectConfig<T, typeof store, MappedProps, Omit<P, keyof MappedProps>>,
        );
      }

      return this._connectWithSelect<P, MappedProps>(
        Component,
        configOrMapper as SelectConnectConfig<T, typeof store, MappedProps, Omit<P, keyof MappedProps>>,
      );
    }

    const config = typeof configOrMapper === "function"
      ? null
      : configOrMapper as ConnectConfig<this, MappedProps>;
    const mapToProps = config ? config.props : configOrMapper as (store: this) => MappedProps;
    const lcConfig = config
      ? buildLifecycleConfig(config as ConnectLifecycleInput<typeof store>)
      : { getParams: getUrlParams } as LifecycleConfig<typeof store>;

    const Connected = forwardRef<unknown, Omit<P, keyof MappedProps>>(function Connected(ownProps, ref) {
      const cachedRef = useRef<{ revision: number; props: MappedProps } | null>(null);
      const revisionRef = useRef(0);

      useUrlParams(lcConfig.urlParamsSource);
      const { deps, fetchFn, setupFn, cleanupFn } = bindLifecycle(ownProps as OwnProps, lcConfig);

      const subscribe = useCallback(
        (cb: () => void) => store.subscribe(() => {
          revisionRef.current++;
          cb();
        }),
        [store],
      );

      const getSnapshot = useCallback(() => {
        const currentRevision = revisionRef.current;
        if (cachedRef.current && cachedRef.current.revision === currentRevision) {
          return cachedRef.current.props;
        }
        const next = mapToProps(store);
        if (cachedRef.current && shallowEqual(cachedRef.current.props, next)) {
          cachedRef.current = { revision: currentRevision, props: cachedRef.current.props };
          return cachedRef.current.props;
        }
        cachedRef.current = { revision: currentRevision, props: next };
        return next;
      }, [store]);

      const mappedProps = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

      useLifecycle(store, setupFn, cleanupFn, deps);

      const fetchConfig: FetchConfig<typeof store> = {
        fetchFn, deps,
        loadingComponent: lcConfig.loadingComponent,
        errorComponent: lcConfig.errorComponent,
      };
      const asyncState = useFetchLifecycle(store, fetchConfig);

      const guard = renderFetchGuard(asyncState, fetchConfig);
      if (guard) { return guard; }

      const inner = createElement(Component, {
        ...ownProps,
        ...mappedProps,
        ...(lcConfig.fetchFn ? asyncState : {}),
        ref,
      } as unknown as P);

      return wrapWithTemplate(inner, config?.template, mappedProps);
    });

    Connected.displayName = `Connect(${Component.displayName || Component.name || "Component"})`;
    return Connected as unknown as React.FC<Omit<P, keyof MappedProps>>;
  }

  private _connectWithSelect<P extends object, MappedProps extends Record<string, unknown>>(
    Component: React.ComponentType<P>,
    config: SelectConnectConfig<T, this, MappedProps, Omit<P, keyof MappedProps>>,
  ): React.FC<Omit<P, keyof MappedProps>> {
    const store = this;
    const selectFn = config.select;
    const lcConfig = buildLifecycleConfig(config as ConnectLifecycleInput<typeof store>);

    const resolvePathValue = (path: string): any => {
      const segments = path.split(".");
      let val: any = store.getSnapshot();
      for (const seg of segments) {
        if (val == null) { return undefined; }
        val = val[seg];
      }
      return val;
    };

    const trackedPaths: string[] = [];
    const trackingPick: PickFn<T> = ((path: string) => {
      trackedPaths.push(path);
      return resolvePathValue(path);
    }) as PickFn<T>;
    selectFn(trackingPick);
    const paths = [...trackedPaths];

    const readPick: PickFn<T> = ((path: string) => {
      return resolvePathValue(path);
    }) as PickFn<T>;

    const Connected = forwardRef<unknown, Omit<P, keyof MappedProps>>(function Connected(ownProps, ref) {
      const cachedRef = useRef<{ revision: number; props: MappedProps } | null>(null);
      const revisionRef = useRef(0);

      useUrlParams(lcConfig.urlParamsSource);
      const { deps, fetchFn, setupFn, cleanupFn } = bindLifecycle(ownProps as OwnProps, lcConfig);

      const subscribe = useCallback(
        (cb: () => void) => {
          const unsubs = paths.map((p) =>
            store.subscribe(p, () => {
              revisionRef.current++;
              cb();
            }),
          );
          return () => unsubs.forEach((u) => u());
        },
        [store],
      );

      const getSnapshot = useCallback(() => {
        const currentRevision = revisionRef.current;
        if (cachedRef.current && cachedRef.current.revision === currentRevision) {
          return cachedRef.current.props;
        }
        const next = selectFn(readPick);
        if (cachedRef.current && shallowEqual(cachedRef.current.props, next)) {
          cachedRef.current = { revision: currentRevision, props: cachedRef.current.props };
          return cachedRef.current.props;
        }
        cachedRef.current = { revision: currentRevision, props: next };
        return next;
      }, [store]);

      const mappedProps = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

      useLifecycle(store, setupFn, cleanupFn, deps);

      const fetchConfig: FetchConfig<typeof store> = {
        fetchFn, deps,
        loadingComponent: lcConfig.loadingComponent,
        errorComponent: lcConfig.errorComponent,
      };
      const asyncState = useFetchLifecycle(store, fetchConfig);

      const guard = renderFetchGuard(asyncState, fetchConfig);
      if (guard) { return guard; }

      const inner = createElement(Component, {
        ...ownProps,
        ...mappedProps,
        ...(lcConfig.fetchFn ? asyncState : {}),
        ref,
      } as unknown as P);

      return wrapWithTemplate(inner, config.template, mappedProps);
    });

    Connected.displayName = `Connect(${Component.displayName || Component.name || "Component"})`;
    return Connected as unknown as React.FC<Omit<P, keyof MappedProps>>;
  }

  /** Create a component-scoped store: instantiated on mount, destroyed on unmount. */
  static scoped<
    S extends ReactSnapStore<any, any>,
    P extends object,
    MappedProps extends Record<string, unknown>,
  >(
    Component: React.ComponentType<P>,
    config: ScopedFetchConfig<S, MappedProps, Omit<P, keyof MappedProps | "status" | "error">>,
  ): React.FC<Omit<P, keyof MappedProps | "status" | "error">>;
  /** Create a component-scoped store with props mapping only (no fetch). */
  static scoped<
    S extends ReactSnapStore<any, any>,
    P extends object,
    MappedProps extends Record<string, unknown>,
  >(
    Component: React.ComponentType<P>,
    config: ScopedConfig<S, MappedProps, Omit<P, keyof MappedProps>>,
  ): React.FC<Omit<P, keyof MappedProps>>;
  static scoped<
    S extends ReactSnapStore<any, any>,
    P extends object,
    MappedProps extends Record<string, unknown>,
  >(
    Component: React.ComponentType<P>,
    config: ScopedConfig<S, MappedProps>,
  ): React.FC<Omit<P, keyof MappedProps>> {
    const lcConfig = buildLifecycleConfig(config as ConnectLifecycleInput<S>);

    const Scoped = forwardRef<unknown, Omit<P, keyof MappedProps>>(function Scoped(ownProps, ref) {
      const [store, setStore] = useState<S | null>(null);
      useUrlParams(lcConfig.urlParamsSource);

      // Create store in effect so StrictMode properly pairs creation with cleanup.
      // Render-time creation (useRef lazy init) leaks stores whose constructor has
      // side effects (e.g. derive subscriptions) because discarded StrictMode
      // renders never run effect cleanup.
      useEffect(() => {
        const newStore = config.factory();
        setStore(newStore);
        return () => { newStore.destroy(); };
      }, []);

      const cachedRef = useRef<{ revision: number; props: MappedProps } | null>(null);
      const revisionRef = useRef(0);

      const own = ownProps as OwnProps;
      const params = lcConfig.getParams();
      const baseDeps = lcConfig.depsFn ? lcConfig.depsFn(own, params) : undefined;
      // Include store in deps so lifecycle hooks re-fire when store becomes available
      const deps = baseDeps !== undefined ? [...baseDeps, store] : [store];

      const fetchFn = store && lcConfig.fetchFn
        ? (s: S) => lcConfig.fetchFn!(s, own, params)
        : undefined;
      const setupFn = store && lcConfig.setupFn
        ? (s: S) => lcConfig.setupFn!(s, own, params)
        : undefined;
      const cleanupFn = store && lcConfig.cleanupFn
        ? (s: S) => lcConfig.cleanupFn!(s, own)
        : undefined;

      const subscribe = useCallback(
        (cb: () => void) => {
          if (!store) return () => {};
          return store.subscribe(() => {
            revisionRef.current++;
            cb();
          });
        },
        [store],
      );

      const getSnapshot = useCallback(() => {
        if (!store) return null as unknown as MappedProps;
        const currentRevision = revisionRef.current;
        if (cachedRef.current && cachedRef.current.revision === currentRevision) {
          return cachedRef.current.props;
        }
        const next = config.props(store);
        if (cachedRef.current && shallowEqual(cachedRef.current.props, next)) {
          cachedRef.current = { revision: currentRevision, props: cachedRef.current.props };
          return cachedRef.current.props;
        }
        cachedRef.current = { revision: currentRevision, props: next };
        return next;
      }, [store]);

      const mappedProps = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

      useLifecycle(store as S, setupFn, cleanupFn, deps);

      const fetchConfig: FetchConfig<S> = {
        fetchFn, deps,
        loadingComponent: lcConfig.loadingComponent,
        errorComponent: lcConfig.errorComponent,
      };
      const asyncState = useFetchLifecycle(store as S, fetchConfig);

      if (!store) {
        return lcConfig.loadingComponent ? createElement(lcConfig.loadingComponent) : null;
      }

      const guard = renderFetchGuard(asyncState, fetchConfig);
      if (guard) { return guard; }

      const inner = createElement(Component, {
        ...ownProps,
        ...mappedProps,
        ...(lcConfig.fetchFn ? asyncState : {}),
        ref,
      } as unknown as P);

      return wrapWithTemplate(inner, config.template, mappedProps);
    });

    Scoped.displayName = `Scoped(${Component.displayName || Component.name || "Component"})`;
    return Scoped as unknown as React.FC<Omit<P, keyof MappedProps>>;
  }
}
