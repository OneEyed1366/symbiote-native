import { afterEach, describe, expect, it, vi } from 'vitest';

import { FAKE_EXPO_SQLITE, FakeNativeDatabase } from './native-fakes';

vi.mock('./native-module', () => ({ expoSQLite: FAKE_EXPO_SQLITE }));
vi.mock('@symbiote-native/asset', () => ({
  Asset: {
    fromModule: vi.fn(() => ({
      downloadAsync: async () => ({ localUri: null }),
    })),
  },
}));
vi.mock('expo-modules-core', () => ({ Platform: { OS: 'ios' } }));

const { SQLiteStorage } = await import('./storage');
const { openDatabaseSync } = await import('./sqlite-database');

afterEach(() => {
  vi.clearAllMocks();
});

function freshStorage() {
  return new SQLiteStorage(`kv-store-${Math.random()}`);
}

describe('get / set / delete round-trip', () => {
  it('setItemAsync then getItemAsync returns the stored value', async () => {
    const storage = freshStorage();
    await storage.setItemAsync('token', 'secret');
    await expect(storage.getItemAsync('token')).resolves.toBe('secret');
  });

  it('getItemAsync returns null for a key that was never set', async () => {
    const storage = freshStorage();
    await expect(storage.getItemAsync('missing')).resolves.toBeNull();
  });

  it('setItemAsync overwrites an existing value for the same key', async () => {
    const storage = freshStorage();
    await storage.setItemAsync('token', 'first');
    await storage.setItemAsync('token', 'second');
    await expect(storage.getItemAsync('token')).resolves.toBe('second');
  });

  it('removeItemAsync deletes the key and reports whether a row was removed', async () => {
    const storage = freshStorage();
    await storage.setItemAsync('token', 'secret');
    await expect(storage.removeItemAsync('token')).resolves.toBe(true);
    await expect(storage.getItemAsync('token')).resolves.toBeNull();
    await expect(storage.removeItemAsync('token')).resolves.toBe(false);
  });

  it('the same round-trip works through the synchronous API', () => {
    const storage = freshStorage();
    storage.setItemSync('token', 'secret');
    expect(storage.getItemSync('token')).toBe('secret');
    expect(storage.removeItemSync('token')).toBe(true);
    expect(storage.getItemSync('token')).toBeNull();
  });

  it('setItemAsync accepts an update function computed from the previous value', async () => {
    const storage = freshStorage();
    await storage.setItemAsync('counter', '1');
    await storage.setItemAsync('counter', prev => String(Number(prev) + 1));
    await expect(storage.getItemAsync('counter')).resolves.toBe('2');
  });

  it('getAllKeysAsync / clearAsync operate over every stored key', async () => {
    const storage = freshStorage();
    await storage.setItemAsync('a', '1');
    await storage.setItemAsync('b', '2');
    await expect(storage.getAllKeysAsync()).resolves.toEqual(
      expect.arrayContaining(['a', 'b']),
    );
    await expect(storage.clearAsync()).resolves.toBe(true);
    await expect(storage.getAllKeysAsync()).resolves.toEqual([]);
  });
});

describe('write serialization under await-lock', () => {
  // why: getDbAsync() opens the underlying native database lazily on first access, guarded by
  // `awaitLock` specifically so two concurrent first-time callers don't each open their own
  // handle — break-tested below by removing the lock and watching this go red.
  it('opens exactly one native database under concurrent first access', async () => {
    const before = FakeNativeDatabase.instanceCount;
    const storage = freshStorage();
    await Promise.all([
      storage.getItemAsync('a'),
      storage.getItemAsync('b'),
      storage.setItemAsync('c', '1'),
    ]);
    expect(FakeNativeDatabase.instanceCount - before).toBe(1);
  });

  it("a functional setItemAsync update reads its own transaction's value, not a stale one", async () => {
    const storage = freshStorage();
    await storage.setItemAsync('counter', '0');
    // Sequential on purpose: withExclusiveTransactionAsync serializes writers at the SQLite
    // level (a real "database is locked" contention, not this package's own concern to test),
    // so this proves the read-modify-write function itself is correct rather than re-testing
    // SQLite's own locking.
    for (let i = 0; i < 5; i++) {
      await storage.setItemAsync('counter', prev => String(Number(prev) + 1));
    }
    await expect(storage.getItemAsync('counter')).resolves.toBe('5');
  });
});

