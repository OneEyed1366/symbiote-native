import { warnOnce } from '../values.ts';
import type { IDeclarationContext, IStyleObject } from './style-types.ts';

// Keyed by file, as the entry point takes one declaration at a time and has no per-run `Set`
// A watch process warns once per (file, property) for its whole life
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

// The value still ships, but the engine drops it per node, so the author hears of it here
export function warnUnresolvable(
  context: IDeclarationContext,
  key: string,
  reason: string,
): void {
  warnOnce(
    warnedKeysFor(context.filename),
    key,
    `[@symbiote-native/css-parser] ${reason}, left unset at runtime`,
  );
}

/** Warns that the property has a value RN cannot express, and answers the empty style */
export function dropUnexpressible(
  context: IDeclarationContext,
  cssProperty: string,
): IStyleObject {
  warnDrop(
    context,
    cssProperty,
    `"${cssProperty}" has a value React Native cannot express`,
  );
  return {};
}
