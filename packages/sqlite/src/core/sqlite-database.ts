// Ported from expo-sqlite's SQLiteDatabase.ts (.vendors/expo @ origin/sdk-57,
// packages/expo-sqlite/src/SQLiteDatabase.ts), renamed with this repo's `I`-prefix convention.
//
// Not ported: `registerDatabaseForDevToolsAsync`/`unregisterDatabaseForDevToolsAsync`
// (SQLiteDevToolsClient.ts) — wiring for Expo's own DevTools browser extension, which this
// project has no equivalent of and does not otherwise depend on.
import { Platform } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';

import { expoSQLite } from './native-module';
import { NativeDatabase, flattenOpenOptions } from './native-database';
import type { ISQLiteOpenOptions } from './native-database';
import { SQLiteSession } from './sqlite-session';
import { SQLiteStatement } from './sqlite-statement';
import type {
  ISQLiteBindParams,
  ISQLiteExecuteAsyncResult,
  ISQLiteExecuteSyncResult,
  ISQLiteRunResult,
  ISQLiteVariadicBindParams,
} from './sqlite-statement';
import { SQLiteTaggedQuery } from './sqlite-tagged-query';
import { createDatabasePath } from './path-utils';
import type {
  IDatabaseChangeEvent,
  IOnInitCallback,
  IOpenDatabaseOptions,
} from './types';

export type { ISQLiteOpenOptions } from './native-database';
export type {
  IDatabaseChangeEvent,
  IOnInitCallback,
  IOpenDatabaseOptions,
} from './types';

/** A SQLite database. */
export class SQLiteDatabase {
  constructor(
    public readonly databasePath: string,
    public readonly options: ISQLiteOpenOptions,
    public readonly nativeDatabase: NativeDatabase,
  ) {}

  /** Whether the database is currently in a transaction. */
  public isInTransactionAsync(): Promise<boolean> {
    return this.nativeDatabase.isInTransactionAsync();
  }

  /** Closes the database. */
  public closeAsync(): Promise<void> {
    return this.nativeDatabase.closeAsync();
  }

  /**
   * Executes all SQL queries in the supplied string.
   * > **Note:** The queries are not escaped for you — be careful when constructing them.
   */
  public execAsync(source: string): Promise<void> {
    return this.nativeDatabase.execAsync(source);
  }

  /**
   * [Serializes the database](https://sqlite.org/c3ref/serialize.html) as a `Uint8Array`.
   * @param databaseName The attached database name. Defaults to `main`.
   */
  public serializeAsync(databaseName: string = 'main'): Promise<Uint8Array> {
    return this.nativeDatabase.serializeAsync(databaseName);
  }

  /**
   * Creates a [prepared statement](https://www.sqlite.org/c3ref/prepare.html) from `source`.
   */
  public async prepareAsync(source: string): Promise<SQLiteStatement> {
    const nativeStatement = new expoSQLite.NativeStatement();
    await this.nativeDatabase.prepareAsync(nativeStatement, source);
    return new SQLiteStatement(this.nativeDatabase, nativeStatement);
  }

  /**
   * Creates a new session for the database.
   * @see [`sqlite3session_create`](https://www.sqlite.org/session/sqlite3session_create.html)
   * @param dbName The database name to create a session for. Defaults to `main`.
   */
  public async createSessionAsync(
    dbName: string = 'main',
  ): Promise<SQLiteSession> {
    const nativeSession = new expoSQLite.NativeSession();
    await this.nativeDatabase.createSessionAsync(nativeSession, dbName);
    return new SQLiteSession(this.nativeDatabase, nativeSession);
  }

  /**
   * Loads a SQLite extension.
   * @param libPath The path to the extension library file.
   * @param entryPoint The extension's entry point. Inferred by
   *   [`sqlite3_load_extension`](https://www.sqlite.org/c3ref/load_extension.html) when omitted.
   */
  public loadExtensionAsync(
    libPath: string,
    entryPoint?: string,
  ): Promise<void> {
    return this.nativeDatabase.loadExtensionAsync(libPath, entryPoint);
  }

