// Readers for route params, which arrive as `unknown`: a value the panel could not have written
// reads as its default. Not the engine guards, whose barrel pulls native modules into a node run

export function isParamsRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function readChoice<T extends string>(
  record: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = record[key];
  return allowed.find(option => option === value) ?? fallback;
}

export function readFlag(
  record: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const value = record[key];
  return typeof value === 'boolean' ? value : fallback;
}

export function readText(
  record: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const value = record[key];
  return typeof value === 'string' ? value : fallback;
}

// A screen pushed as its own modal copy carries `isModal` in its params
export function readIsModal(params: unknown): boolean {
  return isParamsRecord(params) && readFlag(params, 'isModal', false);
}

export function readCount(
  record: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
