// Solid <SQLiteProvider> + useSQLiteContext(), ported from expo-sqlite's hooks.tsx (sdk-57,
// .vendors/expo) onto this package's own openDatabaseAsync/SQLiteDatabase — see ../react's
// sqlite-context.tsx for the React twin this mirrors the OBSERVABLE contract of (the React-only
// mechanics, useEffect/use()/Suspense, don't transfer).
//
// Plain `.ts`, no JSX: this package's tsconfig has no per-directory override and inherits the
// root `jsx: "react-jsx"` (set for the React entry), so a `.tsx` file here would type-check its
// JSX against React's JSX namespace, not Solid's — the same trap `solid-jsx-namespace.md`
// documents for the adapter itself. `createComponent` is called directly instead, exactly as
// `packages/navigation/src/solid/stack/index.ts` does throughout.
//
// createResource is the right tool: it natively models pending/error/ready, and — the load-bearing
// part — reading an ERRORED resource accessor THROWS SYNCHRONOUSLY on every read (solid-js's own
// `read()`: `if (err !== undefined && !pr) throw err`), tracked or not. That is Solid's real
// equivalent of upstream's `handler = (e) => { throw e }` default: no onError -> the throw surfaces
// wherever `db()` is read (here, inside <Show>'s own tracking), and propagates through Solid's
// error-context chain exactly like any other component/memo/effect throw in this adapter
// (adapters/solid/src/render.ts's `catchError` + rethrow at the mount root — the tested,
// established "unhandled async failure" convention for this Solid adapter). With onError present,
// the fetcher calls it and resolves to `undefined` instead of throwing, so <Show> simply renders
// nothing rather than propagating — matching upstream's "loading || !db -> render null" forever.
//
// Closing the previous database before opening the next reuses createResource's own
// ResourceFetcherInfo.value (the last successfully resolved value) rather than a second piece of
// state — it IS "the database this resource had opened before". `openedDb` is a plain closure
// variable (not read through the resource accessor) so `onCleanup` never has to read a possibly
// -errored resource, which would itself throw during teardown.
//
// assetSource is deliberately NOT ported: it needs expo-asset, out of scope (see the README).
// useSuspense is deliberately NOT offered: Solid's own <Suspense> already composes with a plain
// createResource-backed component with zero extra code (any ancestor <Suspense> defers on this
// resource for free), so there is no second, opt-in code path to build the way React needs one —
// <prop_types_split_agnostic_vs_per_adapter>'s "framework-idiom divergence" class of omission.

import {
  createComponent,
  createContext,
  createResource,
  onCleanup,
  useContext,
  type Accessor,
  type JSX,
} from 'solid-js';
import { Show } from 'solid-js';
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
  children: JSX.Element;
  /** Run once, right after the native handle opens and before children render. */
  onInit?: IOnInitCallback;
  /** Handle errors from SQLiteProvider. @default rethrow (propagate through Solid's error context) */
  onError?: (error: Error) => void;
};

const SQLiteContext = createContext<SQLiteDatabase>();

function toError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}

type IDbSource = {
  databaseName: string;
  directory: string | undefined;
  options: ISQLiteOpenOptions | undefined;
  onInit: IOnInitCallback | undefined;
};

/**
 * Context.Provider component that provides a SQLite database to all children. All descendants
 * of this component can access the database via `useSQLiteContext`.
 */
export function SQLiteProvider(props: ISQLiteProviderProps): JSX.Element {
  // The last database THIS provider successfully opened — read only by onCleanup, never through
  // the resource accessor (which throws when the resource is in its errored state).
  let openedDb: SQLiteDatabase | undefined;

  const [db] = createResource<SQLiteDatabase | undefined, IDbSource>(
    () => ({
      databaseName: props.databaseName,
      directory: props.directory,
      options: props.options,
      onInit: props.onInit,
    }),
    async (source, info) => {
      if (info.value !== undefined) {
        await info.value.closeAsync();
      }
      try {
        const opened = await openDatabaseAsync(
          source.databaseName,
          { ...source.options, onInit: source.onInit },
          source.directory,
        );
        openedDb = opened;
        return opened;
      } catch (cause) {
        openedDb = undefined;
        const error = toError(cause);
        if (props.onError !== undefined) {
          props.onError(error);
          return undefined;
        }
        throw error;
      }
    },
  );

  onCleanup(() => {
    void openedDb?.closeAsync();
  });

  function renderReady(database: Accessor<SQLiteDatabase>): JSX.Element {
    return createComponent(SQLiteContext.Provider, {
      get value(): SQLiteDatabase {
        return database();
      },
      get children(): JSX.Element {
        return props.children;
      },
    });
  }

  // A direct call, not createComponent(Show, …): Show is overloaded (keyed vs non-keyed), and
  // TypeScript resolves an overloaded value against createComponent's generic Component<T> by its
  // LAST signature only — reporting the non-keyed props object as missing `keyed: true`. Calling
  // it directly goes through normal overload resolution instead, which picks correctly. Show's own
  // body needs no extra untrack wrapping (it already wraps every read in its own createMemo), so
  // nothing behavioral is lost by skipping createComponent here.
  return Show({
    get when(): SQLiteDatabase | undefined {
      return db();
    },
    children: renderReady,
  });
}

/** A primitive for accessing the SQLite database provided by an ancestor `<SQLiteProvider>`. */
export function useSQLiteContext(): SQLiteDatabase {
  const context = useContext(SQLiteContext);
  if (context === undefined) {
    throw new Error('useSQLiteContext must be used within a <SQLiteProvider>');
  }
  return context;
}