  /**
   * Executes a transaction, committing/rolling back automatically based on `task`'s result.
   *
   * > **Note:** Not exclusive — other async queries can interleave, so the order of execution
   * > relative to a query issued outside the transaction is not guaranteed. Use
   * > `withExclusiveTransactionAsync` when that matters.
   */
  public async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    try {
      await this.execAsync('BEGIN');
      await task();
      await this.execAsync('COMMIT');
    } catch (error) {
      await this.execAsync('ROLLBACK');
      throw error;
    }
  }

  /**
   * Executes a transaction, committing/rolling back automatically based on `task`'s result.
   * The transaction may be exclusive: once it becomes a write transaction, other async write
   * queries abort with a `database is locked` error.
   *
   * > **Note:** Not supported on web.
   *
   * @param task Any queries inside it must run on the `txn` object it receives — a private
   *   `SQLiteDatabase` subclass bound to the exclusive connection, typed here as the base class
   *   since the subclass is an implementation detail, not a public export.
   */
  public async withExclusiveTransactionAsync(
    task: (txn: SQLiteDatabase) => Promise<void>,
  ): Promise<void> {
    if (Platform.OS === 'web') {
      throw new Error('withExclusiveTransactionAsync is not supported on web');
    }
    const transaction = await SQLiteTransaction.createAsync(this);
    let error: unknown;
    try {
      await transaction.execAsync('BEGIN');
      await task(transaction);
      await transaction.execAsync('COMMIT');
    } catch (thrown) {
      await transaction.execAsync('ROLLBACK');
      error = thrown;
    } finally {
      await transaction.closeAsync();
    }
    if (error !== undefined) {
      throw error;
    }
  }

  /** Whether the database is currently in a transaction. */
  public isInTransactionSync(): boolean {
    return this.nativeDatabase.isInTransactionSync();
  }

  /** Closes the database. */
  public closeSync(): void {
    return this.nativeDatabase.closeSync();
  }

  /**
   * Executes all SQL queries in the supplied string.
   * > **Note:** The queries are not escaped for you. Running heavy tasks with this function can
   * > block the JavaScript thread.
   */
  public execSync(source: string): void {
    return this.nativeDatabase.execSync(source);
  }

  /**
   * [Serializes the database](https://sqlite.org/c3ref/serialize.html) as a `Uint8Array`.
   * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
   */
  public serializeSync(databaseName: string = 'main'): Uint8Array {
    return this.nativeDatabase.serializeSync(databaseName);
  }

  /**
   * Creates a [prepared statement](https://www.sqlite.org/c3ref/prepare.html) from `source`.
   * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
   */
  public prepareSync(source: string): SQLiteStatement {
    const nativeStatement = new expoSQLite.NativeStatement();
    this.nativeDatabase.prepareSync(nativeStatement, source);
    return new SQLiteStatement(this.nativeDatabase, nativeStatement);
  }

  /**
   * Creates a new session for the database.
   * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
   * @see [`sqlite3session_create`](https://www.sqlite.org/session/sqlite3session_create.html)
   */
  public createSessionSync(dbName: string = 'main'): SQLiteSession {
    const nativeSession = new expoSQLite.NativeSession();
    this.nativeDatabase.createSessionSync(nativeSession, dbName);
    return new SQLiteSession(this.nativeDatabase, nativeSession);
  }

  /**
   * Loads a SQLite extension.
   * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
   */
  public loadExtensionSync(libPath: string, entryPoint?: string): void {
    this.nativeDatabase.loadExtensionSync(libPath, entryPoint);
  }

  /**
   * Executes a transaction, committing/rolling back automatically based on `task`'s result.
   * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
   */
  public withTransactionSync(task: () => void): void {
    try {
      this.execSync('BEGIN');
      task();
      this.execSync('COMMIT');
    } catch (error) {
      this.execSync('ROLLBACK');
      throw error;
    }
  }

  /**
   * Executes SQL queries using tagged template literals (Bun-style), automatically parameterized
   * against SQL injection. Directly awaitable (returns rows/`ISQLiteRunResult`); use `.values()`,
   * `.first()`, `.each()`, or the `*Sync` variants for other shapes.
   *
   * @example
   * ```ts
   * const users = await db.sql<User>`SELECT * FROM users WHERE age > ${21}`;
   * const rows = await db.sql`SELECT name, age FROM users`.values();
   * const user = await db.sql<User>`SELECT * FROM users WHERE id = ${userId}`.first();
   * ```
   */
  public sql = <T = unknown>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => new SQLiteTaggedQuery<T>(this, strings, values);

  //#region Statement API shorthands

  /**
   * A convenience wrapper around `prepareAsync()`, `SQLiteStatement.executeAsync()`, and
   * `SQLiteStatement.finalizeAsync()`.
   */
  public runAsync(
    source: string,
    params: ISQLiteBindParams,
  ): Promise<ISQLiteRunResult>;
  /** @hidden */
  public runAsync(
    source: string,
    ...params: ISQLiteVariadicBindParams
  ): Promise<ISQLiteRunResult>;
  // `any[]`: the implementation signature of an overloaded function is not itself callable, so
  // TS checks `statement.executeAsync(...params)` below against ITS overloads, not against
  // whatever narrower type is written here — `unknown[]` fails that check for every one of
  // these forwarding methods, matching upstream's own `any[]` for the identical reason.
  public async runAsync(
    source: string,
    ...params: any[]
  ): Promise<ISQLiteRunResult> {
    const statement = await this.prepareAsync(source);
    let result: ISQLiteExecuteAsyncResult<unknown>;
    try {
      result = await statement.executeAsync(...params);
    } finally {
      await statement.finalizeAsync();
    }
    return result;
  }

  /**
   * A convenience wrapper around `prepareAsync()`, `SQLiteStatement.executeAsync()`,
   * `ISQLiteExecuteAsyncResult.getFirstAsync()`, and `SQLiteStatement.finalizeAsync()`.
   */
  public getFirstAsync<T>(
    source: string,
    params: ISQLiteBindParams,
  ): Promise<T | null>;
  /** @hidden */
  public getFirstAsync<T>(
    source: string,
    ...params: ISQLiteVariadicBindParams
  ): Promise<T | null>;
  public async getFirstAsync<T>(
    source: string,
    ...params: any[]
  ): Promise<T | null> {
    const statement = await this.prepareAsync(source);
    let firstRow: T | null;
    try {
      const result = await statement.executeAsync<T>(...params);
      firstRow = await result.getFirstAsync();
    } finally {
      await statement.finalizeAsync();
    }
    return firstRow;
  }

  /**
   * A convenience wrapper around `prepareAsync()`, `SQLiteStatement.executeAsync()`, the
   * `ISQLiteExecuteAsyncResult` async iterator, and `SQLiteStatement.finalizeAsync()`.
   */
  public getEachAsync<T>(
    source: string,
    params: ISQLiteBindParams,
  ): AsyncIterableIterator<T>;
  /** @hidden */
  public getEachAsync<T>(
    source: string,
    ...params: ISQLiteVariadicBindParams
  ): AsyncIterableIterator<T>;
  public async *getEachAsync<T>(
    source: string,
    ...params: any[]
  ): AsyncIterableIterator<T> {
    const statement = await this.prepareAsync(source);
    try {
      const result = await statement.executeAsync<T>(...params);
      for await (const row of result) {
        yield row;
      }
    } finally {
      await statement.finalizeAsync();
    }
  }

  /**
   * A convenience wrapper around `prepareAsync()`, `SQLiteStatement.executeAsync()`,
   * `ISQLiteExecuteAsyncResult.getAllAsync()`, and `SQLiteStatement.finalizeAsync()`.
   */
  public getAllAsync<T>(
    source: string,
    params: ISQLiteBindParams,
  ): Promise<T[]>;
  /** @hidden */
  public getAllAsync<T>(
    source: string,
    ...params: ISQLiteVariadicBindParams
  ): Promise<T[]>;
  public async getAllAsync<T>(source: string, ...params: any[]): Promise<T[]> {
    const statement = await this.prepareAsync(source);
    let allRows: T[];
    try {
      const result = await statement.executeAsync<T>(...params);
      allRows = await result.getAllAsync();
    } finally {
      await statement.finalizeAsync();
    }
    return allRows;
  }

  /**
   * A convenience wrapper around `prepareSync()`, `SQLiteStatement.executeSync()`, and
   * `SQLiteStatement.finalizeSync()`.
   * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
   */
  public runSync(source: string, params: ISQLiteBindParams): ISQLiteRunResult;
  /** @hidden */
  public runSync(
    source: string,
    ...params: ISQLiteVariadicBindParams
  ): ISQLiteRunResult;
  public runSync(source: string, ...params: any[]): ISQLiteRunResult {
    const statement = this.prepareSync(source);
    let result: ISQLiteExecuteSyncResult<unknown>;
    try {
      result = statement.executeSync(...params);
    } finally {
      statement.finalizeSync();
    }
    return result;
  }

  /**
   * A convenience wrapper around `prepareSync()`, `SQLiteStatement.executeSync()`,
   * `ISQLiteExecuteSyncResult.getFirstSync()`, and `SQLiteStatement.finalizeSync()`.
   * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
   */
  public getFirstSync<T>(source: string, params: ISQLiteBindParams): T | null;
  /** @hidden */
  public getFirstSync<T>(
    source: string,
    ...params: ISQLiteVariadicBindParams
  ): T | null;
  public getFirstSync<T>(source: string, ...params: any[]): T | null {
    const statement = this.prepareSync(source);
    let firstRow: T | null;
    try {
      const result = statement.executeSync<T>(...params);
      firstRow = result.getFirstSync();
    } finally {
      statement.finalizeSync();
    }
    return firstRow;
  }

  /**
   * A convenience wrapper around `prepareSync()`, `SQLiteStatement.executeSync()`, the
   * `ISQLiteExecuteSyncResult` iterator, and `SQLiteStatement.finalizeSync()`.
   * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
   */
  public getEachSync<T>(
    source: string,
    params: ISQLiteBindParams,
  ): IterableIterator<T>;
  /** @hidden */
  public getEachSync<T>(
    source: string,
    ...params: ISQLiteVariadicBindParams
  ): IterableIterator<T>;
  public *getEachSync<T>(
    source: string,
    ...params: any[]
  ): IterableIterator<T> {
    const statement = this.prepareSync(source);
    try {
      const result = statement.executeSync<T>(...params);
      for (const row of result) {
        yield row;
      }
    } finally {
      statement.finalizeSync();
    }
  }

  /**
   * A convenience wrapper around `prepareSync()`, `SQLiteStatement.executeSync()`,
   * `ISQLiteExecuteSyncResult.getAllSync()`, and `SQLiteStatement.finalizeSync()`.
   * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
   */
  public getAllSync<T>(source: string, params: ISQLiteBindParams): T[];
  /** @hidden */
  public getAllSync<T>(
    source: string,
    ...params: ISQLiteVariadicBindParams
  ): T[];
  public getAllSync<T>(source: string, ...params: any[]): T[] {
    const statement = this.prepareSync(source);
    let allRows: T[];
    try {
      const result = statement.executeSync<T>(...params);
      allRows = result.getAllSync();
    } finally {
      statement.finalizeSync();
    }
    return allRows;
  }

  /** Synchronizes the local database with the remote libSQL server (libSQL integration only). */
  public syncLibSQL(): Promise<void> {
    if (typeof this.nativeDatabase.syncLibSQL !== 'function') {
      throw new Error('syncLibSQL is not supported in the current environment');
    }
    return this.nativeDatabase.syncLibSQL();
  }

  //#endregion
}

