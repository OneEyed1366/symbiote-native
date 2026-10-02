// Co-located Angular-driven test for SqliteService. This service has no view and no Fabric
// involvement, so it is exercised through DI alone — `createEnvironmentInjector` with the exact
// provider bundle adapters/angular/src/render/index.ts's `mount()` builds for a from-scratch,
// DOM-less environment injector (INJECTOR_SCOPE: 'root' so `providedIn: 'root'` tokens resolve,
// zoneless change-detection providers so `effect()`/`resource()` flush, a DOCUMENT stub because
// `resource()`'s root TransferState factory reads `document.getElementById` — see that file's own
// comment on both). `TestBed` needs `@angular/platform-browser`'s testing module (a DOM), which
// this monorepo's `vitest.config.ts` runs with `environment: 'node'` and no such dependency
// installed — the same reason every other Angular test here (stack.test.ts, render.test.ts) goes
// through `mount()`/`createEnvironmentInjector` rather than `TestBed`.
//
// Same native-module fake as ../core/sqlite-database.test.ts: a real better-sqlite3 database
// behind expo-sqlite's shape, so opens/inits/closes are genuine SQLite behavior, not a stub.

import '@angular/compiler';
import {
  createEnvironmentInjector,
  DOCUMENT,
  ɵINJECTOR_SCOPE as INJECTOR_SCOPE,
  ɵprovideZonelessChangeDetectionInternal as provideZonelessChangeDetectionInternal,
  type EnvironmentInjector,
  type Provider,
} from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FAKE_EXPO_SQLITE } from '../core/native-fakes';

vi.mock('../core/native-module', () => ({ expoSQLite: FAKE_EXPO_SQLITE }));
vi.mock('@symbiote-native/asset', () => ({
  Asset: {
    fromModule: vi.fn(() => ({
      downloadAsync: async () => ({ localUri: null }),
    })),
  },
}));
vi.mock('expo-modules-core', () => ({ Platform: { OS: 'ios' } }));

const { SqliteService, provideSqliteDatabase } =
  await import('./sqlite.service');

// `resource()`'s loader effect + the loader's own promise both settle on a microtask each — two
// macrotask ticks is the same margin adapters/angular/src/render/render.test.ts's
// `drainAngularAndCommit` uses for identical Angular async scheduling.
const flush = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
};

const rootInjectorParent = (): EnvironmentInjector =>
  // Same sanctioned I/O-edge cast render/index.ts's `rootInjectorParent()` uses: a null parent
  // IS a root injector for `createEnvironmentInjector`, but its type only models a non-null one.
  null as unknown as EnvironmentInjector;

function createTestInjector(
  extraProviders: Provider[] = [],
): EnvironmentInjector {
  return createEnvironmentInjector(
    [
      { provide: INJECTOR_SCOPE, useValue: 'root' },
      {
        provide: DOCUMENT,
        useValue: { getElementById: (): null => null },
      },
      ...provideZonelessChangeDetectionInternal(),
      ...extraProviders,
    ],
    rootInjectorParent(),
  );
}

const injectors: EnvironmentInjector[] = [];
function newSqliteService(extraProviders: Provider[] = []) {
  const injector = createTestInjector(extraProviders);
  injectors.push(injector);
  return injector.get(SqliteService);
}

afterEach(() => {
  for (const injector of injectors.splice(0)) injector.destroy();
  vi.clearAllMocks();
});

describe('open', () => {
  it('opening resolves to a usable SQLiteDatabase', async () => {
    const service = newSqliteService();
    service.open({ databaseName: `angular-open-${Math.random()}.db` });
    await flush();

    const db = service.database();
    expect(db).toBeDefined();
    await db?.execAsync('CREATE TABLE t (id INTEGER PRIMARY KEY)');
    const row = await db?.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'",
    );
    expect(row?.count).toBe(1);
    expect(service.error()).toBeUndefined();
  });

  it('provideSqliteDatabase configures and auto-opens the database on construction', async () => {
    const service = newSqliteService([
      provideSqliteDatabase({
        databaseName: `angular-provide-${Math.random()}.db`,
      }),
    ]);
    await flush();

    expect(service.database()).toBeDefined();
  });
});

describe('errors', () => {
  it('onError is invoked instead of propagating on failure', async () => {
    const onError = vi.fn();
    const service = newSqliteService();

    service.open({
      databaseName: `angular-error-${Math.random()}.db`,
      options: {
        onInit: () => {
          throw new Error('boom');
        },
      },
      onError,
    });
    await flush();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    // `resource()`'s own contract: reading `.value()` while `status()` is 'error' re-throws that
    // error — `onError` is an ADDITIONAL side channel, it does not swallow this.
    expect(() => service.database()).toThrow('boom');
  });

  it('propagates through error() when onError is omitted', async () => {
    const service = newSqliteService();

    service.open({
      databaseName: `angular-error-noop-${Math.random()}.db`,
      options: {
        onInit: () => {
          throw new Error('kaboom');
        },
      },
    });
    await flush();

    expect(service.error()).toBeInstanceOf(Error);
    // No onError side channel here — `.value()` throwing IS the propagation.
    expect(() => service.database()).toThrow('kaboom');
  });
});

describe('teardown', () => {
  it('closes the resolved database on the service own destroy', async () => {
    const service = newSqliteService();
    service.open({ databaseName: `angular-teardown-${Math.random()}.db` });
    await flush();

    const db = service.database();
    if (!db) throw new Error('expected a resolved database');
    const closeSpy = vi.spyOn(db, 'closeAsync');

    service.ngOnDestroy();

    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
