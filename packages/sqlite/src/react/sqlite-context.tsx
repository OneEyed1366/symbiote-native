// React <SQLiteProvider> + useSQLiteContext(), ported from expo-sqlite's hooks.tsx (sdk-57,
// .vendors/expo) onto this package's own openDatabaseAsync/SQLiteDatabase. Deliberately excludes
// `assetSource` (bundling a database from a require()'d asset needs expo-asset, out of scope for
// this pass — see the README). React 19's built-in `use()` replaces upstream's private
// Suspense-promise polyfill (~40 LOC of `ReactUsePromise` plumbing, unnecessary now that the
// peer range is react >=19.0.0). Unlike upstream, `onInit` is NOT invoked here — this package's
// own `openDatabaseAsync` already runs it internally before resolving (see
// `IOnInitCallback`'s doc comment in `core/types.ts`), so the provider only has to forward it.

import {
  createContext,
  memo,
  use,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  openDatabaseAsync,
  type IOnInitCallback,
  type ISQLiteOpenOptions,
  type SQLiteDatabase,
} from '../core';

export type ISQLiteProviderProps = {
  /** The name of the database file to open. */
  databaseName: string;
  /** The directory where the database file is located. @default defaultDatabaseDirectory */
  directory?: string;
  /** Open options. */
  options?: ISQLiteOpenOptions;
  /** The children to render. */
  children: ReactNode;
  /** Run once, right after the native handle opens and before children render. */
  onInit?: IOnInitCallback;
  /** Handle errors from SQLiteProvider. @default rethrow the error */
  onError?: (error: Error) => void;
  /** Enable React.Suspense integration. @default false */
  useSuspense?: boolean;
};

const SQLiteContext = createContext<SQLiteDatabase | null>(null);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Structural equality, recursing into plain objects — used only to keep the memo comparator
 * below from reopening a database when a parent re-passes a deep-equal but new `options` object. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!isRecord(a) || !isRecord(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  return (
    aKeys.length === bKeys.length &&
    aKeys.every(key => deepEqual(a[key], b[key]))
  );
}

function propsAreEqual(
  prev: ISQLiteProviderProps,
  next: ISQLiteProviderProps,
): boolean {
  return (
    prev.databaseName === next.databaseName &&
    deepEqual(prev.options, next.options) &&
    prev.directory === next.directory &&
    prev.onInit === next.onInit &&
    prev.onError === next.onError &&
    prev.useSuspense === next.useSuspense
  );
}

function toError(caught: unknown): Error {
  return caught instanceof Error ? caught : new Error(String(caught));
}

/**
 * Context.Provider component that provides a SQLite database to all children. All descendants
 * of this component can access the database via `useSQLiteContext`.
 */
export const SQLiteProvider = memo(function SQLiteProvider({
  children,
  onError,
  useSuspense = false,
  ...props
}: ISQLiteProviderProps): ReactElement | null {
  if (onError != null && useSuspense) {
    throw new Error(
      'Cannot use `onError` with `useSuspense`, use error boundaries instead.',
    );
  }

  if (useSuspense) {
    return (
      <SQLiteProviderSuspense {...props}>{children}</SQLiteProviderSuspense>
    );
  }

  return (
    <SQLiteProviderNonSuspense {...props} onError={onError}>
      {children}
    </SQLiteProviderNonSuspense>
  );
}, propsAreEqual);

/** A hook for accessing the SQLite database provided by an ancestor `<SQLiteProvider>`. */
export function useSQLiteContext(): SQLiteDatabase {
  const context = useContext(SQLiteContext);
  if (context == null) {
    throw new Error('useSQLiteContext must be used within a <SQLiteProvider>');
  }
  return context;
}

//#region Internals

function SQLiteProviderNonSuspense({
  databaseName,
  directory,
  options,
  children,
  onInit,
  onError,
}: Omit<ISQLiteProviderProps, 'useSuspense'>): ReactElement | null {
  const databaseRef = useRef<SQLiteDatabase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function setup(): Promise<void> {
      try {
        const db = await openDatabaseAsync(
          databaseName,
          { ...options, onInit },
          directory,
        );
        databaseRef.current = db;
        setLoading(false);
      } catch (caught) {
        setError(toError(caught));
      }
    }

    async function teardown(db: SQLiteDatabase | null): Promise<void> {
      try {
        await db?.closeAsync();
      } catch (caught) {
        setError(toError(caught));
      }
    }

    setup();

    return () => {
      const db = databaseRef.current;
      teardown(db);
      databaseRef.current = null;
      setLoading(true);
    };
  }, [databaseName, directory, options, onInit]);

  if (error != null) {
    const handler =
      onError ??
      ((caught: Error) => {
        throw caught;
      });
    handler(error);
  }
  if (loading || databaseRef.current == null) {
    return null;
  }
  return (
    <SQLiteContext.Provider value={databaseRef.current}>
      {children}
    </SQLiteContext.Provider>
  );
}

type IDatabaseCacheEntry = {
  databaseName: string;
  directory: string | undefined;
  options: ISQLiteOpenOptions | undefined;
  onInit: IOnInitCallback | undefined;
  promise: Promise<SQLiteDatabase>;
};

// A single module-scope cache entry, mirroring upstream: only ONE suspended database is tracked
// across the whole app at a time, and a second concurrent <SQLiteProvider useSuspense> for a
// different database closes the first before opening the next. Faithful to upstream's own
// `databaseInstance` shape, not a per-provider cache.
let databaseCache: IDatabaseCacheEntry | null = null;

function getDatabaseAsync(
  databaseName: string,
  directory: string | undefined,
  options: ISQLiteOpenOptions | undefined,
  onInit: IOnInitCallback | undefined,
): Promise<SQLiteDatabase> {
  if (
    databaseCache != null &&
    databaseCache.databaseName === databaseName &&
    databaseCache.directory === directory &&
    databaseCache.options === options &&
    databaseCache.onInit === onInit
  ) {
    return databaseCache.promise;
  }

  const previous = databaseCache;
  const promise =
    previous != null
      ? previous.promise
          .then(db => db.closeAsync())
          .then(() =>
            openDatabaseAsync(databaseName, { ...options, onInit }, directory),
          )
      : openDatabaseAsync(databaseName, { ...options, onInit }, directory);

  databaseCache = { databaseName, directory, options, onInit, promise };
  return promise;
}

function SQLiteProviderSuspense({
  databaseName,
  directory,
  options,
  children,
  onInit,
}: Omit<ISQLiteProviderProps, 'onError' | 'useSuspense'>): ReactElement {
  const database = use(
    getDatabaseAsync(databaseName, directory, options, onInit),
  );
  return (
    <SQLiteContext.Provider value={database}>{children}</SQLiteContext.Provider>
  );
}

//#endregion
