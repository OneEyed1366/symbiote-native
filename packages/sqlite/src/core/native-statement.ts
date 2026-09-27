// Ported from expo-sqlite's NativeStatement.ts (.vendors/expo @ origin/sdk-57,
// packages/expo-sqlite/src/NativeStatement.ts), renamed with this repo's `I`-prefix convention.
//
// A plain native class, instantiated directly (`new ExpoSQLite.NativeStatement()`) and then
// mutated in place by `NativeDatabase.prepareAsync`/`prepareSync` — see `sqlite-database.ts`.

/** A result returned by `SQLiteStatement.executeAsync()`/`executeSync()`. */
export type ISQLiteRunResult = {
  /**
   * The last inserted row ID, from
   * [`sqlite3_last_insert_rowid()`](https://www.sqlite.org/c3ref/last_insert_rowid.html).
   */
  lastInsertRowId: number;
  /**
   * The number of rows affected, from
   * [`sqlite3_changes()`](https://www.sqlite.org/c3ref/changes.html).
   */
  changes: number;
};

/**
 * Bind parameters to a prepared statement — a single array/variadic args for unnamed
 * parameters (`?`), or a single object for named parameters (`:VVV`, `@VVV`, `$VVV`).
 */
export type ISQLiteBindValue =
  string | number | null | boolean | ISQLiteBindBlobValue;
export type ISQLiteBindParams =
  Record<string, ISQLiteBindValue> | ISQLiteBindValue[];
export type ISQLiteVariadicBindParams = ISQLiteBindValue[];
export type ISQLiteBindBlobValue = Uint8Array | ArrayBuffer;

export type ISQLiteBindPrimitiveParams = Record<
  string,
  Exclude<ISQLiteBindValue, ISQLiteBindBlobValue>
>;
export type ISQLiteBindBlobParams = Record<string, ISQLiteBindBlobValue>;
export type ISQLiteColumnNames = string[];
// `any`: native bridge payload — a prepared statement's row shape is only known to the caller of
// `executeAsync<T>`/`executeSync<T>`.
export type ISQLiteColumnValues = any[];
// `any`: `NativeDatabase` and its `Transaction` subclass (sqlite-database.ts) both satisfy this,
// kept untyped here (matching upstream) to avoid a circular import between the two native
// declaration files.
export type ISQLiteAnyDatabase = any;

/** An instance of a prepared SQLite statement. */
export declare class NativeStatement {
  //#region Asynchronous API

  public runAsync(
    database: ISQLiteAnyDatabase,
    bindParams: ISQLiteBindPrimitiveParams,
    bindBlobParams: ISQLiteBindBlobParams,
    shouldPassAsArray: boolean,
  ): Promise<ISQLiteRunResult & { firstRowValues: ISQLiteColumnValues }>;
  public stepAsync(
    database: ISQLiteAnyDatabase,
  ): Promise<ISQLiteColumnValues | null | undefined>;
  public getAllAsync(
    database: ISQLiteAnyDatabase,
  ): Promise<ISQLiteColumnValues[]>;
  public resetAsync(database: ISQLiteAnyDatabase): Promise<void>;
  public getColumnNamesAsync(): Promise<ISQLiteColumnNames>;
  public finalizeAsync(database: ISQLiteAnyDatabase): Promise<void>;

  //#endregion

  //#region Synchronous API

  public runSync(
    database: ISQLiteAnyDatabase,
    bindParams: ISQLiteBindPrimitiveParams,
    bindBlobParams: ISQLiteBindBlobParams,
    shouldPassAsArray: boolean,
  ): ISQLiteRunResult & { firstRowValues: ISQLiteColumnValues };
  public stepSync(
    database: ISQLiteAnyDatabase,
  ): ISQLiteColumnValues | null | undefined;
  public getAllSync(database: ISQLiteAnyDatabase): ISQLiteColumnValues[];
  public resetSync(database: ISQLiteAnyDatabase): void;
  public getColumnNamesSync(): string[];
  public finalizeSync(database: ISQLiteAnyDatabase): void;

  //#endregion
}
