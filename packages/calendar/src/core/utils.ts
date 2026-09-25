export function stringifyIfDate(value: Date): string;
export function stringifyIfDate(value: unknown): unknown;
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

/** `null` in a patch means "clear natively" - the native `update()` needs the field named
 * separately, in addition to staying in the stringified record with its `null` value. */
export function getNullableDetailsFields(
  details: Record<string, unknown>,
): string[] {
  return Object.keys(details).filter(key => details[key] === null);
}
