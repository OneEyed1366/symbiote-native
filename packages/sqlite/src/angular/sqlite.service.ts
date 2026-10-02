// Angular's DI twin of upstream's `<SQLiteProvider>`/`useSQLiteContext`
// (.vendors/expo@sdk-57 packages/expo-sqlite/src/hooks.tsx): ONE database instance app-wide by
// default, opened once and read through DI instead of a React context.
//
// Declarative config goes through `provideSqliteDatabase()` — the
// `providers: [{ provide: TOKEN, useValue }]` pattern this repo already uses for
// gate-demand.ts's `provideGateDemand()` — rather than a scoping directive like navigation's
// `symbioteNavigationScope`. That directive pattern deliberately mints a FRESH service instance
// per usage (one per route); wrong here, since a database is a singleton to open once, not
// something to re-scope per screen.
//
// Async state rides Angular's own `resource()` (adapters/angular/src/render/index.ts already
// leans on it for TransferState) rather than a hand-rolled Promise/Observable — it is the
// signals-first primitive this Angular adapter already uses for "async value + error + loading",
// so `database`/`error`/`isLoading` come straight off it instead of a second, parallel state
// machine. Its own contract already matches upstream's non-Suspense provider: a failure PARKS in
// `error()` rather than throwing, exactly like `SQLiteProviderNonSuspense`'s `onError` branch
// parks it in React state instead of re-throwing.
//
// `assetSource` reaches `openDatabaseAsync` via `ISqliteConfig.options`, forwarded below.
// No Suspense equivalent — Angular has none.

import {
  Injectable,
  InjectionToken,
  effect,
  inject,
  resource,
  signal,
  type OnDestroy,
  type Provider,
} from '@angular/core';
import { openDatabaseAsync } from '../core';
import type { IOpenDatabaseOptions } from '../core';

export interface ISqliteConfig {
  /** The name of the database file to open. */
  databaseName: string;
  /** The directory the database file is located in. Defaults to `defaultDatabaseDirectory`. */
  directory?: string;
  /** Open options — `onInit` runs once, right after the native handle opens. */
  options?: IOpenDatabaseOptions;
  /**
   * Called instead of the failure sitting quietly in `SqliteService#error` — mirrors upstream's
   * `SQLiteProviderProps.onError`. Omit it to read the failure off `error()` instead.
   */
  onError?: (error: Error) => void;
}

export const SQLITE_CONFIG = new InjectionToken<ISqliteConfig>(
  'symbiote.sqlite-config',
);

/**
 * Declarative config for `SqliteService`'s app-wide database — pass to `bootstrapApplication`'s
 * (or any environment injector's) `providers`, mirroring mounting `<SQLiteProvider>` once near
 * the app root.
 */
export function provideSqliteDatabase(config: ISqliteConfig): Provider {
  return { provide: SQLITE_CONFIG, useValue: config };
}

@Injectable({ providedIn: 'root' })
export class SqliteService implements OnDestroy {
  private readonly config = signal<ISqliteConfig | undefined>(undefined);
  private readonly onErrorHandler = signal<
    ((error: Error) => void) | undefined
  >(undefined);

  private readonly dbResource = resource({
    params: () => this.config(),
    loader: ({ params }) =>
      openDatabaseAsync(params.databaseName, params.options, params.directory),
  });

  /**
   * The resolved database, or `undefined` before `open()` has resolved. `resource()`'s own
   * contract: reading this while `error()` is set RE-THROWS that error instead of returning —
   * this IS the "propagates" half of upstream's `onError` contract for a caller that reads it
   * directly (e.g. from a template's `@if (sqlite.database(); as db)`).
   */
  readonly database = this.dbResource.value;
  /** The open failure, if any — reading `error()` itself never throws, only `database()` does. */
  readonly error = this.dbResource.error;
  readonly isLoading = this.dbResource.isLoading;

  constructor() {
    const injected = inject(SQLITE_CONFIG, { optional: true });
    if (injected) this.open(injected);

    effect(() => {
      const raw = this.dbResource.error();
      if (raw === undefined) return;
      const error = raw instanceof Error ? raw : new Error(String(raw));
      this.onErrorHandler()?.(error);
    });
  }

  /** Opens (or re-opens, for a new config) the app-wide database. */
  open(config: ISqliteConfig): void {
    this.onErrorHandler.set(config.onError);
    this.config.set(config);
  }

  // ponytail: closes only the CURRENTLY resolved handle, on the service's own teardown
  // (providedIn: 'root' → root injector destruction). Re-opening with a different config does
  // not close the previous handle first, unlike upstream's `getDatabaseAsync` memo — add that if
  // an app actually calls `open()` more than once per lifetime.
  ngOnDestroy(): void {
    // `hasValue()` never throws, unlike reading `.value()` directly on an errored resource.
    if (!this.dbResource.hasValue()) return;
    void this.dbResource.value().closeAsync();
  }
}
