import { afterEach, describe, expect, it, vi } from 'vitest';

import { FAKE_EXPO_SQLITE, FakeNativeStatement } from './native-fakes';

// The real ExpoSQLite native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless run, so the module-lookup
// file is faked in place of expo-modules-core's runtime resolution, the same pattern
// packages/secure-store/src/core/secure-store.test.ts uses. Unlike that package's fake, this one
// wraps a REAL better-sqlite3 database (see native-fakes.ts) rather than a hand-rolled stub.
vi.mock('./native-module', () => ({ expoSQLite: FAKE_EXPO_SQLITE }));

// import-database-from-asset.ts pulls in the real @symbiote-native/asset, whose Asset.ts imports
// RN's Flow-typed resolveAssetSource — same fake every core test importing it uses (see
// packages/font/src/core/font-loader.test.ts).
const assetFromModule = vi.fn(() => ({
  downloadAsync: async () => ({ localUri: 'file:///cache/bundled.db' }),
}));
vi.mock('@symbiote-native/asset', () => ({
  Asset: { fromModule: assetFromModule },
}));

vi.mock('expo-modules-core', () => ({
  Platform: { OS: 'ios' },
}));

const {
  openDatabaseAsync,
  openDatabaseSync,
  deleteDatabaseAsync,
  deserializeDatabaseAsync,
} = await import('./sqlite-database');

afterEach(() => {
  vi.clearAllMocks();
});

