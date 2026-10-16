import { warnOnce } from '../values.ts';
import type { IDeclarationContext } from './declaration-types.ts';

// Keyed by FILE, since the entry point takes one declaration at a time and has no per-run object
// A watch process then warns once per file and property for its whole life
const warnedByFile = new Map<string, Set<string>>();

export function warnedKeysFor(filename: string): Set<string> {
  const existing = warnedByFile.get(filename);
  if (existing) return existing;

  const created = new Set<string>();
  warnedByFile.set(filename, created);
  return created;
}

export function warnDrop(
  context: IDeclarationContext,
  key: string,
  reason: string,
): void {
  warnOnce(
    warnedKeysFor(context.filename),
    key,
    `[@symbiote-native/css-parser] ${reason}, dropped`,
  );
}
