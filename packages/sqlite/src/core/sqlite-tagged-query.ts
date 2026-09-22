// Ported from expo-sqlite's SQLiteTaggedQuery.ts (.vendors/expo @ origin/sdk-57,
// packages/expo-sqlite/src/SQLiteTaggedQuery.ts), renamed with this repo's `I`-prefix convention.
import type { ISQLiteBindValue, ISQLiteRunResult } from './native-statement';
import type { SQLiteDatabase } from './sqlite-database';
import { parseSQLQuery } from './query-utils';
import type { ISQLParsedInfo } from './query-utils';

/**
 * Returns `T[]` when a type parameter is explicitly given, or a union of the possible shapes
 * when relying on the default `unknown` type.
 */
type ISQLiteTaggedQueryResult<T> = [unknown] extends [T]
  ? unknown[] | ISQLiteRunResult
  : T[];

/**
 * A SQL query built from a tagged template literal, awaitable directly (returns an array of
 * objects by default) or reshaped via `.values()` / `.first()` / `.each()`. Bun's `sql` API is
 * the inspiration (credited upstream).
 *
 * @example
 * ```ts
 * const users = await sql`SELECT * FROM users WHERE age > ${21}`;
 * const values = await sql`SELECT name, age FROM users`.values(); // [["Alice", 30], ...]
 * const user = await sql`SELECT * FROM users WHERE id = ${1}`.first();
 * const users = await sql<User>`SELECT * FROM users`; // typed
 * const result = (await sql`INSERT INTO users (name) VALUES (${'Alice'})`) as ISQLiteRunResult;
 * const users = sql<User>`SELECT * FROM users WHERE age > ${21}`.allSync();
 * ```
 */
export class SQLiteTaggedQuery<T = unknown> implements PromiseLike<
  ISQLiteTaggedQueryResult<T>
> {
  private readonly source: string;
  private readonly params: ISQLiteBindValue[];
  private readonly parsedInfo: ISQLParsedInfo;

  constructor(
    private readonly database: SQLiteDatabase,
    strings: TemplateStringsArray,
    values: unknown[],
  ) {
    const sql = strings.join('?');
    this.source = sql;
    // I/O edge: a tagged-template interpolation site (`${...}`) is only constrained to
    // ISQLiteBindValue by the public overload of `SQLiteDatabase.sql`; nothing narrower can be
    // inferred from `TemplateStringsArray`'s own interpolated-value type (`unknown[]` by design).
    this.params = values as ISQLiteBindValue[];
    this.parsedInfo = parseSQLQuery(sql);
  }

  /**
   * Makes the query awaitable, returning rows or metadata depending on the query's shape — called
   * automatically when the tagged query is `await`ed.
   */
  then<TResult1 = ISQLiteTaggedQueryResult<T>, TResult2 = never>(
    onfulfilled?:
      | ((
          value: ISQLiteTaggedQueryResult<T>,
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    if (this.parsedInfo.canReturnRows) {
      return this.database
        .getAllAsync<T>(this.source, this.params)
        .then(rows => rows as ISQLiteTaggedQueryResult<T>)
        .then(onfulfilled, onrejected);
    }
    return this.database
      .runAsync(this.source, this.params)
      .then(result => result as ISQLiteTaggedQueryResult<T>)
      .then(onfulfilled, onrejected);
  }

  /**
   * Executes the query and returns rows as arrays of values (Bun-style) instead of objects.
   * @example
   * ```ts
   * const rows = await sql`SELECT name, age FROM users`.values(); // [["Alice", 30], ...]
   * ```
   */
  async values(): Promise<unknown[][]> {
    const statement = await this.database.prepareAsync(this.source);
    try {
      const result = await statement.executeForRawResultAsync(this.params);
      return await result.getAllAsync();
    } finally {
      await statement.finalizeAsync();
    }
  }

  /** Executes the query and returns the first row only, or `null` if no rows match. */
  async first(): Promise<T | null> {
    return this.database.getFirstAsync<T>(this.source, this.params);
  }

  /**
   * Executes the query and returns an async iterator over the rows.
   * @example
   * ```ts
   * for await (const user of sql`SELECT * FROM users`.each()) { console.log(user.name); }
   * ```
   */
  each(): AsyncIterableIterator<T> {
    return this.database.getEachAsync<T>(this.source, this.params);
  }

  //#region Synchronous variants

  /**
   * Executes the query synchronously, returning rows or metadata depending on the query's shape.
   * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
   */
  allSync(): ISQLiteTaggedQueryResult<T> {
    // I/O edge: see `ISQLiteTaggedQueryResult`'s own definition — the conditional type cannot be
    // narrowed from `canReturnRows`, a plain runtime boolean.
    return this.parsedInfo.canReturnRows
      ? (this.database.getAllSync<T>(
          this.source,
          this.params,
        ) as ISQLiteTaggedQueryResult<T>)
      : (this.database.runSync(
          this.source,
          this.params,
        ) as ISQLiteTaggedQueryResult<T>);
  }

  /**
   * Executes the query synchronously and returns rows as arrays of values.
   * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
   */
  valuesSync(): unknown[][] {
    const statement = this.database.prepareSync(this.source);
    try {
      const result = statement.executeForRawResultSync(this.params);
      return result.getAllSync();
    } finally {
      statement.finalizeSync();
    }
  }

  /**
   * Executes the query synchronously and returns the first row.
   * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
   */
  firstSync(): T | null {
    return this.database.getFirstSync<T>(this.source, this.params);
  }

  /**
   * Executes the query synchronously and returns an iterator.
   * > **Note:** Running heavy tasks with this function can block the JavaScript thread.
   */
  eachSync(): IterableIterator<T> {
    return this.database.getEachSync<T>(this.source, this.params);
  }

  //#endregion
}
