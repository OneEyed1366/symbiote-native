// Ported verbatim (logic unchanged) from expo-sqlite's paramUtils.ts (.vendors/expo @
// origin/sdk-57, packages/expo-sqlite/src/paramUtils.ts), renamed with this repo's `I`-prefix
// convention.
import type {
  ISQLiteBindBlobParams,
  ISQLiteBindBlobValue,
  ISQLiteBindPrimitiveParams,
  ISQLiteBindValue,
  ISQLiteColumnNames,
  ISQLiteColumnValues,
} from './native-statement';

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Normalizes bind params into `[primitiveParams, blobParams, shouldPassAsArray]` for the
 * native module. `params` is untyped because the public overloads
 * (`ISQLiteBindParams` vs. variadic `ISQLiteVariadicBindParams`) already constrain what a
 * type-checked caller can pass here — this only has to survive a caller that bypasses them.
 * @hidden
 */
export function normalizeParams(
  ...params: unknown[]
): [ISQLiteBindPrimitiveParams, ISQLiteBindBlobParams, boolean] {
  const rawParams: unknown = params.length > 1 ? params : params[0];
  let bindParams: unknown = rawParams ?? [];

  if (
    typeof bindParams !== 'object' ||
    bindParams === null ||
    bindParams instanceof ArrayBuffer ||
    ArrayBuffer.isView(bindParams)
  ) {
    bindParams = [bindParams];
  }

  const shouldPassAsArray = Array.isArray(bindParams);
  const entries: [string, unknown][] = Array.isArray(bindParams)
    ? bindParams.map((value, index): [string, unknown] => [
        String(index),
        value,
      ])
    : isPlainRecord(bindParams)
      ? Object.entries(bindParams)
      : [];

  const primitiveParams: ISQLiteBindPrimitiveParams = {};
  const blobParams: ISQLiteBindBlobParams = {};
  for (const [key, value] of entries) {
    if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
      blobParams[key] = value;
    } else if (typeof value === 'boolean') {
      primitiveParams[key] = value ? 1 : 0;
    } else if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number'
    ) {
      primitiveParams[key] = value;
    } else {
      // Not a recognized ISQLiteBindValue at this point (undefined, an object, an array, a
      // function...) — keep it as-is, matching upstream's `value ?? null`, which only guards
      // null/undefined and otherwise passes the value through untouched. Binding an invalid
      // value is the native bridge's problem at bind time; this function only reshapes params.
      // I/O edge: `value` is genuinely unknown here — a caller that bypassed the public
      // `ISQLiteBindParams` overloads is the only way to reach this branch.
      primitiveParams[key] = (value ?? null) as Exclude<
        ISQLiteBindValue,
        ISQLiteBindBlobValue
      >;
    }
  }

  return [primitiveParams, blobParams, shouldPassAsArray];
}

/**
 * Composes `columnNames` and `columnValues` into a row object.
 * @hidden
 */
export function composeRow<T>(
  columnNames: ISQLiteColumnNames,
  columnValues: ISQLiteColumnValues,
): T {
  const row: Record<string, unknown> = {};
  if (columnNames.length !== columnValues.length) {
    throw new Error(
      `Column names and values count mismatch. Names: ${columnNames.length}, Values: ${columnValues.length}`,
    );
  }
  for (let i = 0; i < columnNames.length; i++) {
    const columnName = columnNames[i];
    if (columnName != null) {
      row[columnName] = columnValues[i];
    }
  }
  // I/O edge: T is the caller-specified row shape (SQLiteStatement.executeAsync<T>, etc.) — the
  // native bridge has no way to describe it, so it is asserted here, at the narrowest point
  // native data enters the type system.
  return row as T;
}

/**
 * Composes `columnNames` and `columnValuesList` into an array of row objects.
 * @hidden
 */
export function composeRows<T>(
  columnNames: ISQLiteColumnNames,
  columnValuesList: ISQLiteColumnValues[],
): T[] {
  const firstRow = columnValuesList[0];
  if (firstRow == null) {
    return [];
  }
  if (columnNames.length !== firstRow.length) {
    // Only the first row is checked — SQLite returns the same column count for every row. A
    // shorter LATER row is not an error case (unlike composeRow's own check, which this
    // deliberately does NOT delegate to) — a missing trailing value just composes as
    // `undefined`, matching upstream's inline (non-composeRow) row construction here.
    throw new Error(
      `Column names and values count mismatch. Names: ${columnNames.length}, Values: ${firstRow.length}`,
    );
  }
  const results: T[] = [];
  for (const columnValues of columnValuesList) {
    const row: Record<string, unknown> = {};
    for (let i = 0; i < columnNames.length; i++) {
      const columnName = columnNames[i];
      if (columnName != null) {
        row[columnName] = columnValues[i];
      }
    }
    // I/O edge, same as composeRow above.
    results.push(row as T);
  }
  return results;
}

/**
 * Normalizes the index for `SQLiteStorage.getKeyByIndexAsync`/`getKeyByIndexSync`. `index` is
 * `unknown` (upstream types it `any`) because the function coerces defensively via `Number()` —
 * a caller reaching this from untyped host data (e.g. a `web` `Storage` polyfill) may hand it
 * anything.
 * @returns The normalized index, or `null` when out of bounds.
 * @hidden
 */
export function normalizeStorageIndex(index: unknown): number | null {
  const value = Math.floor(Number(index));

  if (Object.is(value, -0)) {
    return 0;
  }
  if (!Number.isSafeInteger(value)) {
    // Chromium uses a zero index when the index is out of bounds.
    return 0;
  }
  if (value < 0) {
    return null;
  }
  return value;
}
