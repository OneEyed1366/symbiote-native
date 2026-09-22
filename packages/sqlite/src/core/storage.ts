// Ported from expo-sqlite's Storage.ts (.vendors/expo @ origin/sdk-57,
// packages/expo-sqlite/src/Storage.ts), renamed with this repo's `I`-prefix convention.
//
// Published on its own subpath (`@symbiote-native/sqlite/kv-store`) rather than the package
// root — see the README for why.
import AwaitLock from 'await-lock';

import { openDatabaseAsync, openDatabaseSync } from './sqlite-database';
import type { SQLiteDatabase } from './sqlite-database';
import { normalizeStorageIndex } from './param-utils';

/**
 * Update function for `setItemAsync()`/`setItemSync()`. Computes the new value from the
 * previous one (`null` when the key was unset) and returns the value to store.
 */
export type ISQLiteStorageSetItemUpdateFunction = (
  prevValue: string | null,
) => string;

const DATABASE_VERSION = 1;
const STATEMENT_GET = 'SELECT value FROM storage WHERE key = ?;';
const STATEMENT_SET =
  'INSERT INTO storage (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;';
const STATEMENT_REMOVE = 'DELETE FROM storage WHERE key = ?;';
const STATEMENT_GET_ALL_KEYS = 'SELECT key FROM storage;';
const STATEMENT_CLEAR = 'DELETE FROM storage;';
const STATEMENT_LENGTH = 'SELECT COUNT(*) as count FROM storage;';
const STATEMENT_GET_KEY_BY_INDEX = 'SELECT key FROM storage LIMIT 1 OFFSET ?;';

const MIGRATION_STATEMENT_0 =
  'CREATE TABLE IF NOT EXISTS storage (key TEXT PRIMARY KEY NOT NULL, value TEXT);';

/**
 * A key-value store backed by SQLite. The constructor's `databaseName` is the database file
 * name used for storage.
 */
export class SQLiteStorage {
  private db: SQLiteDatabase | null = null;
  private readonly awaitLock = new AwaitLock();

  constructor(private readonly databaseName: string) {}

  //#region Asynchronous API

  /** Retrieves the value for the given key. */
  async getItemAsync(key: string): Promise<string | null> {
    this.checkValidInput(key);
    const db = await this.getDbAsync();
    const result = await db.getFirstAsync<{ value: string }>(
      STATEMENT_GET,
      key,
    );
    return result?.value ?? null;
  }

  /**
   * Sets the value for the given key. A function computes the new value from the previous one.
   */
  async setItemAsync(
    key: string,
    value: string | ISQLiteStorageSetItemUpdateFunction,
  ): Promise<void> {
    this.checkValidInput(key, value);
    const db = await this.getDbAsync();

    if (typeof value === 'function') {
      await db.withExclusiveTransactionAsync(async tx => {
        const prevResult = await tx.getFirstAsync<{ value: string }>(
          STATEMENT_GET,
          key,
        );
        const prevValue = prevResult?.value ?? null;
        const nextValue = value(prevValue);
        this.checkValidInput(key, nextValue);
        await tx.runAsync(STATEMENT_SET, key, nextValue);
      });
      return;
    }

    await db.runAsync(STATEMENT_SET, key, value);
  }

  /** Removes the value for the given key. Returns whether a row was actually removed. */
  async removeItemAsync(key: string): Promise<boolean> {
    this.checkValidInput(key);
    const db = await this.getDbAsync();
    const result = await db.runAsync(STATEMENT_REMOVE, key);
    return result.changes > 0;
  }

  /** Retrieves every key stored. */
  async getAllKeysAsync(): Promise<string[]> {
    const db = await this.getDbAsync();
    const result = await db.getAllAsync<{ key: string }>(
      STATEMENT_GET_ALL_KEYS,
    );
    return result.map(({ key }) => key);
  }