describe('open / close / exec', () => {
  // why: every scenario in this file opens its own unique db name — see native-fakes.ts's header
  // on why closing a shared-cache in-memory handle does not free the name for reuse within the
  // same process, unlike a real SQLite file.
  it('opens a database, execs DDL, and closes it', async () => {
    const db = await openDatabaseAsync(`open-close-exec-${Math.random()}.db`);
    await db.execAsync('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    await db.execAsync("INSERT INTO t (name) VALUES ('a'), ('b')");
    const row = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM t',
    );
    expect(row?.count).toBe(2);
    await db.closeAsync();
  });

  it('opens a database synchronously, execs DDL, and closes it', () => {
    const db = openDatabaseSync(`open-close-exec-sync-${Math.random()}.db`);
    db.execSync('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    db.execSync("INSERT INTO t (name) VALUES ('a')");
    const row = db.getFirstSync<{ count: number }>(
      'SELECT COUNT(*) as count FROM t',
    );
    expect(row?.count).toBe(1);
    db.closeSync();
  });

  // why: a wrong `enableChangeListener`/serialize wiring would still pass every other test here —
  // this pins that a real close() call actually reaches the underlying handle, not a no-op.
  it('closing rejects further queries against the same handle', async () => {
    const db = await openDatabaseAsync(`closed-handle-${Math.random()}.db`);
    await db.execAsync('CREATE TABLE t (id INTEGER PRIMARY KEY)');
    await db.closeAsync();
    await expect(
      db.execAsync('CREATE TABLE u (id INTEGER PRIMARY KEY)'),
    ).rejects.toThrow();
  });
});

describe('prepared statement — run / step / getAll', () => {
  async function seededDb() {
    const db = await openDatabaseAsync(`statements-${Math.random()}.db`);
    await db.execAsync(
      'CREATE TABLE items (id INTEGER PRIMARY KEY, label TEXT, qty INTEGER)',
    );
    await db.runAsync('INSERT INTO items (label, qty) VALUES (?, ?)', ['a', 1]);
    await db.runAsync('INSERT INTO items (label, qty) VALUES (?, ?)', ['b', 2]);
    await db.runAsync('INSERT INTO items (label, qty) VALUES (?, ?)', ['c', 3]);
    return db;
  }

  it('runs an INSERT and reports lastInsertRowId/changes', async () => {
    const db = await seededDb();
    const result = await db.runAsync(
      'INSERT INTO items (label, qty) VALUES (?, ?)',
      ['d', 4],
    );
    expect(result.changes).toBe(1);
    expect(result.lastInsertRowId).toBe(4);
  });

  it('steps through a SELECT one row at a time (async)', async () => {
    const db = await seededDb();
    const statement = await db.prepareAsync(
      'SELECT label FROM items ORDER BY id',
    );
    try {
      const result = await statement.executeAsync<{ label: string }>();
      const labels: string[] = [];
      // why: exercises SQLiteExecuteAsyncResult's own async-iterator contract, not just getAllAsync.
      for await (const row of result) {
        labels.push(row.label);
      }
      expect(labels).toEqual(['a', 'b', 'c']);
    } finally {
      await statement.finalizeAsync();
    }
  });

  it('steps through a SELECT one row at a time (sync)', () => {
    const db = openDatabaseSync(`statements-sync-${Math.random()}.db`);
    db.execSync('CREATE TABLE items (id INTEGER PRIMARY KEY, label TEXT)');
    db.runSync('INSERT INTO items (label) VALUES (?)', ['x']);
    db.runSync('INSERT INTO items (label) VALUES (?)', ['y']);
    const statement = db.prepareSync('SELECT label FROM items ORDER BY id');
    try {
      const result = statement.executeSync<{ label: string }>();
      const labels: string[] = [];
      for (const row of result) {
        labels.push(row.label);
      }
      expect(labels).toEqual(['x', 'y']);
    } finally {
      statement.finalizeSync();
    }
  });

  it('getAllAsync returns every row', async () => {
    const db = await seededDb();
    const rows = await db.getAllAsync<{ label: string; qty: number }>(
      'SELECT label, qty FROM items ORDER BY id',
    );
    expect(rows).toEqual([
      { label: 'a', qty: 1 },
      { label: 'b', qty: 2 },
      { label: 'c', qty: 3 },
    ]);
  });

  it('getAllSync returns every row', async () => {
    const db = await seededDb();
    const rows = db.getAllSync<{ label: string }>(
      'SELECT label FROM items ORDER BY id',
    );
    expect(rows.map(r => r.label)).toEqual(['a', 'b', 'c']);
  });

  // why: pins the sql tagged-template's underlying shorthand (getFirstAsync) reads the
  // FIRST row from `run()` rather than issuing a second query.
  it('getFirstAsync returns null when nothing matches', async () => {
    const db = await seededDb();
    const row = await db.getFirstAsync('SELECT * FROM items WHERE label = ?', [
      'zzz',
    ]);
    expect(row).toBeNull();
  });
});

describe('transactions', () => {
  it('withTransactionAsync commits on success', async () => {
    const db = await openDatabaseAsync(`txn-commit-${Math.random()}.db`);
    await db.execAsync('CREATE TABLE t (id INTEGER PRIMARY KEY, value TEXT)');
    await db.withTransactionAsync(async () => {
      await db.runAsync('INSERT INTO t (value) VALUES (?)', ['kept']);
    });
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM t',
    );
    expect(row?.value).toBe('kept');
  });

  // why: this is the negative half of the commit test above — a thrown task must leave NO row
  // behind, proving ROLLBACK actually ran rather than the transaction silently no-op'ing.
  it('withTransactionAsync rolls back when the task throws, and re-throws', async () => {
    const db = await openDatabaseAsync(`txn-rollback-${Math.random()}.db`);
    await db.execAsync('CREATE TABLE t (id INTEGER PRIMARY KEY, value TEXT)');
    await expect(
      db.withTransactionAsync(async () => {
        await db.runAsync('INSERT INTO t (value) VALUES (?)', ['discarded']);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const rows = await db.getAllAsync('SELECT * FROM t');
    expect(rows).toHaveLength(0);
  });

  it('withTransactionSync commits on success', () => {
    const db = openDatabaseSync(`txn-commit-sync-${Math.random()}.db`);
    db.execSync('CREATE TABLE t (id INTEGER PRIMARY KEY, value TEXT)');
    db.withTransactionSync(() => {
      db.runSync('INSERT INTO t (value) VALUES (?)', ['kept']);
    });
    const row = db.getFirstSync<{ value: string }>('SELECT value FROM t');
    expect(row?.value).toBe('kept');
  });

  it('withTransactionSync rolls back when the task throws, and re-throws', () => {
    const db = openDatabaseSync(`txn-rollback-sync-${Math.random()}.db`);
    db.execSync('CREATE TABLE t (id INTEGER PRIMARY KEY, value TEXT)');
    expect(() =>
      db.withTransactionSync(() => {
        db.runSync('INSERT INTO t (value) VALUES (?)', ['discarded']);
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(db.getAllSync('SELECT * FROM t')).toHaveLength(0);
  });

  it('withExclusiveTransactionAsync commits on a separate connection', async () => {
    const db = await openDatabaseAsync(`txn-exclusive-${Math.random()}.db`);
    await db.execAsync('CREATE TABLE t (id INTEGER PRIMARY KEY, value TEXT)');
    await db.withExclusiveTransactionAsync(async txn => {
      await txn.runAsync('INSERT INTO t (value) VALUES (?)', ['kept']);
    });
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM t',
    );
    expect(row?.value).toBe('kept');
  });

  // `Platform.OS === 'web'` guard is upstream parity kept for a platform this project never
  // targets (iOS/Android only, root CLAUDE.md) — not exercised here.
});

describe('onInit', () => {
  it('openDatabaseAsync fires onInit exactly once with a working db handle before resolving', async () => {
    const onInit = vi.fn(async db => {
      await db.execAsync('CREATE TABLE seeded (id INTEGER PRIMARY KEY)');
      await db.runAsync('INSERT INTO seeded DEFAULT VALUES');
    });
    const db = await openDatabaseAsync(`on-init-${Math.random()}.db`, {
      onInit,
    });
    expect(onInit).toHaveBeenCalledTimes(1);
    expect(onInit).toHaveBeenCalledWith(db);
    // why: proves onInit ran BEFORE openDatabaseAsync resolved, not merely that it ran at all —
    // the migration it performs must already be visible on the handle the caller received.
    const row = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM seeded',
    );
    expect(row?.count).toBe(1);
  });

  it('openDatabaseSync fires onInit exactly once, synchronously, before returning', () => {
    const onInit = vi.fn(db => {
      db.execSync('CREATE TABLE seeded (id INTEGER PRIMARY KEY)');
      db.runSync('INSERT INTO seeded DEFAULT VALUES');
    });
    const db = openDatabaseSync(`on-init-sync-${Math.random()}.db`, { onInit });
    expect(onInit).toHaveBeenCalledTimes(1);
    const row = db.getFirstSync<{ count: number }>(
      'SELECT COUNT(*) as count FROM seeded',
    );
    expect(row?.count).toBe(1);
  });

  it('openDatabaseSync rejects an async onInit rather than silently racing it', () => {
    expect(() =>
      openDatabaseSync(`on-init-async-misuse-${Math.random()}.db`, {
        onInit: async () => {},
      }),
    ).toThrow(/onInit returned a Promise/);
  });

  it('a database opened with no onInit behaves exactly as before this option existed', async () => {
    const db = await openDatabaseAsync(`no-on-init-${Math.random()}.db`);
    await db.execAsync('CREATE TABLE t (id INTEGER PRIMARY KEY)');
    await expect(db.getAllAsync('SELECT * FROM t')).resolves.toEqual([]);
  });
});

describe('assetSource', () => {
  it('openDatabaseAsync imports the asset before opening, then opens normally', async () => {
    const dbName = `asset-source-${Math.random()}.db`;
    const db = await openDatabaseAsync(dbName, { assetSource: { assetId: 7 } });

    expect(assetFromModule).toHaveBeenCalledWith(7);
    expect(FAKE_EXPO_SQLITE.importAssetDatabaseAsync).toHaveBeenCalledWith(
      expect.stringContaining(dbName),
      'file:///cache/bundled.db',
      false,
    );
    await db.execAsync('CREATE TABLE t (id INTEGER PRIMARY KEY)');
    await expect(db.getAllAsync('SELECT * FROM t')).resolves.toEqual([]);
  });

  it('openDatabaseSync rejects assetSource rather than silently ignoring it', () => {
    expect(() =>
      openDatabaseSync(`asset-source-sync-${Math.random()}.db`, {
        assetSource: { assetId: 7 },
      }),
    ).toThrow(/openDatabaseAsync instead/);
    expect(assetFromModule).not.toHaveBeenCalled();
  });
});

describe('deleteDatabaseAsync', () => {
  it('delegates the resolved path to the native module', async () => {
    await deleteDatabaseAsync('some.db');
    expect(FAKE_EXPO_SQLITE.deleteDatabaseAsync).toHaveBeenCalledWith(
      expect.stringContaining('some.db'),
    );
  });
});

// Cases below are ported from expo-sqlite's SQLiteDatabase-test.ios.ts (.vendors/expo @
// origin/sdk-57) — coverage not already exercised above. The two upstream cases that provoke a
// real SQLite file-lock race with 100-300ms `setTimeout` delays
// (`withTransactionAsync could possibly have other async queries interrupted...`,
// `withExclusiveTransactionAsync should execute a transaction atomically and abort other write
// query`) are out of scope: they pin real SQLite locking semantics, not this port's own logic,
// and would make this suite slow and timing-flaky for no coverage of code we wrote.
describe('execAsync error propagation', () => {
  it('rejects with the underlying syntax error', async () => {
    const db = await openDatabaseAsync(`exec-invalid-${Math.random()}.db`);
    await expect(db.execAsync('INVALID COMMAND')).rejects.toThrow(
      /syntax error/,
    );
  });
});

describe('getFirstAsync / getFirstSync positive match', () => {
  it('getFirstAsync returns the matching row', async () => {
    const db = await openDatabaseAsync(`get-first-${Math.random()}.db`);
    await db.execAsync(
      'CREATE TABLE test (id INTEGER PRIMARY KEY NOT NULL, value TEXT NOT NULL, intValue INTEGER)',
    );
    await db.runAsync(
      'INSERT INTO test (value, intValue) VALUES (?, ?)',
      'test',
      123,
    );
    const result = await db.getFirstAsync<{ value: string; intValue: number }>(
      'SELECT * FROM test',
    );
    expect(result?.value).toBe('test');
    expect(result?.intValue).toBe(123);
  });
});

describe('getEachAsync / getEachSync', () => {
  async function seededDb() {
    const db = await openDatabaseAsync(`get-each-${Math.random()}.db`);
    await db.execAsync(`
      CREATE TABLE test (id INTEGER PRIMARY KEY NOT NULL, value TEXT NOT NULL, intValue INTEGER);
      INSERT INTO test (value, intValue) VALUES ('test1', 123);
      INSERT INTO test (value, intValue) VALUES ('test2', 456);
      INSERT INTO test (value, intValue) VALUES ('test3', 789);
    `);
    return db;
  }

  it('async-iterates every row via db.getEachAsync, without going through prepareAsync directly', async () => {
    const db = await seededDb();
    const results: { intValue: number }[] = [];
    for await (const row of db.getEachAsync<{ intValue: number }>(
      'SELECT * FROM test ORDER BY intValue DESC',
    )) {
      results.push(row);
    }
    expect(results.map(r => r.intValue)).toEqual([789, 456, 123]);
  });

  it('finalizes the prepared statement when the async iterator returns early', async () => {
    const db = await seededDb();
    const finalizeSpy = vi.spyOn(
      FakeNativeStatement.prototype,
      'finalizeAsync',
    );
    for await (const _row of db.getEachAsync<{ intValue: number }>(
      'SELECT * FROM test ORDER BY intValue DESC',
    )) {
      break;
    }
    expect(finalizeSpy).toHaveBeenCalled();
  });

  it('iterates every row via db.getEachSync', () => {
    const db = openDatabaseSync(`get-each-sync-${Math.random()}.db`);
    db.execSync(`
      CREATE TABLE test (id INTEGER PRIMARY KEY NOT NULL, value TEXT NOT NULL, intValue INTEGER);
      INSERT INTO test (value, intValue) VALUES ('test1', 123);
      INSERT INTO test (value, intValue) VALUES ('test2', 456);
      INSERT INTO test (value, intValue) VALUES ('test3', 789);
    `);
    const results: number[] = [];
    for (const row of db.getEachSync<{ intValue: number }>(
      'SELECT * FROM test ORDER BY intValue DESC',
    )) {
      results.push(row.intValue);
    }
    expect(results).toEqual([789, 456, 123]);
  });

  it('finalizes the prepared statement when the sync iterator returns early', () => {
    const db = openDatabaseSync(`get-each-sync-early-${Math.random()}.db`);
    db.execSync(`
      CREATE TABLE test (id INTEGER PRIMARY KEY NOT NULL, value TEXT NOT NULL, intValue INTEGER);
      INSERT INTO test (value, intValue) VALUES ('test1', 123);
      INSERT INTO test (value, intValue) VALUES ('test2', 456);
    `);
    const finalizeSpy = vi.spyOn(FakeNativeStatement.prototype, 'finalizeSync');
    for (const _row of db.getEachSync<{ intValue: number }>(
      'SELECT * FROM test ORDER BY intValue DESC',
    )) {
      break;
    }
    expect(finalizeSpy).toHaveBeenCalled();
  });
});

describe('serialize / deserialize', () => {
  it('round-trips data through serializeAsync + deserializeDatabaseAsync', async () => {
    const db = await openDatabaseAsync(':memory:');
    await db.execAsync(
      'CREATE TABLE test (id INTEGER PRIMARY KEY NOT NULL, value TEXT NOT NULL, intValue INTEGER)',
    );
    await db.runAsync(
      'INSERT INTO test (value, intValue) VALUES (?, ?)',
      'test',
      123,
    );

    const serialized = await db.serializeAsync();
    await db.closeAsync();

    const db2 = await deserializeDatabaseAsync(serialized);
    const result = await db2.getFirstAsync<{ value: string; intValue: number }>(
      'SELECT * FROM test',
    );
    expect(result?.value).toBe('test');
    expect(result?.intValue).toBe(123);
    await db2.closeAsync();
  });
});