/** The default directory new databases are created in. */
export const defaultDatabaseDirectory = expoSQLite.defaultDatabaseDirectory;

/**
 * Pre-bundled SQLite extensions. Bundling one (e.g. `sqlite-vec`) is a manual native-config
 * step this package does not automate — see the README.
 */
export const bundledExtensions = expoSQLite.bundledExtensions;

async function runOnInit(
  db: SQLiteDatabase,
  onInit: IOnInitCallback | undefined,
): Promise<void> {
  if (onInit) {
    await onInit(db);
  }
}

/**
 * Opens a database.
 * @param databaseName The database file name to open.
 * @param options Open options — see `IOpenDatabaseOptions` for the `onInit` deviation from
 *   upstream (documented in the README).
 * @param directory The directory the database file is located in. Defaults to
 *   `defaultDatabaseDirectory`.
 */
export async function openDatabaseAsync(
  databaseName: string,
  options?: IOpenDatabaseOptions,
  directory?: string,
): Promise<SQLiteDatabase> {
  const { onInit, ...openOptions } = options ?? {};
  const databasePath = createDatabasePath(databaseName, directory);
  await expoSQLite.ensureDatabasePathExistsAsync(databasePath);
  const nativeDatabase = new expoSQLite.NativeDatabase(
    databasePath,
    flattenOpenOptions(openOptions),
  );
  await nativeDatabase.initAsync();
  const database = new SQLiteDatabase(
    databasePath,
    openOptions,
    nativeDatabase,
  );
  await runOnInit(database, onInit);
  return database;
}

