export function stringifyIfDate(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

function stringifyValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stringifyValue);
  if (isPlainObject(value)) return stringifyDateValues(value);
  return stringifyIfDate(value);
}

/** Recursively converts every `Date` field of `obj` to an ISO string for the native bridge. */
export function stringifyDateValues(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = stringifyValue(value);
  }
  return result;
}

/** `null` in a patch means "clear natively"; `undefined` means "leave alone" - see native
 * update()'s separate `nullableFields` param. */
export function splitNullableFields(patch: Record<string, unknown>): {
  record: Record<string, unknown>;
  nullableFields: string[];
} {
  const record: Record<string, unknown> = {};
  const nullableFields: string[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      nullableFields.push(key);
    } else if (value !== undefined) {
      record[key] = stringifyValue(value);
    }
  }
  return { record, nullableFields };
}