describe('react-native-async-storage compatible API', () => {
  it('getItem/setItem/removeItem alias the *Async methods', async () => {
    const storage = freshStorage();
    await storage.setItem('token', 'secret');
    await expect(storage.getItem('token')).resolves.toBe('secret');
    await storage.removeItem('token');
    await expect(storage.getItem('token')).resolves.toBeNull();
  });

  it('mergeItem deep-merges JSON values', async () => {
    const storage = freshStorage();
    await storage.setItem(
      'profile',
      JSON.stringify({ name: 'Alice', tags: ['a'] }),
    );
    await storage.mergeItem(
      'profile',
      JSON.stringify({ age: 30, tags: ['b'] }),
    );
    const stored = await storage.getItem('profile');
    expect(stored ? JSON.parse(stored) : null).toEqual({
      name: 'Alice',
      age: 30,
      tags: ['a', 'b'],
    });
  });

  it('multiGet/multiSet/multiRemove operate over several keys at once', async () => {
    const storage = freshStorage();
    await storage.multiSet([
      ['a', '1'],
      ['b', '2'],
    ]);
    await expect(storage.multiGet(['a', 'b', 'c'])).resolves.toEqual([
      ['a', '1'],
      ['b', '2'],
      ['c', null],
    ]);
    await storage.multiRemove(['a']);
    await expect(storage.getItem('a')).resolves.toBeNull();
  });
});

describe('input validation', () => {
  it('rejects a non-string key before touching the database', async () => {
    const storage = freshStorage();
    // @ts-expect-error -- the guard exists precisely for callers without type checking
    await expect(storage.getItemAsync(42)).rejects.toThrow(
      /type for key is not supported/,
    );
  });

  it('rejects a non-string, non-function value before touching the database', async () => {
    const storage = freshStorage();
    // @ts-expect-error -- the guard exists precisely for callers without type checking
    await expect(storage.setItemAsync('k', 42)).rejects.toThrow(
      /type for value is not supported/,
    );
  });
});

// Cases below are ported from expo-sqlite's Storage-test.ios.ts (.vendors/expo @ origin/sdk-57)
// — coverage not already exercised above. WebStorage cases are out of scope (web-only).
describe('getLengthAsync / getLengthSync', () => {
  it('counts the stored keys', async () => {
    const storage = freshStorage();
    await storage.setItemAsync('key1', 'value1');
    await storage.setItemAsync('key2', 'value2');
    await expect(storage.getLengthAsync()).resolves.toBe(2);
  });

  it('counts the stored keys synchronously', () => {
    const storage = freshStorage();
    storage.setItemSync('key1', 'value1');
    storage.setItemSync('key2', 'value2');
    expect(storage.getLengthSync()).toBe(2);
  });
});