  /** Clears every key-value pair. Returns whether anything was actually cleared. */
  async clearAsync(): Promise<boolean> {
    const db = await this.getDbAsync();
    const result = await db.runAsync(STATEMENT_CLEAR);
    return result.changes > 0;
  }

  /** Closes the database connection. */
  async closeAsync(): Promise<void> {
    await this.awaitLock.acquireAsync();
    try {
      if (this.db) {
        await this.db.closeAsync();
        this.db = null;
      }
    } finally {
      this.awaitLock.release();
    }
  }

  /** Retrieves the number of key-value pairs stored. */
  async getLengthAsync(): Promise<number> {
    const db = await this.getDbAsync();
    const result = await db.getFirstAsync<{ count: number }>(STATEMENT_LENGTH);
    return result?.count ?? 0;
  }

  /** Retrieves the key at the given index. */
  async getKeyByIndexAsync(index: number): Promise<string | null> {
    const db = await this.getDbAsync();
    const offset = normalizeStorageIndex(index);
    if (offset == null) {
      return null;
    }
    const result = await db.getFirstAsync<{ key: string }>(
      STATEMENT_GET_KEY_BY_INDEX,
      offset,
    );
    return result?.key ?? null;
  }

  //#endregion

  //#region Synchronous API

  /**
   * Retrieves the value for the given key.
   * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
   */
  getItemSync(key: string): string | null {
    this.checkValidInput(key);
    const db = this.getDbSync();
    const result = db.getFirstSync<{ value: string }>(STATEMENT_GET, key);
    return result?.value ?? null;
  }

  /**
   * Sets the value for the given key. A function computes the new value from the previous one.
   * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
   */
  setItemSync(
    key: string,
    value: string | ISQLiteStorageSetItemUpdateFunction,
  ): void {
    this.checkValidInput(key, value);
    const db = this.getDbSync();

    if (typeof value === 'function') {
      db.withTransactionSync(() => {
        const prevResult = db.getFirstSync<{ value: string }>(
          STATEMENT_GET,
          key,
        );
        const prevValue = prevResult?.value ?? null;
        const nextValue = value(prevValue);
        this.checkValidInput(key, nextValue);
        db.runSync(STATEMENT_SET, key, nextValue);
      });
      return;
    }

    db.runSync(STATEMENT_SET, key, value);
  }

  /**
   * Removes the value for the given key. Returns whether a row was actually removed.
   * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
   */
  removeItemSync(key: string): boolean {
    this.checkValidInput(key);
    const db = this.getDbSync();
    const result = db.runSync(STATEMENT_REMOVE, key);
    return result.changes > 0;
  }

  /**
   * Retrieves every key stored.
   * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
   */
  getAllKeysSync(): string[] {
    const db = this.getDbSync();
    const result = db.getAllSync<{ key: string }>(STATEMENT_GET_ALL_KEYS);
    return result.map(({ key }) => key);
  }

  /**
   * Clears every key-value pair. Returns whether anything was actually cleared.
   * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
   */
  clearSync(): boolean {
    const db = this.getDbSync();
    const result = db.runSync(STATEMENT_CLEAR);
    return result.changes > 0;
  }

  /**
   * Closes the database connection.
   * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
   */
  closeSync(): void {
    if (this.db) {
      this.db.closeSync();
      this.db = null;
    }
  }

  /**
   * Retrieves the number of key-value pairs stored.
   * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
   */
  getLengthSync(): number {
    const db = this.getDbSync();
    const result = db.getFirstSync<{ count: number }>(STATEMENT_LENGTH);
    return result?.count ?? 0;
  }

  /**
   * Retrieves the key at the given index.
   * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
   */
  getKeyByIndexSync(index: number): string | null {
    const db = this.getDbSync();
    const offset = normalizeStorageIndex(index);
    if (offset == null) {
      return null;
    }
    const result = db.getFirstSync<{ key: string }>(
      STATEMENT_GET_KEY_BY_INDEX,
      offset,
    );
    return result?.key ?? null;
  }

  //#endregion

  //#region react-native-async-storage compatible API