/**
 * Opens a database.
 * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
 */
export function openDatabaseSync(
  databaseName: string,
  options?: IOpenDatabaseOptions,
  directory?: string,
): SQLiteDatabase {
  const { onInit, ...openOptions } = options ?? {};
  const databasePath = createDatabasePath(databaseName, directory);
  expoSQLite.ensureDatabasePathExistsSync(databasePath);
  const nativeDatabase = new expoSQLite.NativeDatabase(
    databasePath,
    flattenOpenOptions(openOptions),
  );
  nativeDatabase.initSync();
  const database = new SQLiteDatabase(
    databasePath,
    openOptions,
    nativeDatabase,
  );
  if (onInit) {
    const result = onInit(database);
    if (result instanceof Promise) {
      throw new Error(
        'openDatabaseSync: onInit returned a Promise — pass a synchronous callback, or use openDatabaseAsync.',
      );
    }
  }
  return database;
}

/**
 * Given `Uint8Array` data, [deserializes it to an in-memory database](https://sqlite.org/c3ref/deserialize.html).
 * @param serializedData The binary array from `SQLiteDatabase.serializeAsync()`.
 */
export async function deserializeDatabaseAsync(
  serializedData: Uint8Array,
  options?: ISQLiteOpenOptions,
): Promise<SQLiteDatabase> {
  const openOptions = options ?? {};
  const nativeDatabase = new expoSQLite.NativeDatabase(
    ':memory:',
    flattenOpenOptions(openOptions),
    serializedData,
  );
  await nativeDatabase.initAsync();
  return new SQLiteDatabase(':memory:', openOptions, nativeDatabase);
}