describe('getKeyByIndexAsync / getKeyByIndexSync', () => {
  // why: normalizeStorageIndex (param-utils.ts) coerces the index defensively — these pin that
  // coercion through the public Storage API, not just the helper in isolation.
  it('normalizes every shape of index the same way, asynchronously', async () => {
    const storage = freshStorage();
    await storage.setItemAsync('key', 'value');
    await storage.setItemAsync('key2', 'value2');

    await expect(storage.getKeyByIndexAsync(0)).resolves.toBe('key');
    await expect(storage.getKeyByIndexAsync(-1)).resolves.toBeNull();
    await expect(storage.getKeyByIndexAsync(0.5)).resolves.toBe('key');
    // @ts-expect-error -- the coercion is a defensive fallback for a caller without type checking
    await expect(storage.getKeyByIndexAsync(true)).resolves.toBe('key2');
    // @ts-expect-error -- same defensive coercion, boolean false
    await expect(storage.getKeyByIndexAsync(false)).resolves.toBe('key');
    // @ts-expect-error -- same defensive coercion, an object coerced via valueOf
    await expect(
      storage.getKeyByIndexAsync({ valueOf: () => 1 }),
    ).resolves.toBe('key2');

    await expect(
      storage.getKeyByIndexAsync(Number.MAX_SAFE_INTEGER),
    ).resolves.toBeNull();
    await expect(
      storage.getKeyByIndexAsync(Number.MAX_SAFE_INTEGER + 1),
    ).resolves.toBe('key');
    await expect(storage.getKeyByIndexAsync(Number.MAX_VALUE)).resolves.toBe(
      'key',
    );
    await expect(storage.getKeyByIndexAsync(NaN)).resolves.toBe('key');
    await expect(storage.getKeyByIndexAsync(Infinity)).resolves.toBe('key');
    await expect(storage.getKeyByIndexAsync(-Infinity)).resolves.toBe('key');
  });

  it('normalizes every shape of index the same way, synchronously', () => {
    const storage = freshStorage();
    storage.setItemSync('key', 'value');
    storage.setItemSync('key2', 'value2');

    expect(storage.getKeyByIndexSync(0)).toBe('key');
    expect(storage.getKeyByIndexSync(-1)).toBeNull();
    expect(storage.getKeyByIndexSync(0.5)).toBe('key');
    // @ts-expect-error -- the coercion is a defensive fallback for a caller without type checking
    expect(storage.getKeyByIndexSync(true)).toBe('key2');
    // @ts-expect-error -- same defensive coercion, boolean false
    expect(storage.getKeyByIndexSync(false)).toBe('key');
    // @ts-expect-error -- same defensive coercion, an object coerced via valueOf
    expect(storage.getKeyByIndexSync({ valueOf: () => 1 })).toBe('key2');

    expect(storage.getKeyByIndexSync(Number.MAX_SAFE_INTEGER)).toBeNull();
    expect(storage.getKeyByIndexSync(Number.MAX_SAFE_INTEGER + 1)).toBe('key');
    expect(storage.getKeyByIndexSync(Number.MAX_VALUE)).toBe('key');
    expect(storage.getKeyByIndexSync(NaN)).toBe('key');
    expect(storage.getKeyByIndexSync(Infinity)).toBe('key');
    expect(storage.getKeyByIndexSync(-Infinity)).toBe('key');
  });
});

describe('multiMerge', () => {
  it('deep-merges JSON values for several keys at once', async () => {
    const storage = freshStorage();
    await storage.multiSet([
      ['key1', JSON.stringify({ a: 1, b: 2 })],
      ['key2', JSON.stringify({ x: 10, y: 20 })],
    ]);
    await storage.multiMerge([
      ['key1', JSON.stringify({ b: 3, c: 4 })],
      ['key2', JSON.stringify({ y: 30, z: 40 })],
    ]);
    const value1 = await storage.getItem('key1');
    const value2 = await storage.getItem('key2');
    expect(value1).toBe(JSON.stringify({ a: 1, b: 3, c: 4 }));
    expect(value2).toBe(JSON.stringify({ x: 10, y: 30, z: 40 }));
  });
});