  /** Alias for `getItemAsync()`. */
  async getItem(key: string): Promise<string | null> {
    return this.getItemAsync(key);
  }

  /** Alias for `setItemAsync()`. */
  async setItem(
    key: string,
    value: string | ISQLiteStorageSetItemUpdateFunction,
  ): Promise<void> {
    await this.setItemAsync(key, value);
  }

  /** Alias for `removeItemAsync()`. */
  async removeItem(key: string): Promise<void> {
    await this.removeItemAsync(key);
  }

  /** Alias for `getAllKeysAsync()`. */
  async getAllKeys(): Promise<string[]> {
    return this.getAllKeysAsync();
  }

  /** Alias for `clearAsync()`. */
  async clear(): Promise<void> {
    await this.clearAsync();
  }

  /** Merges the given value with the existing value for the key — a deep merge for JSON. */
  async mergeItem(key: string, value: string): Promise<void> {
    this.checkValidInput(key, value);
    await this.setItemAsync(key, prevValue => {
      if (prevValue == null) {
        return value;
      }
      const prevJSON: unknown = JSON.parse(prevValue);
      const newJSON: unknown = JSON.parse(value);
      const mergedJSON = mergeDeep(prevJSON, newJSON);
      return JSON.stringify(mergedJSON);
    });
  }

  /** Retrieves the values for the given keys. */
  async multiGet(keys: string[]): Promise<[string, string | null][]> {
    return Promise.all(
      keys.map(async (key): Promise<[string, string | null]> => {
        this.checkValidInput(key);
        return [key, await this.getItemAsync(key)];
      }),
    );
  }

  /** Sets multiple key-value pairs. */
  async multiSet(keyValuePairs: [string, string][]): Promise<void> {
    const db = await this.getDbAsync();
    await db.withExclusiveTransactionAsync(async tx => {
      for (const [key, value] of keyValuePairs) {
        this.checkValidInput(key, value);
        await tx.runAsync(STATEMENT_SET, key, value);
      }
    });
  }

  /** Removes the values for the given keys. */
  async multiRemove(keys: string[]): Promise<void> {
    const db = await this.getDbAsync();
    await db.withExclusiveTransactionAsync(async tx => {
      for (const key of keys) {
        this.checkValidInput(key);
        await tx.runAsync(STATEMENT_REMOVE, key);
      }
    });
  }

  /** Merges multiple key-value pairs — a deep merge for JSON existing values. */
  async multiMerge(keyValuePairs: [string, string][]): Promise<void> {
    const db = await this.getDbAsync();
    await db.withExclusiveTransactionAsync(async tx => {
      for (const [key, value] of keyValuePairs) {
        this.checkValidInput(key, value);
        const prevValue = await tx.getFirstAsync<{ value: string }>(
          STATEMENT_GET,
          key,
        );
        if (prevValue == null) {
          await tx.runAsync(STATEMENT_SET, key, value);
          continue;
        }
        const prevJSON: unknown = JSON.parse(prevValue.value);
        const newJSON: unknown = JSON.parse(value);
        const mergedJSON = mergeDeep(prevJSON, newJSON);
        await tx.runAsync(STATEMENT_SET, key, JSON.stringify(mergedJSON));
      }
    });
  }

  /** Alias for `closeAsync()`. */
  async close(): Promise<void> {
    await this.closeAsync();
  }

  //#endregion

  //#region Internals

  private async getDbAsync(): Promise<SQLiteDatabase> {
    await this.awaitLock.acquireAsync();
    try {
      if (!this.db) {
        const db = await openDatabaseAsync(this.databaseName);
        await this.maybeMigrateDbAsync(db);
        this.db = db;
      }
    } finally {
      this.awaitLock.release();
    }
    return this.db;
  }

  private getDbSync(): SQLiteDatabase {
    // Unlike getDbAsync(), this cannot take `awaitLock` — it is promise-based and this method is
    // synchronous. The migration is idempotent instead, so the next open repairs a database a
    // race left without a `storage` table.
    if (!this.db) {
      const db = openDatabaseSync(this.databaseName);
      this.maybeMigrateDbSync(db);
      this.db = db;
    }
    return this.db;
  }

