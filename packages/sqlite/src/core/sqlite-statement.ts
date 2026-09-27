// Ported from expo-sqlite's SQLiteStatement.ts (.vendors/expo @ origin/sdk-57,
// packages/expo-sqlite/src/SQLiteStatement.ts), renamed with this repo's `I`-prefix convention.
import type { NativeDatabase } from './native-database';
import type {
  NativeStatement,
  ISQLiteBindParams,
  ISQLiteVariadicBindParams,
  ISQLiteAnyDatabase,
  ISQLiteColumnNames,
  ISQLiteColumnValues,
} from './native-statement';
import { composeRow, composeRows, normalizeParams } from './param-utils';

export type {
  ISQLiteBindParams,
  ISQLiteBindValue,
  ISQLiteRunResult,
  ISQLiteVariadicBindParams,
} from './native-statement';

type IValuesOf<T extends object> = T[keyof T][];

/**
 * A prepared statement returned by `SQLiteDatabase.prepareAsync()`/`prepareSync()`, bound with
 * parameters and executed.
 */
export class SQLiteStatement {
  constructor(
    private readonly nativeDatabase: NativeDatabase,
    private readonly nativeStatement: NativeStatement,
  ) {}

  //#region Asynchronous API

  /** Runs the prepared statement and returns an `ISQLiteExecuteAsyncResult`. */
  public executeAsync<T>(
    params: ISQLiteBindParams,
  ): Promise<ISQLiteExecuteAsyncResult<T>>;
  /** @hidden */
  public executeAsync<T>(
    ...params: ISQLiteVariadicBindParams
  ): Promise<ISQLiteExecuteAsyncResult<T>>;
  public async executeAsync<T>(
    ...params: unknown[]
  ): Promise<ISQLiteExecuteAsyncResult<T>> {
    const { lastInsertRowId, changes, firstRowValues } =
      await this.nativeStatement.runAsync(
        this.nativeDatabase,
        ...normalizeParams(...params),
      );
    return createSQLiteExecuteAsyncResult<T>(
      this.nativeDatabase,
      this.nativeStatement,
      firstRowValues,
      { rawResult: false, lastInsertRowId, changes },
    );
  }

  /**
   * Like `executeAsync()` but returns the raw value-array result instead of row objects.
   * @hidden Advanced use only.
   */
  public executeForRawResultAsync<T extends object>(
    params: ISQLiteBindParams,
  ): Promise<ISQLiteExecuteAsyncResult<IValuesOf<T>>>;
  /** @hidden */
  public executeForRawResultAsync<T extends object>(
    ...params: ISQLiteVariadicBindParams
  ): Promise<ISQLiteExecuteAsyncResult<IValuesOf<T>>>;
  public async executeForRawResultAsync<T extends object>(
    ...params: unknown[]
  ): Promise<ISQLiteExecuteAsyncResult<IValuesOf<T>>> {
    const { lastInsertRowId, changes, firstRowValues } =
      await this.nativeStatement.runAsync(
        this.nativeDatabase,
        ...normalizeParams(...params),
      );
    return createSQLiteExecuteAsyncResult<IValuesOf<T>>(
      this.nativeDatabase,
      this.nativeStatement,
      firstRowValues,
      { rawResult: true, lastInsertRowId, changes },
    );
  }

  /** Gets the column names of the prepared statement. */
  public getColumnNamesAsync(): Promise<string[]> {
    return this.nativeStatement.getColumnNamesAsync();
  }

  /**
   * Finalizes the prepared statement — calls
   * [`sqlite3_finalize()`](https://www.sqlite.org/c3ref/finalize.html) under the hood.
   * Accessing a finalized statement afterward throws. `expo-sqlite` finalizes any orphaned
   * statement automatically when its database closes, but finalize as soon as you no longer
   * need one — wrap the call in `try...finally` so it runs even if an earlier step throws.
   */
  public async finalizeAsync(): Promise<void> {
    await this.nativeStatement.finalizeAsync(this.nativeDatabase);
  }

  //#endregion

  //#region Synchronous API

  /**
   * Runs the prepared statement and returns an `ISQLiteExecuteSyncResult`.
   * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
   */
  public executeSync<T>(params: ISQLiteBindParams): ISQLiteExecuteSyncResult<T>;
  /** @hidden */
  public executeSync<T>(
    ...params: ISQLiteVariadicBindParams
  ): ISQLiteExecuteSyncResult<T>;
  public executeSync<T>(...params: unknown[]): ISQLiteExecuteSyncResult<T> {
    const { lastInsertRowId, changes, firstRowValues } =
      this.nativeStatement.runSync(
        this.nativeDatabase,
        ...normalizeParams(...params),
      );
    return createSQLiteExecuteSyncResult<T>(
      this.nativeDatabase,
      this.nativeStatement,
      firstRowValues,
      { rawResult: false, lastInsertRowId, changes },
    );
  }