describe('migration', () => {
  const FUTURE_DATABASE_VERSION = 99;

  // A unique db name per case sidesteps upstream's `fs.unlink` cleanup between tests — the fake
  // native module keys each name to its own scratch file (native-fakes.ts), so nothing here can
  // leak state into another test the way a shared fixed name would.
  function migrationDbName() {
    return `storage-migration-${Math.random()}`;
  }

  function readUserVersion(databaseName: string): number {
    const db = openDatabaseSync(databaseName);
    const result = db.getFirstSync<{ user_version: number }>(
      'PRAGMA user_version',
    );
    db.closeSync();
    return result?.user_version ?? 0;
  }

  function tableExists(databaseName: string): boolean {
    const db = openDatabaseSync(databaseName);
    const result = db.getFirstSync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'storage'",
    );
    db.closeSync();
    return result != null;
  }

  it('recreates the storage table when the db is at the current version but the table is missing (sync)', () => {
    const databaseName = migrationDbName();
    // Simulates https://github.com/expo/expo/issues/47448: a `user_version` already bumped to 1
    // with no `storage` table, as if a prior migration was interrupted mid-flight.
    const seed = openDatabaseSync(databaseName);
    seed.execSync('PRAGMA user_version = 1');
    seed.closeSync();
    expect(tableExists(databaseName)).toBe(false);

    const storage = new SQLiteStorage(databaseName);
    try {
      expect(storage.getItemSync('key1')).toBeNull();
      storage.setItemSync('key1', 'value1');
      expect(storage.getItemSync('key1')).toBe('value1');
    } finally {
      storage.closeSync();
    }
    expect(tableExists(databaseName)).toBe(true);
  });

  it('recreates the storage table when the db is at the current version but the table is missing (async)', async () => {
    const databaseName = migrationDbName();
    const seed = openDatabaseSync(databaseName);
    seed.execSync('PRAGMA user_version = 1');
    seed.closeSync();
    expect(tableExists(databaseName)).toBe(false);

    const storage = new SQLiteStorage(databaseName);
    try {
      await expect(storage.getItemAsync('key1')).resolves.toBeNull();
      await storage.setItemAsync('key1', 'value1');
      await expect(storage.getItemAsync('key1')).resolves.toBe('value1');
    } finally {
      await storage.closeAsync();
    }
    expect(tableExists(databaseName)).toBe(true);
  });

  it('migrates a fresh database and bumps the user version', () => {
    const databaseName = migrationDbName();
    const storage = new SQLiteStorage(databaseName);
    try {
      storage.setItemSync('key1', 'value1');
    } finally {
      storage.closeSync();
    }
    expect(tableExists(databaseName)).toBe(true);
    expect(readUserVersion(databaseName)).toBe(1);
  });

  it('leaves a database from a newer version untouched', () => {
    const databaseName = migrationDbName();
    const db = openDatabaseSync(databaseName);
    db.execSync(
      'CREATE TABLE IF NOT EXISTS storage (key TEXT PRIMARY KEY NOT NULL, value TEXT);',
    );
    db.execSync("INSERT INTO storage (key, value) VALUES ('key1', 'value1');");
    db.execSync(`PRAGMA user_version = ${FUTURE_DATABASE_VERSION}`);
    db.closeSync();

    const storage = new SQLiteStorage(databaseName);
    try {
      expect(storage.getItemSync('key1')).toBe('value1');
    } finally {
      storage.closeSync();
    }
    // The migration must never downgrade `user_version`, or the next launch would replay
    // migrations that have already run.
    expect(readUserVersion(databaseName)).toBe(FUTURE_DATABASE_VERSION);
  });

  it('keeps existing data when reopening an already migrated database', () => {
    const databaseName = migrationDbName();
    const storage = new SQLiteStorage(databaseName);
    storage.setItemSync('key1', 'value1');
    storage.setItemSync('key2', 'value2');
    storage.closeSync();

    const reopened = new SQLiteStorage(databaseName);
    try {
      expect(reopened.getItemSync('key1')).toBe('value1');
      expect(reopened.getItemSync('key2')).toBe('value2');
      expect(reopened.getLengthSync()).toBe(2);
    } finally {
      reopened.closeSync();
    }
    expect(readUserVersion(databaseName)).toBe(1);
  });
});