/**
 * Given `Uint8Array` data, [deserializes it to an in-memory database](https://sqlite.org/c3ref/deserialize.html).
 * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
 */
export function deserializeDatabaseSync(
  serializedData: Uint8Array,
  options?: ISQLiteOpenOptions,
): SQLiteDatabase {
  const openOptions = options ?? {};
  const nativeDatabase = new expoSQLite.NativeDatabase(
    ':memory:',
    flattenOpenOptions(openOptions),
    serializedData,
  );
  nativeDatabase.initSync();
  return new SQLiteDatabase(':memory:', openOptions, nativeDatabase);
}

/** Deletes a database file. */
export async function deleteDatabaseAsync(
  databaseName: string,
  directory?: string,
): Promise<void> {
  const databasePath = createDatabasePath(databaseName, directory);
  return await expoSQLite.deleteDatabaseAsync(databasePath);
}

/**
 * Deletes a database file.
 * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
 */
export function deleteDatabaseSync(
  databaseName: string,
  directory?: string,
): void {
  const databasePath = createDatabasePath(databaseName, directory);
  return expoSQLite.deleteDatabaseSync(databasePath);
}

/**
 * Backs up a database to another database.
 * @see https://www.sqlite.org/c3ref/backup_finish.html
 */
export function backupDatabaseAsync(options: {
  sourceDatabase: SQLiteDatabase;
  sourceDatabaseName?: string;
  destDatabase: SQLiteDatabase;
  destDatabaseName?: string;
}): Promise<void> {
  const { sourceDatabase, sourceDatabaseName, destDatabase, destDatabaseName } =
    options;
  return expoSQLite.backupDatabaseAsync(
    destDatabase.nativeDatabase,
    destDatabaseName ?? 'main',
    sourceDatabase.nativeDatabase,
    sourceDatabaseName ?? 'main',
  );
}

/**
 * Backs up a database to another database.
 * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
 * @see https://www.sqlite.org/c3ref/backup_finish.html
 */
export function backupDatabaseSync(options: {
  sourceDatabase: SQLiteDatabase;
  sourceDatabaseName?: string;
  destDatabase: SQLiteDatabase;
  destDatabaseName?: string;
}): void {
  const { sourceDatabase, sourceDatabaseName, destDatabase, destDatabaseName } =
    options;
  return expoSQLite.backupDatabaseSync(
    destDatabase.nativeDatabase,
    destDatabaseName ?? 'main',
    sourceDatabase.nativeDatabase,
    sourceDatabaseName ?? 'main',
  );
}

/**
 * Adds a listener for database changes.
 * > **Note:** requires `enableChangeListener: true` in `ISQLiteOpenOptions` when opening.
 */
export function addDatabaseChangeListener(
  listener: (event: IDatabaseChangeEvent) => void,
): EventSubscription {
  return expoSQLite.addListener('onDatabaseChange', listener);
}

/**
 * A new connection specifically used by `withExclusiveTransactionAsync`.
 * @hidden not exposing all the database methods to the public API surface
 */
class SQLiteTransaction extends SQLiteDatabase {
  public static async createAsync(
    db: SQLiteDatabase,
  ): Promise<SQLiteTransaction> {
    const options: ISQLiteOpenOptions = {
      ...db.options,
      useNewConnection: true,
    };
    const nativeDatabase = new expoSQLite.NativeDatabase(
      db.databasePath,
      flattenOpenOptions(options),
    );
    await nativeDatabase.initAsync();
    return new SQLiteTransaction(db.databasePath, options, nativeDatabase);
  }
}