  /**
   * Like `executeSync()` but returns the raw value-array result instead of row objects.
   * @hidden Advanced use only.
   */
  public executeForRawResultSync<T extends object>(
    params: ISQLiteBindParams,
  ): ISQLiteExecuteSyncResult<IValuesOf<T>>;
  /** @hidden */
  public executeForRawResultSync<T extends object>(
    ...params: ISQLiteVariadicBindParams
  ): ISQLiteExecuteSyncResult<IValuesOf<T>>;
  public executeForRawResultSync<T extends object>(
    ...params: unknown[]
  ): ISQLiteExecuteSyncResult<IValuesOf<T>> {
    const { lastInsertRowId, changes, firstRowValues } =
      this.nativeStatement.runSync(
        this.nativeDatabase,
        ...normalizeParams(...params),
      );
    return createSQLiteExecuteSyncResult<IValuesOf<T>>(
      this.nativeDatabase,
      this.nativeStatement,
      firstRowValues,
      { rawResult: true, lastInsertRowId, changes },
    );
  }

  /** Gets the column names of the prepared statement. */
  public getColumnNamesSync(): string[] {
    return this.nativeStatement.getColumnNamesSync();
  }

  /**
   * Finalizes the prepared statement synchronously.
   * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
   */
  public finalizeSync(): void {
    this.nativeStatement.finalizeSync(this.nativeDatabase);
  }

  //#endregion
}

/** A result returned by `SQLiteStatement.executeAsync()`. */
export type ISQLiteExecuteAsyncResult<T> = AsyncIterableIterator<T> & {
  /** The last inserted row ID, from `sqlite3_last_insert_rowid()`. */
  readonly lastInsertRowId: number;
  /** The number of rows affected, from `sqlite3_changes()`. */
  readonly changes: number;
  /**
   * Gets the first row of the result set. Requires the cursor to be in its initial state —
   * call `resetAsync()` first if rows have already been retrieved, or this throws.
   */
  getFirstAsync(): Promise<T | null>;
  /**
   * Gets all rows of the result set. Requires the cursor to be in its initial state — call
   * `resetAsync()` first if rows have already been retrieved, or this throws.
   */
  getAllAsync(): Promise<T[]>;
  /** Resets the prepared statement's cursor — calls `sqlite3_reset()` under the hood. */
  resetAsync(): Promise<void>;
};

/**
 * A result returned by `SQLiteStatement.executeSync()`.
 * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
 */
export type ISQLiteExecuteSyncResult<T> = IterableIterator<T> & {
  /** The last inserted row ID, from `sqlite3_last_insert_rowid()`. */
  readonly lastInsertRowId: number;
  /** The number of rows affected, from `sqlite3_changes()`. */
  readonly changes: number;
  /**
   * Gets the first row of the result set. Requires the cursor to be in its initial state — call
   * `resetSync()` first if rows have already been retrieved, or this throws.
   */
  getFirstSync(): T | null;
  /**
   * Gets all rows of the result set. Requires the cursor to be in its initial state — call
   * `resetSync()` first if rows have already been retrieved, or this throws.
   */
  getAllSync(): T[];
  /** Resets the prepared statement's cursor — calls `sqlite3_reset()` under the hood. */
  resetSync(): void;
};

//#region Internals for ISQLiteExecuteAsyncResult and ISQLiteExecuteSyncResult

type ISQLiteExecuteResultOptions = {
  rawResult: boolean;
  lastInsertRowId: number;
  changes: number;
};

/**
 * Creates the `ISQLiteExecuteAsyncResult` — an async generator with the extra fields/methods
 * attached via `Object.defineProperties`, since Hermes does not support `Symbol.asyncIterator`
 * on a plain object literal.
 */
async function createSQLiteExecuteAsyncResult<T>(
  database: ISQLiteAnyDatabase,
  statement: NativeStatement,
  firstRowValues: ISQLiteColumnValues | null,
  options: ISQLiteExecuteResultOptions,
): Promise<ISQLiteExecuteAsyncResult<T>> {
  const instance = new SQLiteExecuteAsyncResultImpl<T>(
    database,
    statement,
    firstRowValues ? processNativeRow(firstRowValues) : null,
    options,
  );
  const generator = instance.generatorAsync();
  Object.defineProperties(generator, {
    lastInsertRowId: {
      value: options.lastInsertRowId,
      enumerable: true,
      writable: false,
      configurable: true,
    },
    changes: {
      value: options.changes,
      enumerable: true,
      writable: false,
      configurable: true,
    },
    getFirstAsync: {
      value: instance.getFirstAsync.bind(instance),
      enumerable: true,
      writable: false,
      configurable: true,
    },
    getAllAsync: {
      value: instance.getAllAsync.bind(instance),
      enumerable: true,
      writable: false,
      configurable: true,
    },
    resetAsync: {
      value: instance.resetAsync.bind(instance),
      enumerable: true,
      writable: false,
      configurable: true,
    },
  });

  // I/O edge: the generator is given the four extra members above at runtime via
  // `Object.defineProperties` — nothing narrower can describe that to the type checker.
  return generator as ISQLiteExecuteAsyncResult<T>;
}

