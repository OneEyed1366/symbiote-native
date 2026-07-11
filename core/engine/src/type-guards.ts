// Primitive runtime guards used throughout the engine to narrow `unknown` at trust
// boundaries (native payloads, ViewConfig attributes, style values) without an `as`
// cast. `isRecord` is the STRICT "plain object" definition — it excludes arrays,
// matching what most call sites actually mean by "a record" (a native payload keyed
// by string, never a list). A looser variant that let arrays through as records used
// to be duplicated independently across the engine; this is the single source of truth.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}
