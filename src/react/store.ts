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
import type { StoreOptions, AsyncStatus, DotPaths, GetByPath } from "../core/types.js";

type OwnProps = Record<string, unknown>;

interface ConnectConfig<S, MappedProps, Own = OwnProps> {
  props: (store: S) => MappedProps;
  setup?: (store: S, props: Own) => void;
  fetch: (store: S, props: Own) => Promise<void>;
  cleanup?: (store: S, props: Own) => void;
  deps?: (props: Own) => unknown[];
  loading?: React.ComponentType;
  error?: React.ComponentType<{ error: string }>;
}

interface ConnectPropsConfig<S, MappedProps, Own = OwnProps> {
  props: (store: S) => MappedProps;
  setup?: (store: S, props: Own) => void;
  cleanup?: (store: S, props: Own) => void;
  deps?: (props: Own) => unknown[];
}

type PickFn<T extends object> = <P extends DotPaths<T>>(path: P) => GetByPath<T, P>;

interface SelectConnectConfig<T extends object, S, MappedProps, Own = OwnProps> {
  select: (pick: PickFn<T>) => MappedProps;
  fetch?: (store: S, props: Own) => Promise<void>;
  setup?: (store: S, props: Own) => void;
  cleanup?: (store: S, props: Own) => void;
  deps?: (props: Own) => unknown[];
  loading?: React.ComponentType;
  error?: React.ComponentType<{ error: string }>;
}

interface SelectFetchConnectConfig<T extends object, S, MappedProps, Own = OwnProps> extends SelectConnectConfig<T, S, MappedProps, Own> {
  fetch: (store: S, props: Own) => Promise<void>;
}

interface ScopedConfig<S, MappedProps, Own = OwnProps> {
  factory: () => S;
  props: (store: S) => MappedProps;
  fetch?: (store: S, ownProps: Own) => Promise<void>;
  setup?: (store: S, ownProps: Own) => void;
  cleanup?: (store: S, ownProps: Own) => void;
  deps?: (ownProps: Own) => unknown[];
  loading?: React.ComponentType;
  error?: React.ComponentType<{ error: string }>;
}

interface ScopedFetchConfig<S, MappedProps, Own = OwnProps> extends ScopedConfig<S, MappedProps, Own> {
  fetch: (store: S, ownProps: Own) => Promise<void>;
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

function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) { return false; }
  for (const key of keysA) {
    if (a[key] !== b[key]) { return false; }
  }
  return true;
}

interface LifecycleConfig<S> {
  fetchFn?: (store: S, props: OwnProps) => Promise<void>;
  setupFn?: (store: S, props: OwnProps) => void;
  cleanupFn?: (store: S, props: OwnProps) => void;
  depsFn?: (props: OwnProps) => unknown[];
  loadingComponent?: React.ComponentType;
  errorComponent?: React.ComponentType<{ error: string }>;
}

function bindLifecycle<S>(ownProps: Record<string, unknown>, config: LifecycleConfig<S>) {
  const own = ownProps as OwnProps;
  const deps = config.depsFn ? config.depsFn(own) : undefined;

  const wrapFetch = config.fetchFn;
  const wrapSetup = config.setupFn;
  const wrapCleanup = config.cleanupFn;

  const fetchFn = wrapFetch
    ? (s: S) => { return wrapFetch(s, own); }
    : undefined;
  const setupFn = wrapSetup
    ? (s: S) => { wrapSetup(s, own); }
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
      | SelectConnectConfig<T, this, MappedProps>,
  ): React.FC<Omit<P, keyof MappedProps>> {
    const store = this;

    if (typeof configOrMapper === "object" && "select" in configOrMapper) {
      return this._connectWithSelect<P, MappedProps>(Component, configOrMapper);
    }

    const config = typeof configOrMapper === "function"
      ? null
      : configOrMapper as ConnectConfig<this, MappedProps>;
    const mapToProps = config ? config.props : configOrMapper as (store: this) => MappedProps;
    const lcConfig = {
      fetchFn: config?.fetch,
      setupFn: config?.setup,
      cleanupFn: config?.cleanup,
      depsFn: config?.deps,
      loadingComponent: config?.loading,
      errorComponent: config?.error,
    } as LifecycleConfig<typeof store>;

    const Connected = forwardRef<unknown, Omit<P, keyof MappedProps>>(function Connected(ownProps, ref) {
      const cachedRef = useRef<{ revision: number; props: MappedProps } | null>(null);
      const revisionRef = useRef(0);

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

      return createElement(Component, {
        ...ownProps,
        ...mappedProps,
        ...(lcConfig.fetchFn ? asyncState : {}),
        ref,
      } as unknown as P);
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
    const lcConfig = {
      fetchFn: config.fetch,
      setupFn: config.setup,
      cleanupFn: config.cleanup,
      depsFn: config.deps,
      loadingComponent: config.loading,
      errorComponent: config.error,
    } as LifecycleConfig<typeof store>;

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

      return createElement(Component, {
        ...ownProps,
        ...mappedProps,
        ...(lcConfig.fetchFn ? asyncState : {}),
        ref,
      } as unknown as P);
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
    const lcConfig = {
      fetchFn: config.fetch,
      setupFn: config.setup,
      cleanupFn: config.cleanup,
      depsFn: config.deps,
      loadingComponent: config.loading,
      errorComponent: config.error,
    } as LifecycleConfig<S>;

    const Scoped = forwardRef<unknown, Omit<P, keyof MappedProps>>(function Scoped(ownProps, ref) {
      const [store, setStore] = useState<S | null>(null);

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
      const baseDeps = lcConfig.depsFn ? lcConfig.depsFn(own) : undefined;
      // Include store in deps so lifecycle hooks re-fire when store becomes available
      const deps = baseDeps !== undefined ? [...baseDeps, store] : [store];

      const fetchFn = store && lcConfig.fetchFn
        ? (s: S) => lcConfig.fetchFn!(s, own)
        : undefined;
      const setupFn = store && lcConfig.setupFn
        ? (s: S) => lcConfig.setupFn!(s, own)
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

      if (!store) return null;

      const guard = renderFetchGuard(asyncState, fetchConfig);
      if (guard) { return guard; }

      return createElement(Component, {
        ...ownProps,
        ...mappedProps,
        ...(lcConfig.fetchFn ? asyncState : {}),
        ref,
      } as unknown as P);
    });

    Scoped.displayName = `Scoped(${Component.displayName || Component.name || "Component"})`;
    return Scoped as unknown as React.FC<Omit<P, keyof MappedProps>>;
  }
}