/** Creates the `ISQLiteExecuteSyncResult`. */
function createSQLiteExecuteSyncResult<T>(
  database: ISQLiteAnyDatabase,
  statement: NativeStatement,
  firstRowValues: ISQLiteColumnValues | null,
  options: ISQLiteExecuteResultOptions,
): ISQLiteExecuteSyncResult<T> {
  const instance = new SQLiteExecuteSyncResultImpl<T>(
    database,
    statement,
    firstRowValues ? processNativeRow(firstRowValues) : firstRowValues,
    options,
  );
  const generator = instance.generatorSync();
  Object.defineProperties(generator, {
    lastInsertRowId: {
      value: options.lastInsertRowId,
      enumerable: true,
      writable: false,
      configurable: true,
    },
    changes: {
      value: options.changes,
      enumerable: true,
      writable: false,
      configurable: true,
    },
    getFirstSync: {
      value: instance.getFirstSync.bind(instance),
      enumerable: true,
      writable: false,
      configurable: true,
    },
    getAllSync: {
      value: instance.getAllSync.bind(instance),
      enumerable: true,
      writable: false,
      configurable: true,
    },
    resetSync: {
      value: instance.resetSync.bind(instance),
      enumerable: true,
      writable: false,
      configurable: true,
    },
  });

  // I/O edge: see createSQLiteExecuteAsyncResult above.
  return generator as ISQLiteExecuteSyncResult<T>;
}

class SQLiteExecuteAsyncResultImpl<T> {
  private columnNames: string[] | null = null;
  private isStepCalled = false;

  constructor(
    private readonly database: ISQLiteAnyDatabase,
    private readonly statement: NativeStatement,
    private firstRowValues: ISQLiteColumnValues | null,
    public readonly options: ISQLiteExecuteResultOptions,
  ) {}

  async getFirstAsync(): Promise<T | null> {
    if (this.isStepCalled) {
      throw new Error(
        'The SQLite cursor has been shifted and is unable to retrieve the first row without being reset. Invoke `resetAsync()` to reset the cursor first if you want to retrieve the first row.',
      );
    }
    this.isStepCalled = true;
    const columnNames = await this.getColumnNamesAsync();
    const firstRowValues = this.popFirstRowValues();
    if (firstRowValues != null) {
      return composeRowIfNeeded<T>(
        this.options.rawResult,
        columnNames,
        firstRowValues,
      );
    }
    const firstRow = await this.statement.stepAsync(this.database);
    return firstRow != null
      ? composeRowIfNeeded<T>(
          this.options.rawResult,
          columnNames,
          processNativeRow(firstRow),
        )
      : null;
  }

  async getAllAsync(): Promise<T[]> {
    if (this.isStepCalled) {
      throw new Error(
        'The SQLite cursor has been shifted and is unable to retrieve all rows without being reset. Invoke `resetAsync()` to reset the cursor first if you want to retrieve all rows.',
      );
    }
    this.isStepCalled = true;
    const firstRowValues = this.popFirstRowValues();
    if (firstRowValues == null) {
      // An empty first row means this SQL was a write operation — calling getAllAsync() again
      // would write a second time.
      return [];
    }
    const columnNames = await this.getColumnNamesAsync();
    const nativeRows = await this.statement.getAllAsync(this.database);
    const allRows = processNativeRows(nativeRows);
    if (firstRowValues.length > 0) {
      return composeRowsIfNeeded<T>(this.options.rawResult, columnNames, [
        firstRowValues,
        ...allRows,
      ]);
    }
    return composeRowsIfNeeded<T>(this.options.rawResult, columnNames, allRows);
  }

  async *generatorAsync(): AsyncIterableIterator<T> {
    this.isStepCalled = true;
    const columnNames = await this.getColumnNamesAsync();
    const firstRowValues = this.popFirstRowValues();
    if (firstRowValues != null) {
      yield composeRowIfNeeded<T>(
        this.options.rawResult,
        columnNames,
        firstRowValues,
      );
    }

    let result;
    do {
      result = await this.statement.stepAsync(this.database);
      if (result != null) {
        yield composeRowIfNeeded<T>(
          this.options.rawResult,
          columnNames,
          processNativeRow(result),
        );
      }
    } while (result != null);
  }

  resetAsync(): Promise<void> {
    const result = this.statement.resetAsync(this.database);
    this.isStepCalled = false;
    return result;
  }