  private maybeMigrateDbAsync(db: SQLiteDatabase): Promise<void> {
    return db.withTransactionAsync(async () => {
      const result = await db.getFirstAsync<{ user_version: number }>(
        'PRAGMA user_version',
      );
      const currentDbVersion = result?.user_version ?? 0;

      // Baseline schema, deliberately outside the version ladder below — `CREATE TABLE IF NOT
      // EXISTS` is a no-op on a healthy database and also repairs one a raced first-run
      // migration left at `user_version >= 1` with no `storage` table. A new column has to be
      // added here too, so fresh and repaired databases both get it.
      await db.execAsync(MIGRATION_STATEMENT_0);

      // Version ladder: add each new migration below, gated on `currentDbVersion`. Since the
      // baseline above already carries every column, a ladder entry adding one has to tolerate
      // it already being there — gate it on `PRAGMA table_info(storage)`, or a fresh database
      // fails the migration with `duplicate column name`.
      if (currentDbVersion >= DATABASE_VERSION) {
        return;
      }
      await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
    });
  }

  private maybeMigrateDbSync(db: SQLiteDatabase): void {
    db.withTransactionSync(() => {
      const result = db.getFirstSync<{ user_version: number }>(
        'PRAGMA user_version',
      );
      const currentDbVersion = result?.user_version ?? 0;

      // Keep in sync with maybeMigrateDbAsync(), which documents the two steps below.
      db.execSync(MIGRATION_STATEMENT_0);

      if (currentDbVersion >= DATABASE_VERSION) {
        return;
      }
      db.execSync(`PRAGMA user_version = ${DATABASE_VERSION}`);
    });
  }

  private checkValidInput(...input: unknown[]): void {
    const [key, value] = input;

    if (typeof key !== 'string') {
      throw new Error(
        `[SQLiteStorage] Using ${typeof key} type for key is not supported. Use string instead. Key passed: ${String(key)}`,
      );
    }

    if (
      input.length > 1 &&
      typeof value !== 'string' &&
      typeof value !== 'function'
    ) {
      throw new Error(
        `[SQLiteStorage] Using ${typeof value} type for value is not supported. Use string instead. Key passed: ${key}. Value passed : ${String(value)}`,
      );
    }
  }

  //#endregion
}

/** Recursively merges two JSON-decoded values, concatenating arrays and merging objects. */
function mergeDeep(target: unknown, source: unknown): unknown {
  if (typeof target !== 'object' || target === null || Array.isArray(target)) {
    return source;
  }
  if (typeof source !== 'object' || source === null || Array.isArray(source)) {
    return target;
  }

  // I/O edge: both are JSON.parse() output narrowed only to "non-null, non-array object" above —
  // JSON itself carries no further static shape to check against.
  const targetRecord = target as Record<string, unknown>;
  const sourceRecord = source as Record<string, unknown>;
  const output: Record<string, unknown> = { ...targetRecord };

  for (const key of Object.keys(sourceRecord)) {
    const sourceValue = sourceRecord[key];
    if (Array.isArray(sourceValue)) {
      const existing = output[key];
      output[key] = (Array.isArray(existing) ? existing : []).concat(
        sourceValue,
      );
    } else if (typeof sourceValue === 'object' && sourceValue !== null) {
      output[key] = mergeDeep(targetRecord[key], sourceValue);
    } else {
      output[key] = sourceValue;
    }
  }

  return output;
}

/**
 * A drop-in replacement for `AsyncStorage` from `@react-native-async-storage/async-storage`.
 */
export const AsyncStorage = new SQLiteStorage('ExpoSQLiteStorage');

export default AsyncStorage;

/** Alias for `AsyncStorage`, given the storage offers more than asynchronous methods. */
export const Storage = AsyncStorage;
