// TODO(rn-port): RN's `flattenStyle` returns `undefined` for a falsy style and the same object
// for a single one, but callers here need a fresh non-null record, so it cannot be imported as is
// Recurses on the style position only, never on a property value (`transform` stays an array)

import { isRecord } from '../type-guards';

export function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    const result: Record<string, unknown> = {};
    for (const entry of style) {
      // Falsy entries (null/undefined/false/''/0) flatten to {} and contribute nothing.
      const flat = flattenStyle(entry);
      for (const key in flat) {
        result[key] = flat[key];
      }
    }
    return result;
  }

  if (isRecord(style)) {
    // Shallow copy of own enumerable keys: values (arrays, nested objects) pass through.
    return { ...style };
  }

  return {};
}