  private popFirstRowValues(): ISQLiteColumnValues | null {
    if (this.firstRowValues != null) {
      const firstRowValues = this.firstRowValues;
      this.firstRowValues = null;
      return firstRowValues.length > 0 ? firstRowValues : null;
    }
    return null;
  }

  private async getColumnNamesAsync(): Promise<string[]> {
    if (this.columnNames == null) {
      this.columnNames = await this.statement.getColumnNamesAsync();
    }
    return this.columnNames;
  }
}

class SQLiteExecuteSyncResultImpl<T> {
  private columnNames: string[] | null = null;
  private isStepCalled = false;

  constructor(
    private readonly database: ISQLiteAnyDatabase,
    private readonly statement: NativeStatement,
    private firstRowValues: ISQLiteColumnValues | null,
    public readonly options: ISQLiteExecuteResultOptions,
  ) {}

  getFirstSync(): T | null {
    if (this.isStepCalled) {
      throw new Error(
        'The SQLite cursor has been shifted and is unable to retrieve the first row without being reset. Invoke `resetSync()` to reset the cursor first if you want to retrieve the first row.',
      );
    }
    const columnNames = this.getColumnNamesSync();
    const firstRowValues = this.popFirstRowValues();
    if (firstRowValues != null) {
      return composeRowIfNeeded<T>(
        this.options.rawResult,
        columnNames,
        firstRowValues,
      );
    }
    const firstRow = this.statement.stepSync(this.database);
    return firstRow != null
      ? composeRowIfNeeded<T>(
          this.options.rawResult,
          columnNames,
          processNativeRow(firstRow),
        )
      : null;
  }

  getAllSync(): T[] {
    if (this.isStepCalled) {
      throw new Error(
        'The SQLite cursor has been shifted and is unable to retrieve all rows without being reset. Invoke `resetSync()` to reset the cursor first if you want to retrieve all rows.',
      );
    }
    const firstRowValues = this.popFirstRowValues();
    if (firstRowValues == null) {
      return [];
    }
    const columnNames = this.getColumnNamesSync();
    const nativeRows = this.statement.getAllSync(this.database);
    const allRows = processNativeRows(nativeRows);
    if (firstRowValues.length > 0) {
      return composeRowsIfNeeded<T>(this.options.rawResult, columnNames, [
        firstRowValues,
        ...allRows,
      ]);
    }
    return composeRowsIfNeeded<T>(this.options.rawResult, columnNames, allRows);
  }

  *generatorSync(): IterableIterator<T> {
    const columnNames = this.getColumnNamesSync();
    const firstRowValues = this.popFirstRowValues();
    if (firstRowValues != null) {
      yield composeRowIfNeeded<T>(
        this.options.rawResult,
        columnNames,
        firstRowValues,
      );
    }
    let result;
    do {
      result = this.statement.stepSync(this.database);
      if (result != null) {
        yield composeRowIfNeeded<T>(
          this.options.rawResult,
          columnNames,
          processNativeRow(result),
        );
      }
    } while (result != null);
  }

  resetSync(): void {
    const result = this.statement.resetSync(this.database);
    this.isStepCalled = false;
    return result;
  }

  private popFirstRowValues(): ISQLiteColumnValues | null {
    if (this.firstRowValues != null) {
      const firstRowValues = this.firstRowValues;
      this.firstRowValues = null;
      return firstRowValues.length > 0 ? firstRowValues : null;
    }
    return null;
  }

  private getColumnNamesSync(): string[] {
    if (this.columnNames == null) {
      this.columnNames = this.statement.getColumnNamesSync();
    }
    return this.columnNames;
  }
}

function composeRowIfNeeded<T>(
  rawResult: boolean,
  columnNames: ISQLiteColumnNames,
  columnValues: ISQLiteColumnValues,
): T {
  // I/O edge: `rawResult` selects between two shapes of T (a row object, or `IValuesOf<T>`) that
  // only the caller's own generic parameter distinguishes — see the two call sites above.
  return rawResult
    ? (columnValues as T)
    : composeRow<T>(columnNames, columnValues);
}

function composeRowsIfNeeded<T>(
  rawResult: boolean,
  columnNames: ISQLiteColumnNames,
  columnValuesList: ISQLiteColumnValues[],
): T[] {
  return rawResult
    ? (columnValuesList as T[])
    : composeRows<T>(columnNames, columnValuesList);
}

function processNativeRow(nativeRow: ISQLiteColumnValues): ISQLiteColumnValues {
  return nativeRow.map(column =>
    column instanceof ArrayBuffer ? new Uint8Array(column) : column,
  );
}

function processNativeRows(
  nativeRows: ISQLiteColumnValues[],
): ISQLiteColumnValues[] {
  return nativeRows.map(processNativeRow);
}

//#endregion
