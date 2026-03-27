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

interface ConnectConfig<S, MappedProps> {
  props: (store: S) => MappedProps;
  setup?: (store: S) => void;
  fetch: (store: S) => Promise<void>;
  cleanup?: (store: S) => void;
  loading?: React.ComponentType;
  error?: React.ComponentType<{ error: string }>;
}

interface ConnectPropsConfig<S, MappedProps> {
  props: (store: S) => MappedProps;
  setup?: (store: S) => void;
  cleanup?: (store: S) => void;
}

type PickFn<T extends object> = <P extends DotPaths<T>>(path: P) => GetByPath<T, P>;

interface SelectConnectConfig<T extends object, MappedProps> {
  select: (pick: PickFn<T>) => MappedProps;
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
    config: ConnectConfig<this, MappedProps>,
  ): React.FC<Omit<P, keyof MappedProps | "status" | "error">>;
  /** Wire a component to the store with props mapping and optional cleanup. */
  connect<P extends object, MappedProps extends Record<string, unknown>>(
    Component: React.ComponentType<P>,
    config: ConnectPropsConfig<this, MappedProps>,
  ): React.FC<Omit<P, keyof MappedProps>>;
  /** Wire a component to the store with granular path-based subscriptions via `select`.
   *  Paths are captured once at connect-time — select must use a stable set of paths.
   *  For conditional/dynamic path selection, use the `mapToProps` overload instead. */
  connect<P extends object, MappedProps extends Record<string, unknown>>(
    Component: React.ComponentType<P>,
    config: SelectConnectConfig<T, MappedProps>,
  ): React.FC<Omit<P, keyof MappedProps>>;
  connect<P extends object, MappedProps extends Record<string, unknown>>(
    Component: React.ComponentType<P>,
    configOrMapper:
      | ((store: this) => MappedProps)
      | ConnectPropsConfig<this, MappedProps>
      | ConnectConfig<this, MappedProps>
      | SelectConnectConfig<T, MappedProps>,
  ): React.FC<Omit<P, keyof MappedProps>> {
    const store = this;

    if (typeof configOrMapper === "object" && "select" in configOrMapper) {
      return this._connectWithSelect<P, MappedProps>(Component, configOrMapper.select);
    }

    const config = typeof configOrMapper === "function"
      ? null
      : configOrMapper as ConnectConfig<this, MappedProps>;
    const mapToProps = config ? config.props : configOrMapper as (store: this) => MappedProps;
    const fetchFn = config?.fetch;
    const loadingComponent = config?.loading;
    const errorComponent = config?.error;
    const setupFn = config?.setup;
    const cleanupFn = config?.cleanup;

    const Connected = forwardRef<unknown, Omit<P, keyof MappedProps>>(function Connected(ownProps, ref) {
      const cachedRef = useRef<{ revision: number; props: MappedProps } | null>(null);
      const revisionRef = useRef(0);

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

      const [asyncState, setAsyncState] = useState<{
        status: AsyncStatus;
        error: string | null;
      }>({ status: asyncStatus("idle"), error: null });

      const fetchGenRef = useRef(0);

      const lifecycleGenRef = useRef(0);
      useEffect(() => {
        if (!setupFn && !cleanupFn) return;
        const gen = ++lifecycleGenRef.current;
        if (setupFn) {
          queueMicrotask(() => {
            if (gen === lifecycleGenRef.current) setupFn(store);
          });
        }
        return () => {
          const teardownGen = lifecycleGenRef.current;
          if (cleanupFn) {
            queueMicrotask(() => {
              if (teardownGen === lifecycleGenRef.current) cleanupFn(store);
            });
          }
        };
      }, []);

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
      }, []);

      if (fetchFn) {
        if (loadingComponent && (asyncState.status.isIdle || asyncState.status.isLoading)) {
          return createElement(loadingComponent);
        }
        if (errorComponent && asyncState.status.isError) {
          return createElement(errorComponent, { error: asyncState.error! });
        }
      }

      return createElement(Component, {
        ...ownProps,
        ...mappedProps,
        ...(fetchFn ? asyncState : {}),
        ref,
      } as unknown as P);
    });

    Connected.displayName = `Connect(${Component.displayName || Component.name || "Component"})`;
    return Connected as unknown as React.FC<Omit<P, keyof MappedProps>>;
  }

  private _connectWithSelect<P extends object, MappedProps extends Record<string, unknown>>(
    Component: React.ComponentType<P>,
    selectFn: (pick: PickFn<T>) => MappedProps,
  ): React.FC<Omit<P, keyof MappedProps>> {
    const store = this;

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

      return createElement(Component, {
        ...ownProps,
        ...mappedProps,
        ref,
      } as unknown as P);
    });

    Connected.displayName = `Connect(${Component.displayName || Component.name || "Component"})`;
    return Connected as unknown as React.FC<Omit<P, keyof MappedProps>>;
  }
}
